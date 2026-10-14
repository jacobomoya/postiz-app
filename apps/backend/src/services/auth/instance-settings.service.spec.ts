import {
  InstanceSettingsService,
  getEmailDomain,
  normalizeEmailDomains,
} from '@gitroom/nestjs-libraries/database/prisma/instance-settings/instance-settings.service';
import { InstanceSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/instance-settings/instance-settings.repository';

jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({}));

describe('InstanceSettingsService', () => {
  const repository = {
    getSettings: jest.fn(),
    upsertSettings: jest.fn(),
    getActiveOrganization: jest.fn(),
  };
  const service = new InstanceSettingsService(
    repository as unknown as InstanceSettingsRepository
  );

  beforeEach(() => {
    repository.getSettings.mockReset().mockResolvedValue(null);
    repository.upsertSettings
      .mockReset()
      .mockImplementation(async (data) => data);
    repository.getActiveOrganization
      .mockReset()
      .mockResolvedValue({ id: 'org-1', name: 'Solucionia' });
  });

  describe('getSettings', () => {
    it('returns defaults when no settings row exists', async () => {
      await expect(service.getSettings()).resolves.toEqual({
        allowedEmailDomains: [],
        defaultOrganizationId: null,
      });
    });

    it('returns the stored settings', async () => {
      repository.getSettings.mockResolvedValue({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: 'org-1',
      });
      await expect(service.getSettings()).resolves.toEqual({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: 'org-1',
      });
    });
  });

  describe('updateSettings', () => {
    it('normalises domains: trim, lower-case, strip leading @, dedupe', async () => {
      await service.updateSettings({
        allowedEmailDomains: [
          '  Solucionia.AI ',
          '@laica.io',
          'LAICA.IO',
          'vetmonitor.ai',
          '',
        ],
      });
      expect(repository.upsertSettings).toHaveBeenCalledWith({
        allowedEmailDomains: ['solucionia.ai', 'laica.io', 'vetmonitor.ai'],
        defaultOrganizationId: null,
      });
    });

    it.each(['not a domain', 'localhost', 'foo@bar.com', '-bad.com', 'a..b.com', 'bad-.com'])(
      'rejects an invalid domain (%j) with 400',
      async (domain) => {
        await expect(
          service.updateSettings({ allowedEmailDomains: [domain] })
        ).rejects.toMatchObject({ status: 400 });
        expect(repository.upsertSettings).not.toHaveBeenCalled();
      }
    );

    it('keeps fields that are not provided', async () => {
      repository.getSettings.mockResolvedValue({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: 'org-1',
      });
      await service.updateSettings({ allowedEmailDomains: ['solucionia.ai'] });
      expect(repository.upsertSettings).toHaveBeenCalledWith({
        allowedEmailDomains: ['solucionia.ai'],
        defaultOrganizationId: 'org-1',
      });
    });

    it('validates that the default organization exists and is not deleted', async () => {
      repository.getActiveOrganization.mockResolvedValue(null);
      await expect(
        service.updateSettings({ defaultOrganizationId: 'missing' })
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.getActiveOrganization).toHaveBeenCalledWith('missing');
      expect(repository.upsertSettings).not.toHaveBeenCalled();
    });

    it('stores a valid default organization and allows clearing it with null', async () => {
      await service.updateSettings({ defaultOrganizationId: 'org-1' });
      expect(repository.upsertSettings).toHaveBeenLastCalledWith({
        allowedEmailDomains: [],
        defaultOrganizationId: 'org-1',
      });

      await service.updateSettings({ defaultOrganizationId: null });
      expect(repository.upsertSettings).toHaveBeenLastCalledWith({
        allowedEmailDomains: [],
        defaultOrganizationId: null,
      });
    });
  });

  describe('isEmailAllowed', () => {
    it('allows every email when the list is empty', async () => {
      await expect(service.isEmailAllowed('anyone@gmail.com')).resolves.toBe(true);
    });

    it('matches the domain after the last @, case-insensitively and exactly', async () => {
      repository.getSettings.mockResolvedValue({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: null,
      });
      await expect(service.isEmailAllowed('Ana@LAICA.io')).resolves.toBe(true);
      await expect(service.isEmailAllowed('"a@b"@laica.io')).resolves.toBe(true);
      await expect(service.isEmailAllowed('ana@sub.laica.io')).resolves.toBe(false);
      await expect(service.isEmailAllowed('ana@laica.io.evil.com')).resolves.toBe(false);
      await expect(service.isEmailAllowed('ana@gmail.com')).resolves.toBe(false);
      await expect(service.isEmailAllowed('no-at-sign')).resolves.toBe(false);
      await expect(service.isEmailAllowed('')).resolves.toBe(false);
    });
  });

  describe('getRegistrationPolicy', () => {
    it('is open with no default organization when the list is empty', async () => {
      repository.getSettings.mockResolvedValue({
        allowedEmailDomains: [],
        defaultOrganizationId: 'org-1',
      });
      await expect(service.getRegistrationPolicy('a@gmail.com')).resolves.toEqual({
        allowed: true,
        defaultOrganizationId: null,
      });
    });

    it('returns the default organization for an allowed domain', async () => {
      repository.getSettings.mockResolvedValue({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: 'org-1',
      });
      await expect(service.getRegistrationPolicy('a@laica.io')).resolves.toEqual({
        allowed: true,
        defaultOrganizationId: 'org-1',
      });
    });

    it('ignores a default organization that no longer exists', async () => {
      repository.getSettings.mockResolvedValue({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: 'org-1',
      });
      repository.getActiveOrganization.mockResolvedValue(null);
      await expect(service.getRegistrationPolicy('a@laica.io')).resolves.toEqual({
        allowed: true,
        defaultOrganizationId: null,
      });
    });

    it('rejects a domain outside the list', async () => {
      repository.getSettings.mockResolvedValue({
        allowedEmailDomains: ['laica.io'],
        defaultOrganizationId: 'org-1',
      });
      await expect(service.getRegistrationPolicy('a@gmail.com')).resolves.toEqual({
        allowed: false,
        defaultOrganizationId: null,
      });
    });
  });

  describe('helpers', () => {
    it('getEmailDomain returns the lower-cased part after the last @', () => {
      expect(getEmailDomain(' Ana@Laica.IO ')).toBe('laica.io');
      expect(getEmailDomain('nope')).toBeNull();
      expect(getEmailDomain('ana@')).toBeNull();
    });

    it('normalizeEmailDomains dedupes after normalising', () => {
      expect(normalizeEmailDomains(['@A.com', 'a.com ', 'b.com'])).toEqual([
        'a.com',
        'b.com',
      ]);
    });
  });
});
