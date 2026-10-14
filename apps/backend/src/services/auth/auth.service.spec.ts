import { AuthService } from './auth.service';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { AuthProviderManager } from '@gitroom/backend/services/auth/providers/providers.manager';
import { InstanceSettingsService } from '@gitroom/nestjs-libraries/database/prisma/instance-settings/instance-settings.service';

jest.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/instance-settings/instance-settings.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({}));
jest.mock('@gitroom/backend/services/auth/providers/providers.manager', () => ({}));
jest.mock('@gitroom/nestjs-libraries/newsletter/newsletter.service', () => ({
  NewsletterService: { register: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@gitroom/helpers/auth/auth.service', () => ({
  AuthService: {
    signJWT: jest.fn(() => 'signed-jwt'),
    verifyJWT: jest.fn(),
    comparePassword: jest.fn(() => true),
  },
}));

type Policy = {
  allowed: boolean;
  restricted: boolean;
  defaultOrganizationId: string | null;
};

const LOCAL_CLOSED =
  'Registration with email and password is disabled; ask an administrator for an account';

describe('AuthService allowed email domains', () => {
  const users = {
    getUserByEmail: jest.fn(),
    getUserByProvider: jest.fn(),
  };
  const orgs = {
    getCount: jest.fn(),
    createOrgAndUser: jest.fn(),
    createUserInOrg: jest.fn(),
    addUserToOrg: jest.fn(),
  };
  const email = { sendEmailSync: jest.fn() };
  const providerInstance = { getUser: jest.fn(), postRegistration: jest.fn() };
  const providers = { getProvider: jest.fn(() => providerInstance) };
  const settings = { getRegistrationPolicy: jest.fn() };

  const service = new AuthService(
    users as unknown as UsersService,
    orgs as unknown as OrganizationService,
    email as unknown as EmailService,
    providers as unknown as AuthProviderManager,
    settings as unknown as InstanceSettingsService
  );

  const policy = (value: Policy) =>
    settings.getRegistrationPolicy.mockResolvedValue(value);

  const localRegister = (mail: string) =>
    Object.assign(new CreateOrgUserDto(), {
      email: mail,
      password: 'secret123',
      provider: 'LOCAL',
      company: 'Acme',
    });

  const providerRegister = () =>
    Object.assign(new CreateOrgUserDto(), {
      provider: 'GOOGLE',
      providerToken: 'google-token',
      company: 'Acme',
    });

  const invite = { orgId: 'invite-org', role: 'ADMIN' as const, id: 'inv1' };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DISABLE_REGISTRATION;
    users.getUserByEmail.mockResolvedValue(null);
    users.getUserByProvider.mockResolvedValue(null);
    orgs.getCount.mockResolvedValue(1);
    orgs.createOrgAndUser.mockResolvedValue({
      id: 'new-org',
      users: [{ user: { id: 'new-user', email: 'x' } }],
    });
    orgs.createUserInOrg.mockResolvedValue({ id: 'joined-user', email: 'x' });
    orgs.addUserToOrg.mockResolvedValue({ organizationId: 'invite-org' });
    providerInstance.getUser.mockResolvedValue({
      id: 'google-id',
      email: 'ana@laica.io',
      emailVerified: true,
    });
    policy({ allowed: true, restricted: false, defaultOrganizationId: null });
  });

  describe('empty allowlist (open, as today)', () => {
    it('LOCAL register creates a new org and user', async () => {
      const result = await service.routeAuth(
        'LOCAL',
        localRegister('Ana@Gmail.com'),
        'ip',
        'agent'
      );
      expect(settings.getRegistrationPolicy).toHaveBeenCalledWith('ana@gmail.com');
      expect(orgs.createOrgAndUser).toHaveBeenCalledTimes(1);
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
      expect(result).toEqual({ addedOrg: false, jwt: 'signed-jwt' });
    });

    it('provider register creates a new org and user', async () => {
      await service.routeAuth('GOOGLE', providerRegister(), 'ip', 'agent');
      expect(orgs.createOrgAndUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ana@laica.io',
          provider: 'GOOGLE',
          providerId: 'google-id',
        }),
        'ip',
        'agent'
      );
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
      expect(providerInstance.postRegistration).toHaveBeenCalledWith(
        'google-token',
        'new-org'
      );
    });

    it('provider register ignores an unverified email, as today', async () => {
      providerInstance.getUser.mockResolvedValue({
        id: 'g3',
        email: 'a@gmail.com',
        emailVerified: false,
      });
      await service.routeAuth('GOOGLE', providerRegister(), 'ip', 'agent');
      expect(orgs.createOrgAndUser).toHaveBeenCalledTimes(1);
    });

    it('still honours DISABLE_REGISTRATION', async () => {
      process.env.DISABLE_REGISTRATION = 'true';
      await expect(
        service.routeAuth('LOCAL', localRegister('a@gmail.com'), 'ip', 'agent')
      ).rejects.toThrow('Registration is disabled');
      expect(orgs.createOrgAndUser).not.toHaveBeenCalled();
    });
  });

  describe('disallowed domain', () => {
    beforeEach(() =>
      policy({ allowed: false, restricted: true, defaultOrganizationId: null })
    );

    it('rejects a LOCAL register', async () => {
      await expect(
        service.routeAuth('LOCAL', localRegister('a@gmail.com'), 'ip', 'agent')
      ).rejects.toThrow(LOCAL_CLOSED);
      expect(orgs.createOrgAndUser).not.toHaveBeenCalled();
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
      expect(email.sendEmailSync).not.toHaveBeenCalled();
    });

    it('rejects a LOCAL register even with an invite cookie', async () => {
      await expect(
        service.routeAuth('LOCAL', localRegister('a@gmail.com'), 'ip', 'agent', invite)
      ).rejects.toThrow(LOCAL_CLOSED);
      expect(orgs.addUserToOrg).not.toHaveBeenCalled();
    });

    it('rejects a new provider user', async () => {
      providerInstance.getUser.mockResolvedValue({ id: 'g2', email: 'a@gmail.com' });
      await expect(
        service.routeAuth('GOOGLE', providerRegister(), 'ip', 'agent')
      ).rejects.toThrow('Email domain not allowed');
      expect(settings.getRegistrationPolicy).toHaveBeenCalledWith('a@gmail.com');
      expect(orgs.createOrgAndUser).not.toHaveBeenCalled();
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
    });

    it('still logs in an existing provider user from a now-disallowed domain', async () => {
      providerInstance.getUser.mockResolvedValue({ id: 'g2', email: 'a@gmail.com' });
      users.getUserByProvider.mockResolvedValue({ id: 'existing', email: 'a@gmail.com' });
      await expect(
        service.routeAuth('GOOGLE', providerRegister(), 'ip', 'agent')
      ).resolves.toEqual({ addedOrg: false, jwt: 'signed-jwt' });
      expect(settings.getRegistrationPolicy).not.toHaveBeenCalled();
      expect(orgs.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('still logs in an existing LOCAL user from a now-disallowed domain', async () => {
      users.getUserByEmail.mockResolvedValue({
        id: 'existing',
        email: 'a@gmail.com',
        password: 'hash',
        activated: true,
      });
      await expect(
        service.routeAuth(
          'LOCAL',
          { email: 'a@gmail.com', password: 'secret123', provider: 'LOCAL' } as any,
          'ip',
          'agent'
        )
      ).resolves.toEqual({ addedOrg: false, jwt: 'signed-jwt' });
      expect(settings.getRegistrationPolicy).not.toHaveBeenCalled();
    });
  });

  describe('allowed domain with a default organization', () => {
    beforeEach(() =>
      policy({ allowed: true, restricted: true, defaultOrganizationId: 'default-org' })
    );

    it('rejects LOCAL self-registration, even for an allowed domain', async () => {
      await expect(
        service.routeAuth('LOCAL', localRegister('ana@laica.io'), 'ip', 'agent')
      ).rejects.toThrow(LOCAL_CLOSED);
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
      expect(orgs.createOrgAndUser).not.toHaveBeenCalled();
      expect(email.sendEmailSync).not.toHaveBeenCalled();
    });

    it('rejects LOCAL self-registration with an invite cookie', async () => {
      await expect(
        service.routeAuth('LOCAL', localRegister('ana@laica.io'), 'ip', 'agent', invite)
      ).rejects.toThrow(LOCAL_CLOSED);
      expect(orgs.addUserToOrg).not.toHaveBeenCalled();
    });

    it('a provider user with a verified email joins the default org as USER', async () => {
      await service.routeAuth('GOOGLE', providerRegister(), 'ip', 'agent');
      expect(orgs.createUserInOrg).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ana@laica.io',
          provider: 'GOOGLE',
          providerId: 'google-id',
          password: '',
        }),
        'default-org',
        'USER',
        'ip',
        'agent'
      );
      expect(orgs.createOrgAndUser).not.toHaveBeenCalled();
      expect(providerInstance.postRegistration).not.toHaveBeenCalled();
    });

    it('rejects a provider user whose email is not verified', async () => {
      providerInstance.getUser.mockResolvedValue({
        id: 'g4',
        email: 'ana@laica.io',
        emailVerified: false,
      });
      await expect(
        service.routeAuth('GOOGLE', providerRegister(), 'ip', 'agent')
      ).rejects.toThrow('Email domain not allowed');
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
      expect(orgs.createOrgAndUser).not.toHaveBeenCalled();
    });

    it('a provider without a verified flag does not join the default org', async () => {
      providerInstance.getUser.mockResolvedValue({ id: 'gh1', email: 'ana@laica.io' });
      await service.routeAuth('GITHUB' as any, providerRegister(), 'ip', 'agent');
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
      expect(orgs.createOrgAndUser).toHaveBeenCalledTimes(1);
    });

    it('keeps the invite behaviour for a verified provider user', async () => {
      const result = await service.routeAuth(
        'GOOGLE',
        providerRegister(),
        'ip',
        'agent',
        invite
      );
      expect(orgs.createOrgAndUser).toHaveBeenCalledTimes(1);
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
      expect(orgs.addUserToOrg).toHaveBeenCalledWith(
        'new-user',
        'inv1',
        'invite-org',
        'ADMIN'
      );
      expect(result.addedOrg).toEqual({ organizationId: 'invite-org' });
    });
  });

  describe('allowed domain without a default organization', () => {
    it('falls back to createOrgAndUser for a provider user', async () => {
      policy({ allowed: true, restricted: true, defaultOrganizationId: null });
      await service.routeAuth('GOOGLE', providerRegister(), 'ip', 'agent');
      expect(orgs.createOrgAndUser).toHaveBeenCalledTimes(1);
      expect(orgs.createUserInOrg).not.toHaveBeenCalled();
    });
  });
});
