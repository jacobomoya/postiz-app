import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { AdminUsersService } from '@gitroom/nestjs-libraries/database/prisma/admin-users/admin-users.service';
import {
  AddAdminMembershipDto,
  CreateAdminUserDto,
  SetAdminUserPasswordDto,
  UpdateAdminMembershipDto,
  UpdateAdminUserDto,
  UpdateRegistrationSettingsDto,
} from '@gitroom/nestjs-libraries/dtos/admin/admin-users.dto';

const toNumber = (value?: string) =>
  value === undefined || value === '' ? undefined : Number(value);

// Instance-wide user management. Every route is restricted to super-admins.
@ApiTags('Admin')
@Controller('/admin')
export class AdminUsersController {
  constructor(private _adminUsersService: AdminUsersService) {}

  // Plain ForbiddenException: HttpForbiddenException would clear the auth cookie.
  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Super-admin access required');
    }
  }

  @Get('/users')
  async listUsers(
    @GetUserFromRequest() user: User,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.listUsers({
      search,
      page: toNumber(page),
      pageSize: toNumber(pageSize),
    });
  }

  @Post('/users')
  async createUser(
    @GetUserFromRequest() user: User,
    @Body() body: CreateAdminUserDto
  ) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.createUser(body);
  }

  @Put('/users/:id/password')
  async setPassword(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: SetAdminUserPasswordDto
  ) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.setPassword(id, body.password);
  }

  @Put('/users/:id/memberships/:orgId')
  async updateMembership(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Param('orgId') orgId: string,
    @Body() body: UpdateAdminMembershipDto
  ) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.updateMembership(id, orgId, body);
  }

  @Post('/users/:id/memberships')
  async addMembership(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: AddAdminMembershipDto
  ) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.addMembership(id, body);
  }

  @Put('/users/:id')
  async updateUser(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: UpdateAdminUserDto
  ) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.updateUser(user.id, id, body);
  }

  @Get('/settings/registration')
  async getRegistrationSettings(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.getRegistrationSettings();
  }

  @Put('/settings/registration')
  async updateRegistrationSettings(
    @GetUserFromRequest() user: User,
    @Body() body: UpdateRegistrationSettingsDto
  ) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.updateRegistrationSettings(body);
  }

  @Get('/organizations')
  async listOrganizations(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._adminUsersService.listOrganizations();
  }
}
