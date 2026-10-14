import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PoliciesGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { SettingsController } from '@gitroom/backend/api/routes/settings.controller';

jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service', () => ({}));

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
});
