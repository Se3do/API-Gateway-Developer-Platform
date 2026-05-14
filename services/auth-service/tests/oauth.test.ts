process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-chars!!';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-at-least-32-chars!';
process.env.AUTH_PORT = '4001';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.GOOGLE_CLIENT_ID = 'test-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/v1/oauth/google/callback';
process.env.GITHUB_CLIENT_ID = 'test-github-id';
process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
process.env.GITHUB_REDIRECT_URI = 'http://localhost:3000/api/v1/oauth/github/callback';

import { createOAuthService, OAuthConfig } from '../src/services/oauth.service.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('OAuth Service', () => {
  const googleConfig: OAuthConfig = {
    provider: 'google',
    clientId: 'test-google-id',
    clientSecret: 'test-google-secret',
    redirectUri: 'http://localhost:3000/callback',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  };

  const githubConfig: OAuthConfig = {
    provider: 'github',
    clientId: 'test-github-id',
    clientSecret: 'test-github-secret',
    redirectUri: 'http://localhost:3000/callback',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
  };

  let oauthService: ReturnType<typeof createOAuthService>;

  beforeEach(() => {
    jest.clearAllMocks();
    oauthService = createOAuthService({ google: googleConfig, github: githubConfig });
  });

  describe('generateAuthorizationUrl', () => {
    it('generates valid Google authorization URL with state token', async () => {
      const { url, state } = await oauthService.generateAuthorizationUrl('google');

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-google-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=openid+profile+email');
      expect(url).toContain(`state=${state}`);
      expect(state).toBeTruthy();
      expect(state.length).toBeGreaterThan(10);
    });

    it('generates valid GitHub authorization URL with state token', async () => {
      const { url, state } = await oauthService.generateAuthorizationUrl('github');

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=test-github-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=user%3Aemail');
      expect(url).toContain(`state=${state}`);
      expect(state).toBeTruthy();
    });

    it('throws error for unsupported provider', async () => {
      await expect(oauthService.generateAuthorizationUrl('unsupported' as any)).rejects.toThrow(
        'Unsupported OAuth provider',
      );
    });

    it('generates unique state tokens on each call', async () => {
      const { state: state1 } = await oauthService.generateAuthorizationUrl('google');
      const { state: state2 } = await oauthService.generateAuthorizationUrl('google');

      expect(state1).not.toEqual(state2);
    });
  });

  describe('validateStateToken', () => {
    it('validates valid state token', async () => {
      const { state } = await oauthService.generateAuthorizationUrl('google');

      // Should not throw
      await expect(oauthService.validateStateToken(state)).resolves.not.toThrow();
    });

    it('rejects invalid state token', async () => {
      await expect(oauthService.validateStateToken('invalid-state')).rejects.toThrow(
        'Invalid or expired state token',
      );
    });

    it('rejects state token after consumption', async () => {
      const { state } = await oauthService.generateAuthorizationUrl('google');

      // First validation succeeds
      await oauthService.validateStateToken(state);

      // Second validation fails (one-time use)
      await expect(oauthService.validateStateToken(state)).rejects.toThrow(
        'Invalid or expired state token',
      );
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('exchanges Google authorization code for tokens', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'google-access-token',
          id_token: 'google-id-token',
          expires_in: 3600,
        },
      });

      const result = await oauthService.exchangeCodeForTokens('google', 'test-code');

      expect(result).toEqual({
        accessToken: 'google-access-token',
        idToken: 'google-id-token',
        expiresIn: 3600,
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          client_id: 'test-google-id',
          client_secret: 'test-google-secret',
          code: 'test-code',
          redirect_uri: 'http://localhost:3000/callback',
          grant_type: 'authorization_code',
        }),
        expect.any(Object),
      );
    });

    it('exchanges GitHub authorization code for tokens', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'github-access-token',
          expires_in: 3600,
        },
      });

      const result = await oauthService.exchangeCodeForTokens('github', 'test-code');

      expect(result).toEqual({
        accessToken: 'github-access-token',
        idToken: undefined,
        expiresIn: 3600,
      });
    });

    it('rejects invalid authorization code', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 400 },
      });

      await expect(oauthService.exchangeCodeForTokens('google', 'invalid-code')).rejects.toThrow(
        'Invalid authorization code',
      );
    });

    it('rejects unsupported provider', async () => {
      await expect(oauthService.exchangeCodeForTokens('unsupported' as any, 'code')).rejects.toThrow(
        'Unsupported OAuth provider',
      );
    });
  });

  describe('fetchUserProfile', () => {
    it('fetches Google user profile', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'user@example.com',
          name: 'John Doe',
        },
      });

      const profile = await oauthService.fetchUserProfile('google', 'access-token');

      expect(profile).toEqual({
        email: 'user@example.com',
        name: 'John Doe',
        providerId: 'google-user-123',
        provider: 'google',
      });
    });

    it('fetches GitHub user profile with email lookup', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 12345,
          login: 'johndoe',
          name: 'John Doe',
          email: null, // GitHub may not return email
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: [
          { email: 'old@example.com', primary: false },
          { email: 'current@example.com', primary: true },
        ],
      });

      const profile = await oauthService.fetchUserProfile('github', 'access-token');

      expect(profile).toEqual({
        email: 'current@example.com',
        name: 'John Doe',
        providerId: '12345',
        provider: 'github',
      });
    });

    it('rejects if Google response missing email', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          // no email
        },
      });

      await expect(oauthService.fetchUserProfile('google', 'access-token')).rejects.toThrow(
        'Missing required profile information',
      );
    });

    it('rejects if GitHub has no primary email', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 12345,
          login: 'johndoe',
          email: null,
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: [
          { email: 'old@example.com', primary: false },
        ],
      });

      await expect(oauthService.fetchUserProfile('github', 'access-token')).rejects.toThrow(
        'No primary email found',
      );
    });
  });

  describe('exchangeAuthCodeForProfile', () => {
    it('exchanges code for full profile (token + user info)', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'google-access-token',
          id_token: 'google-id-token',
          expires_in: 3600,
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'user@example.com',
          name: 'John Doe',
        },
      });

      const profile = await oauthService.exchangeAuthCodeForProfile('google', 'test-code');

      expect(profile).toEqual({
        email: 'user@example.com',
        name: 'John Doe',
        providerId: 'google-user-123',
        provider: 'google',
      });
    });

    it('propagates token exchange errors', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 400 },
      });

      await expect(oauthService.exchangeAuthCodeForProfile('google', 'invalid-code')).rejects.toThrow(
        'Invalid authorization code',
      );
    });

    it('propagates user profile fetch errors', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'google-access-token',
          expires_in: 3600,
        },
      });

      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(oauthService.exchangeAuthCodeForProfile('google', 'code')).rejects.toThrow(
        'Failed to fetch user profile',
      );
    });
  });
});
