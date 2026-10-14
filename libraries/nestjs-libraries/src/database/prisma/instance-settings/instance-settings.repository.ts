import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// Instance settings are stored as a single row with this id.
export const INSTANCE_SETTINGS_ID = 'default';

export interface InstanceSettingsValues {
  allowedEmailDomains: string[];
  defaultOrganizationId: string | null;
}

@Injectable()
export class InstanceSettingsRepository {
  constructor(
    private _instanceSettings: PrismaRepository<'instanceSettings'>,
    private _organization: PrismaRepository<'organization'>
  ) {}

  getSettings(): Promise<InstanceSettingsValues | null> {
    return this._instanceSettings.model.instanceSettings.findUnique({
      where: { id: INSTANCE_SETTINGS_ID },
      select: { allowedEmailDomains: true, defaultOrganizationId: true },
    });
  }

  upsertSettings(data: InstanceSettingsValues): Promise<InstanceSettingsValues> {
    return this._instanceSettings.model.instanceSettings.upsert({
      where: { id: INSTANCE_SETTINGS_ID },
      create: { id: INSTANCE_SETTINGS_ID, ...data },
      update: data,
      select: { allowedEmailDomains: true, defaultOrganizationId: true },
    });
  }

  getActiveOrganization(id: string) {
    return this._organization.model.organization.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    });
  }
}
