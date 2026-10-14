import { GoogleProvider } from './google.provider';

const userinfoGet = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
    },
    oauth2: jest.fn(() => ({ userinfo: { get: userinfoGet } })),
  },
}));

describe('GoogleProvider.getUser', () => {
  it.each([
    [true, true],
    [false, false],
    [undefined, false],
  ])('maps verified_email=%p to emailVerified=%p', async (verified, expected) => {
    userinfoGet.mockResolvedValue({
      data: { id: 'g1', email: 'ana@laica.io', verified_email: verified },
    });
    await expect(new GoogleProvider().getUser('token')).resolves.toEqual({
      id: 'g1',
      email: 'ana@laica.io',
      emailVerified: expected,
    });
  });
});
