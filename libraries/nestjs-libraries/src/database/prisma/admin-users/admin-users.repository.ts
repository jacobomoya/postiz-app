import { Injectable } from '@nestjs/common';
import { Prisma, Provider, Role } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// Fields an admin may see about a user. Never includes the password hash.
export const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  providerName: true,
  activated: true,
  isSuperAdmin: true,
  lastOnline: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const MEMBERSHIP_SELECT = {
  userId: true,
  organizationId: true,
  role: true,
  disabled: true,
} satisfies Prisma.UserOrganizationSelect;

export interface ListAdminUsersParams {
  search?: string;
  skip: number;
  take: number;
}

@Injectable()
export class AdminUsersRepository {
  constructor(
    private _user: PrismaRepository<'user'>,
    private _userOrg: PrismaRepository<'userOrganization'>,
    private _organization: PrismaRepository<'organization'>
  ) {}

  async listUsers({ search, skip, take }: ListAdminUsersParams) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this._user.model.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          ...ADMIN_USER_SELECT,
          organizations: {
            where: { organization: { deletedAt: null } },
            orderBy: { createdAt: 'asc' },
            select: {
              organizationId: true,
              role: true,
              disabled: true,
              organization: { select: { name: true } },
            },
          },
        },
      }),
      this._user.model.user.count({ where }),
    ]);

    return { users, total };
  }

  getUserById(id: string) {
    return this._user.model.user.findFirst({
      where: { id, deletedAt: null },
      select: ADMIN_USER_SELECT,
    });
  }

  getLocalUserByEmail(email: string) {
    return this._user.model.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        providerName: Provider.LOCAL,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  getActiveOrganization(id: string) {
    return this._organization.model.organization.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  listOrganizations() {
    return this._organization.model.organization.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  createLocalUser(data: {
    email: string;
    name: string | null;
    passwordHash: string;
    organizationId: string;
    role: Role;
  }) {
    return this._user.model.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: data.passwordHash,
        providerName: Provider.LOCAL,
        providerId: '',
        activated: true,
        timezone: 0,
        organizations: {
          create: { organizationId: data.organizationId, role: data.role },
        },
      },
      select: ADMIN_USER_SELECT,
    });
  }

  async setPasswordHash(id: string, passwordHash: string) {
    await this._user.model.user.update({
      where: { id, providerName: Provider.LOCAL },
      data: { password: passwordHash },
      select: { id: true },
    });
  }

  updateUser(id: string, data: { isSuperAdmin?: boolean; activated?: boolean }) {
    return this._user.model.user.update({
      where: { id },
      data,
      select: ADMIN_USER_SELECT,
    });
  }

  // Active super-admins of the instance other than the given user.
  countOtherActiveSuperAdmins(excludeUserId: string) {
    return this._user.model.user.count({
      where: {
        id: { not: excludeUserId },
        isSuperAdmin: true,
        activated: true,
        deletedAt: null,
      },
    });
  }

  getMembership(userId: string, organizationId: string) {
    return this._userOrg.model.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: MEMBERSHIP_SELECT,
    });
  }

  // Enabled SUPERADMIN memberships of the organization held by other users.
  countOtherEnabledOrgSuperAdmins(organizationId: string, excludeUserId: string) {
    return this._userOrg.model.userOrganization.count({
      where: {
        organizationId,
        userId: { not: excludeUserId },
        role: Role.SUPERADMIN,
        disabled: false,
        user: { deletedAt: null },
      },
    });
  }

  updateMembership(
    userId: string,
    organizationId: string,
    data: { role?: Role; disabled?: boolean }
  ) {
    return this._userOrg.model.userOrganization.update({
      where: { userId_organizationId: { userId, organizationId } },
      data,
      select: MEMBERSHIP_SELECT,
    });
  }

  addMembership(userId: string, organizationId: string, role: Role) {
    return this._userOrg.model.userOrganization.create({
      data: { userId, organizationId, role },
      select: MEMBERSHIP_SELECT,
    });
  }
}
