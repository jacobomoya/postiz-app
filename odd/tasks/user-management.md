# Feature: user management for instance super-admins

Locator: `odd/tasks/user-management.md` · Engram mirror: `odd/user-management/tasks` (project `solucionia`)
Base: `main` @ `f343836`. One branch per slice (see Delivery). T2 is developed in the worktree `../postiz-app-worktrees/team-role-enforcement`.

## Objective

Give instance super-admins of Postbiz (this fork, deployed at https://postbiz.solucionia.ai) a way to manage users without email or direct SQL. Restrict self-registration and Google login to allowed email domains.

## Problem / why

- There is no instance-wide user list. Super-admins only get the impersonation search (`GET /user/impersonate`).
- Admins cannot create a user with a password. Invites are JWT links that require self-registration.
- Users cannot change or reset a password: forgot-password needs `EMAIL_PROVIDER`, which is empty in this deployment, and no change/set-password endpoint exists.
- Admins cannot change a member's role or disable a member, even though `UserOrganization.disabled` exists.
- There is no allowed-domain control. Every Google/LOCAL signup creates its own new org (`createOrgAndUser`).
- Security: without `STRIPE_PUBLISHABLE_KEY`, `PermissionsService.check` grants every `@CheckPolicies`. A USER-role member can therefore manage the team through the API.
- Business need: people from solucionia.ai, laica.io and vetmonitor.ai, and a Gmail user, must be able to get in. The Google OAuth client is internal-only today.

## Scope (authorized by the user, 2026-10-14)

1. Admin "Users" section at `/admin/users`:
   - list all users with email, provider, orgs+roles, activated and last online;
   - create a user with email + password, assigned to an org with a role.
2. Admin can set a new password for any user, with no email needed.
3. Admin can change a member's role per org, disable/enable a membership, grant/revoke `isSuperAdmin`, and deactivate/reactivate a user.
4. Allowed email domains, editable from the panel:
   - only those domains may self-register or log in/register with Google;
   - a first login from an allowed domain joins a configurable default organization instead of creating an empty one.
5. Server-side role enforcement for team-management endpoints, independent of Stripe.

Out of scope: email sending, invite storage, and billing changes.

## Constraints

- Upstream-friendly, minimal and additive changes; follow the existing NestJS controller/service/repository + Prisma patterns.
- Super-admin-only endpoints reuse the existing super-admin checks (e.g. `AdminController` / `assertSuperAdmin`).
- Passwords are hashed with the existing `AuthService` bcrypt helpers and never logged or returned.
- The allowlist must not lock out existing users. When the list is empty, behaviour is unchanged (open, as today).
- Generated artifacts and UI copy are in English, using the existing i18n mechanism where the UI already uses it.
- About 400 authored lines per task is a planning heuristic only.

## Delivery

- Forecast: about 1,400 authored changed lines (backend about 750, frontend about 650).
- Strategy: `ask-on-risk`, and the user chose **stacked PRs to main** (2026-10-14). Each task is its own PR against `main` (T3 stacks on T1).
- Slices:
  - PR1 = T1 (branch `feat/user-mgmt-allowed-domains`)
  - PR2 = T2 (`fix/team-role-enforcement`)
  - PR3 = T3 (`feat/admin-users-api`, based on PR1)
  - PR4 = T4 (`feat/admin-users-ui`, based on PR3)
- Image build: a push to `main` triggers `build-containers-fork.yml` and publishes `ghcr.io/jacobomoya/postiz-app:latest`. Deploying means restarting Coolify service `i7syzisn9jk7tkiisyjodnoc` on apps-varias.

## Tasks

- [x] **T1 — Allowed domains + default org (backend).**
  - Add a Prisma model for instance settings (`allowedEmailDomains`, `defaultOrganizationId`) with a migration.
  - Enforce it in `AuthService.routeAuth` (LOCAL register) and `loginOrRegisterProvider`. Reject disallowed domains; join the default org as USER instead of `createOrgAndUser`. An empty list keeps current behaviour.
  - Unit tests.
  - Route: delegated (multi-file, new logic).
- [ ] **T2 — Server-side role enforcement for `/settings/team*` (backend).** ADMIN/SUPERADMIN role required regardless of Stripe, plus tests. Route: delegated.
- [ ] **T3 — Admin users API (backend).**
  - Super-admin-only endpoints: list users, create user (email/password/org/role), set password, change membership role, enable/disable membership, toggle super-admin, activate/deactivate user, get/update allowed domains + default org.
  - DTO validation and unit tests.
  - Route: delegated.
- [ ] **T4 — Admin "Users" UI (frontend).** `/(site)/admin/users` page with the list, create-user modal, row actions and a domains settings card, linked where the other admin pages are linked, plus component tests. Route: delegated.
- [ ] **T5 — Release.** PR(s) → merge to `main` → image build → redeploy Postbiz. Set `isSuperAdmin` for jacobo@solucionia.ai, configure the domains (solucionia.ai, laica.io, vetmonitor.ai) and the default org "Solucionia", and verify end-to-end. Route: inline (ops).

## Acceptance criteria

- A super-admin can do all of scope items 1–4 from the UI. A non-super-admin gets 403 on every new endpoint.
- With domains configured: a Google or LOCAL signup from a disallowed domain is rejected with a clear message, and one from an allowed domain lands in the default org.
- A USER-role member gets 403 on team-management endpoints even without Stripe.
- Backend and frontend jest suites pass: `pnpm exec jest --config apps/backend/jest.config.cjs` and `apps/frontend/jest.config.ts`.
- The production build compiles; the CI image build succeeds.

## Progress / evidence

- 2026-10-14: explored the fork (no admin user list, no set-password, no role change, no allowlist; Stripe-less permission bypass). Doc created and branch created.
- 2026-10-14 T1 (route: delegated, multi-file new logic). Branch `feat/user-mgmt-allowed-domains`, work-unit commit `823eed5` (amended only to record this hash).
  - Schema apply mechanism: `prisma db push` at container start (`pnpm run pm2` → `pm2-run` → `prisma-db-push`); the repo has no migrations folder, so none was added. New model `InstanceSettings` (single row id `default`, `allowedEmailDomains String[]`, `defaultOrganizationId` → Organization, `onDelete: SetNull`).
  - RED: first run failed to load (module missing); with method stubs, 26 failed / 6 passed of 32 (the 6 passing are regression guards for unchanged behaviour: provider register w/o allowlist, DISABLE_REGISTRATION, existing provider/LOCAL login, invite, fallback).
  - GREEN: `pnpm exec jest --config apps/backend/jest.config.cjs` → 4 suites, 51 tests passed (32 new auth/settings tests + 1 controller test + 18 existing).
  - Type-check: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc -p apps/backend/tsconfig.build.json --noEmit` → exit 0, 0 errors (the default heap aborts with OOM in this environment).
  - `DATABASE_URL=<dummy> pnpm exec prisma validate --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma` → schema valid.
  - Frontend gap for T4: LOCAL register shows "Email domain not allowed" under the email field. After Google the register form hides the email input, so the 400 message is set on a hidden field and is not visible.

## Next step

Get the chain-strategy answer, then T1.
