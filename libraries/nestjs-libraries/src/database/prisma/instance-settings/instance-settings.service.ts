import { BadRequestException, Injectable } from '@nestjs/common';
import {
  InstanceSettingsRepository,
  InstanceSettingsValues,
} from '@gitroom/nestjs-libraries/database/prisma/instance-settings/instance-settings.repository';

export type { InstanceSettingsValues };

export interface UpdateInstanceSettingsInput {
  // Omitted keeps the stored list; an empty list opens registration.
  allowedEmailDomains?: string[];
  // Omitted keeps the stored value; null clears it.
  defaultOrganizationId?: string | null;
}

export interface RegistrationPolicy {
  // Whether a new account may be created for this email.
  allowed: boolean;
  // Organization the new user must join as USER, or null to create a new org.
  defaultOrganizationId: string | null;
}

const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Lower-cased part after the last "@", or null when there is none.
export const getEmailDomain = (email: string): string | null => {
  const value = (email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at === -1) {
    return null;
  }
  const domain = value.slice(at + 1);
  return domain || null;
};

// Trims, lower-cases, strips a leading "@", drops blanks and duplicates, and
// rejects anything that is not a plain domain name.
export const normalizeEmailDomains = (domains: string[]): string[] => {
  const normalized = new Set<string>();
  for (const raw of domains || []) {
    const domain = String(raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    if (!domain) {
      continue;
    }
    if (!DOMAIN_PATTERN.test(domain)) {
      throw new BadRequestException(`Invalid email domain: ${domain}`);
    }
    normalized.add(domain);
  }
  return [...normalized];
};

// Exact, case-insensitive match; an empty list allows everything.
const isDomainAllowed = (email: string, allowedEmailDomains: string[]) => {
  if (!allowedEmailDomains.length) {
    return true;
  }
  const domain = getEmailDomain(email);
  return !!domain && allowedEmailDomains.includes(domain);
};

@Injectable()
export class InstanceSettingsService {
  constructor(private _repository: InstanceSettingsRepository) {}

  async getSettings(): Promise<InstanceSettingsValues> {
    const settings = await this._repository.getSettings();
    return {
      allowedEmailDomains: settings?.allowedEmailDomains || [],
      defaultOrganizationId: settings?.defaultOrganizationId || null,
    };
  }

  async updateSettings(
    input: UpdateInstanceSettingsInput
  ): Promise<InstanceSettingsValues> {
    const current = await this.getSettings();

    const allowedEmailDomains =
      input.allowedEmailDomains === undefined
        ? current.allowedEmailDomains
        : normalizeEmailDomains(input.allowedEmailDomains);

    let defaultOrganizationId = current.defaultOrganizationId;
    if (input.defaultOrganizationId !== undefined) {
      defaultOrganizationId = input.defaultOrganizationId || null;
      if (
        defaultOrganizationId &&
        !(await this._repository.getActiveOrganization(defaultOrganizationId))
      ) {
        throw new BadRequestException('Default organization not found');
      }
    }

    return this._repository.upsertSettings({
      allowedEmailDomains,
      defaultOrganizationId,
    });
  }

  async isEmailAllowed(email: string): Promise<boolean> {
    const { allowedEmailDomains } = await this.getSettings();
    return isDomainAllowed(email, allowedEmailDomains);
  }

  // Decides how a brand-new account for this email is created. The default
  // organization only applies while the allowlist is active, so an empty list
  // keeps the original "every user gets a new organization" behaviour.
  async getRegistrationPolicy(email: string): Promise<RegistrationPolicy> {
    const { allowedEmailDomains, defaultOrganizationId } =
      await this.getSettings();

    if (!isDomainAllowed(email, allowedEmailDomains)) {
      return { allowed: false, defaultOrganizationId: null };
    }

    if (!allowedEmailDomains.length || !defaultOrganizationId) {
      return { allowed: true, defaultOrganizationId: null };
    }

    const organization = await this._repository.getActiveOrganization(
      defaultOrganizationId
    );
    return {
      allowed: true,
      defaultOrganizationId: organization ? organization.id : null,
    };
  }
}
