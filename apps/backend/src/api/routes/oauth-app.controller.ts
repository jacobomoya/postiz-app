import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import {
  CheckPolicies,
  RequireOrgRoles,
} from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { CreateOAuthAppDto } from '@gitroom/nestjs-libraries/dtos/oauth/create-oauth-app.dto';
import { UpdateOAuthAppDto } from '@gitroom/nestjs-libraries/dtos/oauth/update-oauth-app.dto';

@ApiTags('OAuth App')
@Controller('/user/oauth-app')
export class OAuthAppController {
  constructor(private _oauthService: OAuthService) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequireOrgRoles('ADMIN', 'SUPERADMIN')
  async getApp(@GetOrgFromRequest() org: Organization) {
    return this._oauthService.getApp(org.id);
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequireOrgRoles('ADMIN', 'SUPERADMIN')
  async createApp(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateOAuthAppDto
  ) {
    return this._oauthService.createApp(org.id, body);
  }

  @Put('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequireOrgRoles('ADMIN', 'SUPERADMIN')
  async updateApp(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UpdateOAuthAppDto
  ) {
    return this._oauthService.updateApp(org.id, body);
  }

  @Delete('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequireOrgRoles('ADMIN', 'SUPERADMIN')
  async deleteApp(@GetOrgFromRequest() org: Organization) {
    return this._oauthService.deleteApp(org.id);
  }

  @Post('/rotate-secret')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequireOrgRoles('ADMIN', 'SUPERADMIN')
  async rotateSecret(@GetOrgFromRequest() org: Organization) {
    return this._oauthService.rotateSecret(org.id);
  }
}
