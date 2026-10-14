import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PoliciesGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { SettingsController } from '@gitroom/backend/api/routes/settings.controller';
import { OAuthAppController } from '@gitroom/backend/api/routes/oauth-app.controller';
import { UsersController } from '@gitroom/backend/api/routes/users.controller';
import { BillingController } from '@gitroom/backend/api/routes/billing.controller';

jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/notifications/notification.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/services/payment/payment.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({}));
jest.mock('@gitroom/backend/services/auth/auth.service', () => ({}));
jest.mock('@gitroom/helpers/auth/auth.service', () => ({}));
// The custom forbidden filter imports middleware with infrastructure dependencies.
jest.mock('@gitroom/nestjs-libraries/services/exception.filter', () => ({}));

type Role = 'USER' | 'ADMIN' | 'SUPERADMIN';
type TeamRoute = 'getTeam' | 'inviteTeamMember' | 'deleteTeamMember';

describe('PoliciesGuard team-management role enforcement', () => {
  const originalStripeKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const getSubscriptionByOrganizationId = jest.fn();

  const permissions = new PermissionsService(
    { getSubscriptionByOrganizationId, getSubscription: jest.fn() } as any,
    { countPostsFromDay: jest.fn() } as any,
    { getIntegrationsList: jest.fn(), getIntegrationByInternalId: jest.fn() } as any,
    { getTotal: jest.fn() } as any
  );
  const guard = new PoliciesGuard(new Reflector(), permissions);

  const run = (
    route: TeamRoute,
    role: Role,
    { isSuperAdmin = false }: { isSuperAdmin?: boolean } = {}
  ) => {
    const request = {
      path: '/settings/team',
      query: {},
      user: { id: 'user-1', isSuperAdmin },
      org: {
        id: 'org-1',
        createdAt: new Date('2024-01-01'),
        users: [{ role, disabled: false }],
      },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => SettingsController.prototype[route],
      getClass: () => SettingsController,
    } as unknown as ExecutionContext;
    return guard.canActivate(context);
  };

  beforeEach(() => {
    getSubscriptionByOrganizationId.mockReset().mockResolvedValue({
      subscriptionTier: 'PRO',
      totalChannels: 10,
    });
  });

  afterAll(() => {
    if (originalStripeKey === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    } else {
      process.env.STRIPE_PUBLISHABLE_KEY = originalStripeKey;
    }
  });

  const routes: TeamRoute[] = ['getTeam', 'inviteTeamMember', 'deleteTeamMember'];

  describe('without Stripe configured', () => {
    beforeEach(() => {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    });

    it.each(routes)('refuses a USER-role member on %s with 403', async (route) => {
      await expect(run(route, 'USER')).rejects.toMatchObject({ status: 403 });
    });

    it.each(
      routes.flatMap((route) => (['ADMIN', 'SUPERADMIN'] as Role[]).map((role) => [route, role]))
    )('allows %s for %s', async (route, role) => {
      await expect(run(route as TeamRoute, role as Role)).resolves.toBe(true);
    });

    it.each(routes)(
      'allows an instance super-admin impersonating a USER-role member on %s',
      async (route) => {
        await expect(run(route, 'USER', { isSuperAdmin: true })).resolves.toBe(true);
      }
    );
  });

  describe('with Stripe configured', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
    });

    it.each(routes)('still refuses a USER-role member on %s with 403', async (route) => {
      await expect(run(route, 'USER')).rejects.toMatchObject({ status: 403 });
    });

    it.each(routes)('allows an ADMIN on a team-enabled tier on %s', async (route) => {
      await expect(run(route, 'ADMIN')).resolves.toBe(true);
    });

    it.each(routes)(
      'keeps the tier check: an ADMIN on a tier without team members is refused on %s with 402',
      async (route) => {
        getSubscriptionByOrganizationId.mockResolvedValue({ subscriptionTier: 'FREE' });
        await expect(run(route, 'ADMIN')).rejects.toMatchObject({ status: 402 });
      }
    );
  });

  it('does not role-gate routes without the role requirement', async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const request = {
      path: '/settings/shortlink',
      query: {},
      user: { id: 'user-1', isSuperAdmin: false },
      org: { id: 'org-1', createdAt: new Date(), users: [{ role: 'USER' }] },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => SettingsController.prototype.getShortlinkPreference,
      getClass: () => SettingsController,
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  describe('remaining admin-only routes', () => {
    const adminRoutes: Array<[string, Function, string]> = [
      ['GET /user/oauth-app', OAuthAppController, 'getApp'],
      ['POST /user/oauth-app', OAuthAppController, 'createApp'],
      ['PUT /user/oauth-app', OAuthAppController, 'updateApp'],
      ['DELETE /user/oauth-app', OAuthAppController, 'deleteApp'],
      ['POST /user/oauth-app/rotate-secret', OAuthAppController, 'rotateSecret'],
      ['POST /user/api-key/rotate', UsersController, 'rotateApiKey'],
      ['GET /user/subscription', UsersController, 'getSubscription'],
      ['GET /user/subscription/tiers', UsersController, 'tiers'],
      ['GET /billing/invoices', BillingController, 'getInvoices'],
    ];

    const runOn = (
      controller: Function,
      method: string,
      role: Role,
      isSuperAdmin = false
    ) => {
      const request = {
        path: '/some/admin/route',
        query: {},
        user: { id: 'user-1', isSuperAdmin },
        org: { id: 'org-1', createdAt: new Date(), users: [{ role }] },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => controller.prototype[method],
        getClass: () => controller,
      } as unknown as ExecutionContext;
      return guard.canActivate(context);
    };

    beforeEach(() => {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    });

    it.each(adminRoutes)(
      'refuses a USER-role member on %s with 403 without Stripe',
      async (_name, controller, method) => {
        await expect(runOn(controller, method, 'USER')).rejects.toMatchObject({ status: 403 });
      }
    );

    it.each(adminRoutes)(
      'refuses a USER-role member on %s with 403 with Stripe',
      async (_name, controller, method) => {
        process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy';
        await expect(runOn(controller, method, 'USER')).rejects.toMatchObject({ status: 403 });
      }
    );

    it.each(adminRoutes)('allows an ADMIN on %s', async (_name, controller, method) => {
      await expect(runOn(controller, method, 'ADMIN')).resolves.toBe(true);
    });

    it.each(adminRoutes)(
      'allows an instance super-admin impersonating a USER-role member on %s',
      async (_name, controller, method) => {
        await expect(runOn(controller, method, 'USER', true)).resolves.toBe(true);
      }
    );

    it('leaves POST /settings/shortlink open to USER-role members (Global Settings UI)', async () => {
      await expect(
        runOn(SettingsController, 'updateShortlinkPreference', 'USER')
      ).resolves.toBe(true);
    });
  });
});
