import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { User } from '@prisma/client';
import { UsersController } from './users.controller';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';

jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({}));
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

describe('Create organization', () => {
  const createOrgForUser = jest.fn();
  const controller = new UsersController(
    undefined!, undefined!, undefined!,
    { createOrgForUser } as unknown as OrganizationService,
    undefined!, undefined!, undefined!
  );
  const create = async (name: unknown) => {
    const method = controller.createOrganization;
    const types = Reflect.getMetadata('design:paramtypes', controller, 'createOrganization');
    const body = await new ValidationPipe({ transform: true }).transform(
      { name }, { type: 'body', metatype: types?.[1] }
    );
    return method.call(controller, { id: 'existing-user' } as User, body);
  };

  beforeEach(() => {
    createOrgForUser.mockReset().mockResolvedValue({ id: 'new-org', name: 'Company' });
  });

  it('creates for the authenticated existing user and returns only id and name', async () => {
    await expect(create('  Company  ')).resolves.toEqual({ id: 'new-org', name: 'Company' });
    expect(createOrgForUser).toHaveBeenCalledWith('existing-user', 'Company');
    expect(Reflect.getMetadata('path', controller.createOrganization)).toBe('/organizations');
    expect(Reflect.getMetadata('method', controller.createOrganization)).toBe(1);
  });

  it.each(['', '   ', 'x'.repeat(61), null, 42])('rejects invalid names (%j) with 400', async (name) => {
    await expect(create(name)).rejects.toMatchObject({ status: 400 });
    expect(createOrgForUser).not.toHaveBeenCalled();
  });
});

describe('Organizations overview', () => {
  const user = { id: 'current-user' } as User;
  const enabled = [
    { id: 'org-a', name: 'Company A', users: [{ disabled: false }] },
    { id: 'org-b', name: 'Company B', users: [{ disabled: false }] },
    { id: 'org-zero', name: 'Company Zero', users: [{ disabled: false }] },
  ];
  let controller: UsersController;
  let getOrgsByUserId: jest.Mock;
  let getOrganizationOverviewCounts: jest.Mock;

  beforeEach(() => {
    getOrgsByUserId = jest.fn().mockResolvedValue(enabled);
    getOrganizationOverviewCounts = jest.fn().mockResolvedValue([
      { organizationId: 'org-b', planned: 2, errors: 0 },
      { organizationId: 'org-a', planned: 3, errors: 4 },
    ]);
    controller = new UsersController(
      undefined!, undefined!, undefined!,
      { getOrgsByUserId } as unknown as OrganizationService,
      undefined!, undefined!,
      { getOrganizationOverviewCounts } as unknown as PostsService
    );
  });

  it('returns each enabled organization with its counts and zero defaults', async () => {
    await expect(controller.getOrganizationsOverview(user)).resolves.toEqual([
      { id: 'org-a', name: 'Company A', planned: 3, errors: 4 },
      { id: 'org-b', name: 'Company B', planned: 2, errors: 0 },
      { id: 'org-zero', name: 'Company Zero', planned: 0, errors: 0 },
    ]);
    expect(getOrgsByUserId).toHaveBeenCalledWith(user.id);
    expect(getOrganizationOverviewCounts).toHaveBeenCalledTimes(1);
    expect(getOrganizationOverviewCounts).toHaveBeenCalledWith(['org-a', 'org-b', 'org-zero']);
  });

  it('excludes disabled memberships before requesting counts', async () => {
    getOrgsByUserId.mockResolvedValue([
      enabled[0],
      { id: 'disabled-org', name: 'Disabled', users: [{ disabled: true }] },
    ]);
    await expect(controller.getOrganizationsOverview(user)).resolves.toEqual([
      { id: 'org-a', name: 'Company A', planned: 3, errors: 4 },
    ]);
    expect(getOrganizationOverviewCounts).toHaveBeenCalledWith(['org-a']);
  });

  it.each([
    { organizations: [] },
    { organizations: [{ id: 'disabled-org', users: [{ disabled: true }] }] },
  ])(
    'returns no entries and skips counts when no memberships are enabled (%j)',
    async ({ organizations }) => {
      getOrgsByUserId.mockResolvedValue(organizations);
      await expect(controller.getOrganizationsOverview(user)).resolves.toEqual([]);
      expect(getOrganizationOverviewCounts).not.toHaveBeenCalled();
    }
  );

  it('registers the authenticated overview as a static GET route', () => {
    expect(Reflect.getMetadata('path', controller.getOrganizationsOverview)).toBe('/organizations/overview');
    expect(Reflect.getMetadata('method', controller.getOrganizationsOverview)).toBe(0);
  });
});

describe('PostsRepository organization overview counts', () => {
  it('groups future queued calendar posts and all error entries by organization', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    jest.useFakeTimers().setSystemTime(now);
    try {
      const posts = jest.fn().mockResolvedValue([
        { organizationId: 'org-a', _count: { _all: 3 } },
      ]);
      const errors = jest.fn().mockResolvedValue([
        { organizationId: 'org-b', _count: { _all: 4 } },
      ]);
      const repository = new PostsRepository(
        { model: { post: { groupBy: posts } } } as any,
        undefined!, undefined!, undefined!, undefined!,
        { model: { errors: { groupBy: errors } } } as any
      );
      await expect(repository.getOrganizationOverviewCounts(['org-a', 'org-b', 'org-zero'])).resolves.toEqual([
        { organizationId: 'org-a', planned: 3, errors: 0 },
        { organizationId: 'org-b', planned: 0, errors: 4 },
        { organizationId: 'org-zero', planned: 0, errors: 0 },
      ]);
      expect(posts).toHaveBeenCalledTimes(1);
      expect(posts).toHaveBeenCalledWith({
        by: ['organizationId'],
        where: {
          organizationId: { in: ['org-a', 'org-b', 'org-zero'] },
          state: 'QUEUE', publishDate: { gt: now }, deletedAt: null,
          parentPostId: null, integration: { deletedAt: null },
        },
        _count: { _all: true },
      });
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors).toHaveBeenCalledWith({
        by: ['organizationId'],
        where: { organizationId: { in: ['org-a', 'org-b', 'org-zero'] } },
        _count: { _all: true },
      });
      posts.mockClear();
      errors.mockClear();
      await expect(repository.getOrganizationOverviewCounts([])).resolves.toEqual([]);
      expect(posts).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

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
      undefined!, undefined!, undefined!
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
