import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AppAbility,
  PermissionsService,
} from '@gitroom/backend/services/auth/permissions/permissions.service';
import {
  AbilityPolicy,
  CHECK_POLICIES_KEY,
  REQUIRE_ORG_ROLES_KEY,
} from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { Organization, Role, User } from '@prisma/client';
import { Request } from 'express';
import { SubscriptionException } from './permission.exception.class';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private _reflector: Reflector,
    private _authorizationService: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    if (
      request.path.indexOf('/auth') > -1 ||
      request.path.indexOf('/auth') > -1 ||
      request.path.indexOf('/integrations/social-connect') > -1 ||
      request.path.indexOf('/integrations/provider') > -1
    ) {
      return true;
    }

    this.checkOrgRole(context, request);

    const policyHandlers =
      this._reflector.get<AbilityPolicy[]>(
        CHECK_POLICIES_KEY,
        context.getHandler()
      ) || [];

    if (!policyHandlers || !policyHandlers.length) {
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const { org }: { org: Organization } = request;

    const refreshChannelId = typeof request.query?.refresh === 'string' ? request.query.refresh : undefined;

    // @ts-ignore
    const ability = await this._authorizationService.check(org.id, org.createdAt, org.users[0].role, policyHandlers, refreshChannelId);

    const item = policyHandlers.find(
      (handler) => !this.execPolicyHandler(handler, ability)
    );

    if (item) {
      throw new SubscriptionException({
        section: item[1],
        action: item[0],
      });
    }

    return true;
  }

  private checkOrgRole(context: ExecutionContext, request: Request) {
    const roles = this._reflector.get<Role[]>(
      REQUIRE_ORG_ROLES_KEY,
      context.getHandler()
    );

    if (!roles?.length) {
      return;
    }

    const { org, user } = request as unknown as {
      org?: Organization & { users?: Array<{ role?: Role }> };
      user?: User;
    };

    // Instance super-admins (including while impersonating a member) keep access.
    if (user?.isSuperAdmin) {
      return;
    }

    const role = org?.users?.[0]?.role;
    if (!role || !roles.includes(role)) {
      throw new ForbiddenException(
        'Your role in this organization does not allow this action'
      );
    }
  }

  private execPolicyHandler(handler: AbilityPolicy, ability: AppAbility) {
    return ability.can(handler[0], handler[1]);
  }
}
