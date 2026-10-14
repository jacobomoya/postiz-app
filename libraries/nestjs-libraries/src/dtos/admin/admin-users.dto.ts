import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const ADMIN_MEMBERSHIP_ROLES = ['USER', 'ADMIN', 'SUPERADMIN'] as const;
export type AdminMembershipRole = (typeof ADMIN_MEMBERSHIP_ROLES)[number];

export const ADMIN_PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes; longer values would be silently cut.
export const ADMIN_PASSWORD_MAX_LENGTH = 72;

export class CreateAdminUserDto {
  @IsDefined()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsDefined()
  @IsString()
  @MinLength(ADMIN_PASSWORD_MIN_LENGTH)
  @MaxLength(ADMIN_PASSWORD_MAX_LENGTH)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsDefined()
  @IsIn(ADMIN_MEMBERSHIP_ROLES)
  role: AdminMembershipRole;
}

export class SetAdminUserPasswordDto {
  @IsDefined()
  @IsString()
  @MinLength(ADMIN_PASSWORD_MIN_LENGTH)
  @MaxLength(ADMIN_PASSWORD_MAX_LENGTH)
  password: string;
}

export class UpdateAdminMembershipDto {
  @IsOptional()
  @IsIn(ADMIN_MEMBERSHIP_ROLES)
  role?: AdminMembershipRole;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}

export class AddAdminMembershipDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsDefined()
  @IsIn(ADMIN_MEMBERSHIP_ROLES)
  role: AdminMembershipRole;
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  activated?: boolean;
}

export class UpdateRegistrationSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  allowedEmailDomains?: string[];

  // null clears the default organization; omitted keeps it.
  @ValidateIf((o) => o.defaultOrganizationId !== null && o.defaultOrganizationId !== undefined)
  @IsString()
  defaultOrganizationId?: string | null;
}
