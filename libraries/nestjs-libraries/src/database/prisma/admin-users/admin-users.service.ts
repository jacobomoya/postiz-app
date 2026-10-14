import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Provider } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { AdminUsersRepository } from '@gitroom/nestjs-libraries/database/prisma/admin-users/admin-users.repository';
import {
  InstanceSettingsService,
  UpdateInstanceSettingsInput,
} from '@gitroom/nestjs-libraries/database/prisma/instance-settings/instance-settings.service';
import {
  ADMIN_PASSWORD_MAX_LENGTH,
  ADMIN_PASSWORD_MIN_LENGTH,
  AddAdminMembershipDto,
  CreateAdminUserDto,
  UpdateAdminMembershipDto,
  UpdateAdminUserDto,
  UpdateRegistrationSettingsDto,
} from '@gitroom/nestjs-libraries/dtos/admin/admin-users.dto';

export interface ListAdminUsersQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const toInteger = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.floor(value as number) : fallback;

// Defence in depth: the DTOs validate the same rule at the HTTP boundary.
const hashPassword = (password: string) => {
  if (
    typeof password !== 'string' ||
    password.length < ADMIN_PASSWORD_MIN_LENGTH ||
    password.length > ADMIN_PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException(
      `Password must be between ${ADMIN_PASSWORD_MIN_LENGTH} and ${ADMIN_PASSWORD_MAX_LENGTH} characters`
    );
  }
  return AuthService.hashPassword(password);
};

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// Super-admin user management. Callers must already have checked that the
// actor is an instance super-admin; this service only enforces invariants.
@Injectable()
export class AdminUsersService {
  constructor(
    private _repository: AdminUsersRepository,
    private _instanceSettings: InstanceSettingsService
  ) {}

  async listUsers(query: ListAdminUsersQuery) {
    const search = query.search?.trim() || undefined;
    const page = Math.max(0, toInteger(query.page, 0));
    const pageSize = Math.min(
      Math.max(1, toInteger(query.pageSize, DEFAULT_PAGE_SIZE)),
      MAX_PAGE_SIZE
    );
    const skip = page * pageSize;

    const { users, total } = await this._repository.listUsers({
      search,
      skip,
      take: pageSize,
    });

    // Explicit projection so no other column (e.g. password) can leak.
    const items = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      providerName: user.providerName,
      activated: user.activated,
      isSuperAdmin: user.isSuperAdmin,
      lastOnline: user.lastOnline,
      createdAt: user.createdAt,
      memberships: user.organizations.map((membership) => ({
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        role: membership.role,
        disabled: membership.disabled,
      })),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    };
  }

  // The email domain allowlist is intentionally not applied: admins may add
  // users from any domain (e.g. a Gmail account) on purpose.
  async createUser(body: CreateAdminUserDto) {
    const email = body.email.trim().toLowerCase();
    const passwordHash = hashPassword(body.password);

    await this.assertActiveOrganization(body.organizationId);

    if (await this._repository.getLocalUserByEmail(email)) {
      throw new ConflictException('A user with this email already exists');
    }

    try {
      return await this._repository.createLocalUser({
        email,
        name: body.name?.trim() || null,
        passwordHash,
        organizationId: body.organizationId,
        role: body.role,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A user with this email already exists');
      }
      throw err;
    }
  }

  async setPassword(userId: string, password: string) {
    const passwordHash = hashPassword(password);
    const user = await this.getUserOrFail(userId);
    if (user.providerName !== Provider.LOCAL) {
      throw new BadRequestException(
        'Only email/password accounts can have a password'
      );
    }
    await this._repository.setPasswordHash(user.id, passwordHash);
    return { success: true };
  }

  async updateMembership(
    userId: string,
    organizationId: string,
    body: UpdateAdminMembershipDto
  ) {
    const data = {
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.disabled !== undefined ? { disabled: body.disabled } : {}),
    };
    if (!Object.keys(data).length) {
      throw new BadRequestException('Nothing to update');
    }

    const membership = await this._repository.getMembership(
      userId,
      organizationId
    );
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const wasEnabledSuperAdmin =
      membership.role === 'SUPERADMIN' && !membership.disabled;
    const staysEnabledSuperAdmin =
      (data.role ?? membership.role) === 'SUPERADMIN' &&
      !(data.disabled ?? membership.disabled);

    if (
      wasEnabledSuperAdmin &&
      !staysEnabledSuperAdmin &&
      !(await this._repository.countOtherEnabledOrgSuperAdmins(
        organizationId,
        userId
      ))
    ) {
      throw new BadRequestException(
        'The organization must keep at least one enabled SUPERADMIN'
      );
    }

    return this._repository.updateMembership(userId, organizationId, data);
  }

  async addMembership(userId: string, body: AddAdminMembershipDto) {
    await this.getUserOrFail(userId);
    await this.assertActiveOrganization(body.organizationId);

    if (await this._repository.getMembership(userId, body.organizationId)) {
      throw new ConflictException('User is already a member of this organization');
    }

    try {
      return await this._repository.addMembership(
        userId,
        body.organizationId,
        body.role
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'User is already a member of this organization'
        );
      }
      throw err;
    }
  }

  async updateUser(actorId: string, userId: string, body: UpdateAdminUserDto) {
    const data = {
      ...(body.isSuperAdmin !== undefined
        ? { isSuperAdmin: body.isSuperAdmin }
        : {}),
      ...(body.activated !== undefined ? { activated: body.activated } : {}),
    };
    if (!Object.keys(data).length) {
      throw new BadRequestException('Nothing to update');
    }

    const user = await this.getUserOrFail(userId);

    if (
      actorId === user.id &&
      (data.isSuperAdmin === false || data.activated === false)
    ) {
      throw new BadRequestException(
        'You cannot remove your own super-admin access or deactivate yourself'
      );
    }

    const wasActiveSuperAdmin = user.isSuperAdmin && user.activated;
    const staysActiveSuperAdmin =
      (data.isSuperAdmin ?? user.isSuperAdmin) &&
      (data.activated ?? user.activated);

    if (
      wasActiveSuperAdmin &&
      !staysActiveSuperAdmin &&
      !(await this._repository.countOtherActiveSuperAdmins(user.id))
    ) {
      throw new BadRequestException(
        'The instance must keep at least one active super-admin'
      );
    }

    return this._repository.updateUser(user.id, data);
  }

  getRegistrationSettings() {
    return this._instanceSettings.getSettings();
  }

  updateRegistrationSettings(body: UpdateRegistrationSettingsDto) {
    const input: UpdateInstanceSettingsInput = {};
    if (body.allowedEmailDomains !== undefined) {
      input.allowedEmailDomains = body.allowedEmailDomains;
    }
    if (body.defaultOrganizationId !== undefined) {
      input.defaultOrganizationId = body.defaultOrganizationId;
    }
    return this._instanceSettings.updateSettings(input);
  }

  listOrganizations() {
    return this._repository.listOrganizations();
  }

  private async getUserOrFail(userId: string) {
    const user = await this._repository.getUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async assertActiveOrganization(organizationId: string) {
    if (!(await this._repository.getActiveOrganization(organizationId))) {
      throw new BadRequestException('Organization not found');
    }
  }
}
