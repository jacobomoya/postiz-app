import { ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { User } from '@prisma/client';
import { UsersController } from './users.controller';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';

jest.mock('@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/services/payment/payment.service', () => ({}));
jest.mock('@gitroom/backend/services/auth/auth.service', () => ({}));
jest.mock('@gitroom/helpers/auth/auth.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({}));
jest.mock('@gitroom/backend/services/auth/permissions/permissions.ability', () => ({
  CheckPolicies: () => () => undefined,
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({}));
// The custom forbidden filter imports middleware with infrastructure dependencies.
jest.mock('@gitroom/nestjs-libraries/services/exception.filter', () => ({}));

describe('UsersController.changeOrg', () => {
  const user = { id: 'current-user' } as User;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalNotSecured = process.env.NOT_SECURED;
  let controller: UsersController;
  let getOrgsByUserId: jest.Mock;
  let response: Response;
  let cookie: jest.Mock;
  let header: jest.Mock;
  let json: jest.Mock;
  let status: jest.Mock;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    delete process.env.NOT_SECURED;
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    getOrgsByUserId = jest.fn().mockResolvedValue([
      { id: 'enabled-org', users: [{ disabled: false }] },
      { id: 'disabled-org', users: [{ disabled: true }] },
    ]);
    controller = new UsersController(
      undefined!, undefined!, undefined!,
      { getOrgsByUserId } as unknown as OrganizationService,
      undefined!, undefined!
    );
    cookie = jest.fn().mockReturnThis();
    header = jest.fn().mockReturnThis();
    json = jest.fn().mockReturnThis();
    status = jest.fn().mockReturnThis();
    response = { cookie, header, json, status, send: jest.fn() } as unknown as Response;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    if (originalNotSecured === undefined) delete process.env.NOT_SECURED;
    else process.env.NOT_SECURED = originalNotSecured;
  });

  const changeOrg = (id: string) => controller.changeOrg(id, response, user);

  it.each([false, true])('sets the existing cookie and returns the selected id (unsecured: %s)', async (unsecured) => {
    if (unsecured) process.env.NOT_SECURED = 'true';
    await changeOrg('enabled-org');
    expect(getOrgsByUserId).toHaveBeenCalledWith(user.id);
    expect(cookie).toHaveBeenCalledWith('showorg', 'enabled-org', {
      domain: '.example.com',
      ...(unsecured ? {} : { secure: true, httpOnly: true, sameSite: 'none' }),
      expires: new Date('2027-01-01T00:00:00Z'),
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ id: 'enabled-org' });
    if (unsecured) expect(header).toHaveBeenCalledWith('showorg', 'enabled-org');
    else expect(header).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled membership', 'disabled-org'],
    ['nonexistent organization', 'missing-org'],
    ['another user organization', 'other-user-org'],
    ['deleted organization excluded by the repository', 'deleted-org'],
  ])('rejects %s with 403 and no cookie', async (_scenario, id) => {
    // Other users' and deleted organizations are absent from getOrgsByUserId.
    let error: unknown;
    try {
      await changeOrg(id);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getStatus()).toBe(403);
    expect(getOrgsByUserId).toHaveBeenCalledWith(user.id);
    expect(cookie).not.toHaveBeenCalled();
    expect(header).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});
