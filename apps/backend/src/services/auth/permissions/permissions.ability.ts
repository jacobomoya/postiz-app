import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthorizationActions, Sections } from './permission.exception.class';

export const CHECK_POLICIES_KEY = 'check_policy';
export type AbilityPolicy = [AuthorizationActions, Sections];
export const CheckPolicies = (...handlers: AbilityPolicy[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);

export const REQUIRE_ORG_ROLES_KEY = 'require_org_roles';
/**
 * Restricts a route to members whose role in the current organization is one
 * of `roles`. Unlike the `Sections.ADMIN` policy, this is enforced whether or
 * not billing (Stripe) is configured. Instance super-admins always pass, so
 * impersonation keeps working.
 */
export const RequireOrgRoles = (...roles: Role[]) =>
  SetMetadata(REQUIRE_ORG_ROLES_KEY, roles);
