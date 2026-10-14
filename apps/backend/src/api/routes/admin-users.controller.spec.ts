import { ForbiddenException, RequestMethod, ValidationPipe } from '@nestjs/common';
import { User } from '@prisma/client';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from '@gitroom/nestjs-libraries/database/prisma/admin-users/admin-users.service';

jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({}));

type Route = {
  method: keyof AdminUsersController;
  verb: RequestMethod;
  path: string;
  args: unknown[];
  service: keyof AdminUsersService;
  expectedCall: unknown[];
};

const superAdmin = { id: 'admin-1', isSuperAdmin: true } as User;
const regularUser = { id: 'user-1', isSuperAdmin: false } as User;

const routes: Route[] = [
  {
    method: 'listUsers',
    verb: RequestMethod.GET,
    path: '/users',
    args: ['ana', '1', '50'],
    service: 'listUsers',
    expectedCall: [{ search: 'ana', page: 1, pageSize: 50 }],
  },
  {
    method: 'createUser',
    verb: RequestMethod.POST,
    path: '/users',
    args: [{ email: 'a@b.co', password: 'password1', organizationId: 'org-1', role: 'USER' }],
    service: 'createUser',
    expectedCall: [{ email: 'a@b.co', password: 'password1', organizationId: 'org-1', role: 'USER' }],
  },
  {
    method: 'setPassword',
    verb: RequestMethod.PUT,
    path: '/users/:id/password',
    args: ['user-2', { password: 'password1' }],
    service: 'setPassword',
    expectedCall: ['user-2', 'password1'],
  },
  {
    method: 'updateMembership',
    verb: RequestMethod.PUT,
    path: '/users/:id/memberships/:orgId',
    args: ['user-2', 'org-1', { role: 'ADMIN' }],
    service: 'updateMembership',
    expectedCall: ['user-2', 'org-1', { role: 'ADMIN' }],
  },
  {
    method: 'addMembership',
    verb: RequestMethod.POST,
    path: '/users/:id/memberships',
    args: ['user-2', { organizationId: 'org-2', role: 'USER' }],
    service: 'addMembership',
    expectedCall: ['user-2', { organizationId: 'org-2', role: 'USER' }],
  },
  {
    method: 'updateUser',
    verb: RequestMethod.PUT,
    path: '/users/:id',
    args: ['user-2', { activated: false }],
    service: 'updateUser',
    expectedCall: ['admin-1', 'user-2', { activated: false }],
  },
  {
    method: 'getRegistrationSettings',
    verb: RequestMethod.GET,
    path: '/settings/registration',
    args: [],
    service: 'getRegistrationSettings',
    expectedCall: [],
  },
  {
    method: 'updateRegistrationSettings',
    verb: RequestMethod.PUT,
    path: '/settings/registration',
    args: [{ allowedEmailDomains: ['laica.io'] }],
    service: 'updateRegistrationSettings',
    expectedCall: [{ allowedEmailDomains: ['laica.io'] }],
  },
  {
    method: 'listOrganizations',
    verb: RequestMethod.GET,
    path: '/organizations',
    args: [],
    service: 'listOrganizations',
    expectedCall: [],
  },
];

describe('AdminUsersController', () => {
  const service = Object.fromEntries(
    routes.map((route) => [route.service, jest.fn().mockResolvedValue('result')])
  ) as unknown as Record<keyof AdminUsersService, jest.Mock>;
  const controller = new AdminUsersController(service as unknown as AdminUsersService);
  const call = (route: Route, user: User | undefined) =>
    (controller[route.method] as (...args: unknown[]) => unknown).call(controller, user, ...route.args);

  beforeEach(() => {
    Object.values(service).forEach((fn) => fn.mockClear());
  });

  it('is mounted under /admin', () => {
    expect(Reflect.getMetadata('path', AdminUsersController)).toBe('/admin');
  });

  describe.each(routes)('$method', (route) => {
    it(`is exposed as ${RequestMethod[route.verb]} ${route.path}`, () => {
      expect(Reflect.getMetadata('path', controller[route.method])).toBe(route.path);
      expect(Reflect.getMetadata('method', controller[route.method])).toBe(route.verb);
    });

    it('refuses a non-super-admin with a plain 403 ForbiddenException', async () => {
      for (const user of [regularUser, undefined]) {
        let error: unknown;
        try {
          await call(route, user);
        } catch (err) {
          error = err;
        }
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getStatus()).toBe(403);
      }
      expect(service[route.service]).not.toHaveBeenCalled();
    });

    it('delegates to the service for a super-admin', async () => {
      await expect(call(route, superAdmin)).resolves.toBe('result');
      expect(service[route.service]).toHaveBeenCalledWith(...route.expectedCall);
    });
  });

  describe('body validation', () => {
    const validate = async (method: keyof AdminUsersController, index: number, value: unknown) => {
      const types = Reflect.getMetadata('design:paramtypes', controller, method);
      return new ValidationPipe({ transform: true }).transform(value, {
        type: 'body',
        metatype: types[index],
      });
    };
    const validUser = {
      email: 'ana@gmail.com',
      password: 'password1',
      organizationId: 'org-1',
      role: 'SUPERADMIN',
    };

    it('accepts a valid create-user body', async () => {
      await expect(validate('createUser', 1, validUser)).resolves.toMatchObject(validUser);
    });

    it.each([
      ['a short password', { password: 'short' }],
      ['an invalid email', { email: 'not-an-email' }],
      ['an unknown role', { role: 'OWNER' }],
      ['a missing organization', { organizationId: undefined }],
    ])('rejects a create-user body with %s (400)', async (_label, patch) => {
      await expect(validate('createUser', 1, { ...validUser, ...patch })).rejects.toMatchObject({
        status: 400,
      });
    });

    it('rejects a short password on set-password (400)', async () => {
      await expect(validate('setPassword', 2, { password: '1234567' })).rejects.toMatchObject({ status: 400 });
    });

    it('rejects non-boolean flags on membership and user updates (400)', async () => {
      await expect(validate('updateMembership', 3, { disabled: 'yes' })).rejects.toMatchObject({ status: 400 });
      await expect(validate('updateUser', 2, { isSuperAdmin: 'true' })).rejects.toMatchObject({ status: 400 });
    });

    it('accepts null to clear the default organization', async () => {
      await expect(
        validate('updateRegistrationSettings', 1, { defaultOrganizationId: null })
      ).resolves.toMatchObject({ defaultOrganizationId: null });
    });
  });
});
