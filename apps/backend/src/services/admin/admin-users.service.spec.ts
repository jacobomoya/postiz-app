import { Prisma } from '@prisma/client';
import { compareSync } from 'bcrypt';
import { AdminUsersService } from '@gitroom/nestjs-libraries/database/prisma/admin-users/admin-users.service';
import { AdminUsersRepository } from '@gitroom/nestjs-libraries/database/prisma/admin-users/admin-users.repository';
import { InstanceSettingsService } from '@gitroom/nestjs-libraries/database/prisma/instance-settings/instance-settings.service';

jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({}));

const safeUser = {
  id: 'user-1',
  email: 'ana@gmail.com',
  name: 'Ana',
  providerName: 'LOCAL',
  activated: true,
  isSuperAdmin: false,
  lastOnline: new Date('2026-10-01T00:00:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
};

describe('AdminUsersService', () => {
  const repository = {
    listUsers: jest.fn(),
    getUserById: jest.fn(),
    getLocalUserByEmail: jest.fn(),
    getActiveOrganization: jest.fn(),
    listOrganizations: jest.fn(),
    createLocalUser: jest.fn(),
    setPasswordHash: jest.fn(),
    updateUser: jest.fn(),
    countOtherActiveSuperAdmins: jest.fn(),
    getMembership: jest.fn(),
    countOtherEnabledOrgSuperAdmins: jest.fn(),
    updateMembership: jest.fn(),
    addMembership: jest.fn(),
  };
  const instanceSettings = {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  };
  const service = new AdminUsersService(
    repository as unknown as AdminUsersRepository,
    instanceSettings as unknown as InstanceSettingsService
  );

  beforeEach(() => {
    Object.values(repository).forEach((fn) => fn.mockReset());
    Object.values(instanceSettings).forEach((fn) => fn.mockReset());
    repository.getActiveOrganization.mockResolvedValue({ id: 'org-1', name: 'Solucionia' });
    repository.getLocalUserByEmail.mockResolvedValue(null);
    repository.getUserById.mockResolvedValue(safeUser);
    repository.createLocalUser.mockImplementation(async (data) => ({
      ...safeUser,
      email: data.email,
      name: data.name,
    }));
    repository.countOtherActiveSuperAdmins.mockResolvedValue(1);
    repository.countOtherEnabledOrgSuperAdmins.mockResolvedValue(1);
  });

  describe('listUsers', () => {
    beforeEach(() => {
      repository.listUsers.mockResolvedValue({
        users: [
          {
            ...safeUser,
            password: 'should-never-leak',
            organizations: [
              { organizationId: 'org-1', role: 'ADMIN', disabled: false, organization: { name: 'Solucionia' } },
            ],
          },
        ],
        total: 1,
      });
    });

    it('returns users with memberships and without any password field', async () => {
      const result = await service.listUsers({});
      expect(result).toEqual({
        items: [
          {
            ...safeUser,
            memberships: [
              { organizationId: 'org-1', organizationName: 'Solucionia', role: 'ADMIN', disabled: false },
            ],
          },
        ],
        total: 1,
        page: 0,
        pageSize: 20,
        hasMore: false,
      });
      expect(JSON.stringify(result)).not.toContain('password');
      expect(JSON.stringify(result)).not.toContain('should-never-leak');
    });

    it('passes a trimmed search and paginates with a page size capped at 100', async () => {
      await service.listUsers({ search: '  Ana ', page: 2, pageSize: 500 });
      expect(repository.listUsers).toHaveBeenCalledWith({ search: 'Ana', skip: 200, take: 100 });
    });

    it('falls back to sane paging for invalid numbers', async () => {
      await service.listUsers({ search: '   ', page: -3, pageSize: Number.NaN });
      expect(repository.listUsers).toHaveBeenCalledWith({ search: undefined, skip: 0, take: 20 });
    });
  });

  describe('createUser', () => {
    const body = {
      email: '  Ana@Gmail.com ',
      password: 'correct-horse',
      name: ' Ana ',
      organizationId: 'org-1',
      role: 'ADMIN' as const,
    };

    it('creates an activated LOCAL user with a bcrypt hash and the requested role', async () => {
      const result = await service.createUser(body);
      expect(repository.createLocalUser).toHaveBeenCalledTimes(1);
      const data = repository.createLocalUser.mock.calls[0][0];
      expect(data).toMatchObject({
        email: 'ana@gmail.com',
        name: 'Ana',
        organizationId: 'org-1',
        role: 'ADMIN',
      });
      expect(data.passwordHash).not.toBe('correct-horse');
      expect(compareSync('correct-horse', data.passwordHash)).toBe(true);
      expect(result).toEqual({ ...safeUser, email: 'ana@gmail.com', name: 'Ana' });
    });

    it.each(['USER', 'SUPERADMIN'] as const)('assigns the %s role', async (role) => {
      await service.createUser({ ...body, role });
      expect(repository.createLocalUser.mock.calls[0][0].role).toBe(role);
    });

    it('does not apply the email domain allowlist', async () => {
      await service.createUser(body);
      expect(instanceSettings.getSettings).not.toHaveBeenCalled();
      expect(repository.createLocalUser).toHaveBeenCalled();
    });

    it('rejects a duplicate LOCAL email with 409', async () => {
      repository.getLocalUserByEmail.mockResolvedValue({ id: 'existing' });
      await expect(service.createUser(body)).rejects.toMatchObject({ status: 409 });
      expect(repository.getLocalUserByEmail).toHaveBeenCalledWith('ana@gmail.com');
      expect(repository.createLocalUser).not.toHaveBeenCalled();
    });

    it('maps a unique-constraint race on create to 409', async () => {
      repository.createLocalUser.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        })
      );
      await expect(service.createUser(body)).rejects.toMatchObject({ status: 409 });
    });

    it('rejects a missing or deleted organization with 400', async () => {
      repository.getActiveOrganization.mockResolvedValue(null);
      await expect(service.createUser(body)).rejects.toMatchObject({ status: 400 });
      expect(repository.createLocalUser).not.toHaveBeenCalled();
    });

    it('rejects a short password with 400', async () => {
      await expect(service.createUser({ ...body, password: 'short' })).rejects.toMatchObject({
        status: 400,
      });
      expect(repository.createLocalUser).not.toHaveBeenCalled();
    });
  });

  describe('setPassword', () => {
    it('stores a bcrypt hash for a LOCAL user', async () => {
      await expect(service.setPassword('user-1', 'new-password')).resolves.toEqual({ success: true });
      const [id, hash] = repository.setPasswordHash.mock.calls[0];
      expect(id).toBe('user-1');
      expect(compareSync('new-password', hash)).toBe(true);
    });

    it('rejects non-LOCAL users with 400', async () => {
      repository.getUserById.mockResolvedValue({ ...safeUser, providerName: 'GOOGLE' });
      await expect(service.setPassword('user-1', 'new-password')).rejects.toMatchObject({ status: 400 });
      expect(repository.setPasswordHash).not.toHaveBeenCalled();
    });

    it('rejects a short password with 400', async () => {
      await expect(service.setPassword('user-1', 'short')).rejects.toMatchObject({ status: 400 });
      expect(repository.setPasswordHash).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown user', async () => {
      repository.getUserById.mockResolvedValue(null);
      await expect(service.setPassword('missing', 'new-password')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('updateMembership', () => {
    const membership = (role: string, disabled = false) => ({
      userId: 'user-1',
      organizationId: 'org-1',
      role,
      disabled,
    });

    beforeEach(() => {
      repository.updateMembership.mockImplementation(async (userId, organizationId, data) => ({
        ...membership('ADMIN'),
        ...data,
      }));
    });

    it('changes the role', async () => {
      repository.getMembership.mockResolvedValue(membership('USER'));
      await expect(service.updateMembership('user-1', 'org-1', { role: 'ADMIN' })).resolves.toMatchObject({
        role: 'ADMIN',
      });
      expect(repository.updateMembership).toHaveBeenCalledWith('user-1', 'org-1', { role: 'ADMIN' });
    });

    it('disables and re-enables a membership', async () => {
      repository.getMembership.mockResolvedValue(membership('USER'));
      await service.updateMembership('user-1', 'org-1', { disabled: true });
      expect(repository.updateMembership).toHaveBeenLastCalledWith('user-1', 'org-1', { disabled: true });

      repository.getMembership.mockResolvedValue(membership('USER', true));
      await service.updateMembership('user-1', 'org-1', { disabled: false });
      expect(repository.updateMembership).toHaveBeenLastCalledWith('user-1', 'org-1', { disabled: false });
    });

    it.each([
      ['demoting', { role: 'ADMIN' as const }],
      ['disabling', { disabled: true }],
    ])('refuses %s the last enabled SUPERADMIN of an organization with 400', async (_label, body) => {
      repository.getMembership.mockResolvedValue(membership('SUPERADMIN'));
      repository.countOtherEnabledOrgSuperAdmins.mockResolvedValue(0);
      await expect(service.updateMembership('user-1', 'org-1', body)).rejects.toMatchObject({ status: 400 });
      expect(repository.countOtherEnabledOrgSuperAdmins).toHaveBeenCalledWith('org-1', 'user-1');
      expect(repository.updateMembership).not.toHaveBeenCalled();
    });

    it('allows demoting a SUPERADMIN when another enabled one remains', async () => {
      repository.getMembership.mockResolvedValue(membership('SUPERADMIN'));
      repository.countOtherEnabledOrgSuperAdmins.mockResolvedValue(1);
      await service.updateMembership('user-1', 'org-1', { role: 'USER' });
      expect(repository.updateMembership).toHaveBeenCalledWith('user-1', 'org-1', { role: 'USER' });
    });

    it('returns 404 when the membership does not exist', async () => {
      repository.getMembership.mockResolvedValue(null);
      await expect(service.updateMembership('user-1', 'org-1', { role: 'USER' })).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects an empty change with 400', async () => {
      repository.getMembership.mockResolvedValue(membership('USER'));
      await expect(service.updateMembership('user-1', 'org-1', {})).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('addMembership', () => {
    it('adds an existing user to another organization', async () => {
      repository.getMembership.mockResolvedValue(null);
      repository.addMembership.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-2',
        role: 'USER',
        disabled: false,
      });
      repository.getActiveOrganization.mockResolvedValue({ id: 'org-2', name: 'Laica' });
      await expect(
        service.addMembership('user-1', { organizationId: 'org-2', role: 'USER' })
      ).resolves.toMatchObject({ organizationId: 'org-2', role: 'USER' });
      expect(repository.addMembership).toHaveBeenCalledWith('user-1', 'org-2', 'USER');
    });

    it('returns 409 when the user is already a member', async () => {
      repository.getMembership.mockResolvedValue({ userId: 'user-1', organizationId: 'org-2', role: 'USER', disabled: true });
      await expect(
        service.addMembership('user-1', { organizationId: 'org-2', role: 'USER' })
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.addMembership).not.toHaveBeenCalled();
    });

    it('returns 400 for a missing organization and 404 for a missing user', async () => {
      repository.getActiveOrganization.mockResolvedValueOnce(null);
      await expect(
        service.addMembership('user-1', { organizationId: 'gone', role: 'USER' })
      ).rejects.toMatchObject({ status: 400 });

      repository.getUserById.mockResolvedValueOnce(null);
      await expect(
        service.addMembership('missing', { organizationId: 'org-1', role: 'USER' })
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.addMembership).not.toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    const superAdmin = { ...safeUser, id: 'admin-1', isSuperAdmin: true };

    beforeEach(() => {
      repository.updateUser.mockImplementation(async (id, data) => ({ ...safeUser, id, ...data }));
    });

    it('grants super-admin to another user', async () => {
      await expect(service.updateUser('admin-1', 'user-1', { isSuperAdmin: true })).resolves.toMatchObject({
        isSuperAdmin: true,
      });
      expect(repository.updateUser).toHaveBeenCalledWith('user-1', { isSuperAdmin: true });
    });

    it.each([
      ['removing their own super-admin flag', { isSuperAdmin: false }],
      ['deactivating themselves', { activated: false }],
    ])('blocks a super-admin %s with 400', async (_label, body) => {
      repository.getUserById.mockResolvedValue(superAdmin);
      await expect(service.updateUser('admin-1', 'admin-1', body)).rejects.toMatchObject({ status: 400 });
      expect(repository.updateUser).not.toHaveBeenCalled();
    });

    it.each([
      ['revoking', { isSuperAdmin: false }],
      ['deactivating', { activated: false }],
    ])('refuses %s the last active super-admin with 400', async (_label, body) => {
      repository.getUserById.mockResolvedValue(superAdmin);
      repository.countOtherActiveSuperAdmins.mockResolvedValue(0);
      await expect(service.updateUser('other-admin', 'admin-1', body)).rejects.toMatchObject({ status: 400 });
      expect(repository.countOtherActiveSuperAdmins).toHaveBeenCalledWith('admin-1');
      expect(repository.updateUser).not.toHaveBeenCalled();
    });

    it('revokes another super-admin when one active super-admin remains', async () => {
      repository.getUserById.mockResolvedValue(superAdmin);
      repository.countOtherActiveSuperAdmins.mockResolvedValue(1);
      await service.updateUser('other-admin', 'admin-1', { isSuperAdmin: false });
      expect(repository.updateUser).toHaveBeenCalledWith('admin-1', { isSuperAdmin: false });
    });

    it('deactivates and reactivates a regular user', async () => {
      await service.updateUser('admin-1', 'user-1', { activated: false });
      expect(repository.updateUser).toHaveBeenLastCalledWith('user-1', { activated: false });
      await service.updateUser('admin-1', 'user-1', { activated: true });
      expect(repository.updateUser).toHaveBeenLastCalledWith('user-1', { activated: true });
      expect(repository.countOtherActiveSuperAdmins).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown user and 400 for an empty change', async () => {
      await expect(service.updateUser('admin-1', 'user-1', {})).rejects.toMatchObject({ status: 400 });
      repository.getUserById.mockResolvedValue(null);
      await expect(service.updateUser('admin-1', 'missing', { activated: true })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('registration settings and organizations', () => {
    it('returns the instance settings', async () => {
      instanceSettings.getSettings.mockResolvedValue({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: 'org-1',
      });
      await expect(service.getRegistrationSettings()).resolves.toEqual({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: 'org-1',
      });
    });

    it('passes only the known fields to updateSettings', async () => {
      instanceSettings.updateSettings.mockResolvedValue({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: null,
      });
      await service.updateRegistrationSettings({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: null,
        extra: 'ignored',
      } as any);
      expect(instanceSettings.updateSettings).toHaveBeenCalledWith({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: null,
      });
    });

    it('keeps omitted settings fields omitted', async () => {
      await service.updateRegistrationSettings({ allowedEmailDomains: [] });
      expect(instanceSettings.updateSettings).toHaveBeenCalledWith({ allowedEmailDomains: [] });
    });

    it('lists active organizations', async () => {
      repository.listOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Solucionia' }]);
      await expect(service.listOrganizations()).resolves.toEqual([{ id: 'org-1', name: 'Solucionia' }]);
    });
  });
});
