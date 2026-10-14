import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from '@gitroom/backend/services/auth/auth.service';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';

jest.mock('@gitroom/backend/services/auth/auth.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({}));
jest.mock('@gitroom/nestjs-libraries/throttler/throttler.provider', () => ({
  ThrottlerRealIpGuard: class {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/social/farcaster.provider', () => ({
  FarcasterProvider: class {},
}));
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));

describe('AuthController register with a disallowed email domain', () => {
  it('answers 400 with the readable error message', async () => {
    const routeAuth = jest
      .fn()
      .mockRejectedValue(new Error('Email domain not allowed'));
    const controller = new AuthController(
      { routeAuth, getOrgFromCookie: () => false } as unknown as AuthService,
      { hasProvider: () => false } as unknown as EmailService
    );
    const response = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      cookie: jest.fn(),
      header: jest.fn(),
      json: jest.fn(),
    };

    await controller.register(
      { cookies: {} } as unknown as Request,
      Object.assign(new CreateOrgUserDto(), {
        email: 'a@gmail.com',
        password: 'secret123',
        provider: 'LOCAL',
        company: 'Acme',
      }),
      response as unknown as Response,
      'ip',
      'agent'
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send).toHaveBeenCalledWith('Email domain not allowed');
    expect(response.cookie).not.toHaveBeenCalled();
  });
});
