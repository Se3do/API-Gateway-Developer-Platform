import axios from 'axios';
import { BadRequestError, UnauthorizedError } from '@api-gateway/shared';

export interface OAuthUserProfile {
  email: string;
  name: string;
  providerId: string;
  provider: 'google' | 'github';
}

export interface OAuthConfig {
  provider: 'google' | 'github';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

/**
 * OAuth state token storage (in-memory, 10-minute expiry)
 * Production: Consider moving to Redis for multi-instance deployment
 */
const stateStore = new Map<string, { createdAt: number }>();

const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function cleanExpiredStates(): void {
  const now = Date.now();
  for (const [state, data] of stateStore.entries()) {
    if (now - data.createdAt > STATE_EXPIRY_MS) {
      stateStore.delete(state);
    }
  }
}

export function createOAuthService(configs: Record<'google' | 'github', OAuthConfig>) {
  async function generateAuthorizationUrl(provider: 'google' | 'github'): Promise<{ url: string; state: string }> {
    const config = configs[provider];
    if (!config) {
      throw new BadRequestError(`Unsupported OAuth provider: ${provider}`);
    }

    // Generate random state token
    const state = Buffer.from(Date.now() + Math.random().toString()).toString('base64').replace(/[^a-zA-Z0-9]/g, '');

    // Store state for validation
    stateStore.set(state, { createdAt: Date.now() });

    // Clean expired states periodically
    if (Math.random() < 0.1) {
      cleanExpiredStates();
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: provider === 'google' ? 'openid profile email' : 'user:email',
      state,
    });

    const url = `${config.authorizationUrl}?${params.toString()}`;
    return { url, state };
  }

  async function validateStateToken(state: string): Promise<void> {
    const data = stateStore.get(state);

    if (!data) {
      throw new BadRequestError('Invalid or expired state token');
    }

    const now = Date.now();
    if (now - data.createdAt > STATE_EXPIRY_MS) {
      stateStore.delete(state);
      throw new BadRequestError('State token expired');
    }

    // Consume state token (one-time use)
    stateStore.delete(state);
  }

  async function exchangeCodeForTokens(
    provider: 'google' | 'github',
    code: string,
  ): Promise<{
    accessToken: string;
    idToken?: string; // Google only
    expiresIn: number;
  }> {
    const config = configs[provider];
    if (!config) {
      throw new BadRequestError(`Unsupported OAuth provider: ${provider}`);
    }

    try {
      const response = await axios.post(
        config.tokenUrl,
        {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        },
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      const { access_token, id_token, expires_in } = response.data;

      if (!access_token) {
        throw new UnauthorizedError('Failed to obtain access token from provider');
      }

      return {
        accessToken: access_token,
        idToken: id_token,
        expiresIn: expires_in || 3600,
      };
    } catch (err: any) {
      if (err.response?.status === 400) {
        throw new UnauthorizedError('Invalid authorization code or provider error');
      }
      throw new UnauthorizedError(`OAuth provider error: ${err.message}`);
    }
  }

  async function fetchUserProfile(provider: 'google' | 'github', accessToken: string): Promise<OAuthUserProfile> {
    const config = configs[provider];
    if (!config) {
      throw new BadRequestError(`Unsupported OAuth provider: ${provider}`);
    }

    try {
      const response = await axios.get(config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.data;

      if (provider === 'google') {
        const { sub, email, name, given_name } = data;
        if (!email || !sub) {
          throw new UnauthorizedError('Missing required profile information from Google');
        }
        return {
          email,
          name: name || given_name || email.split('@')[0],
          providerId: sub,
          provider: 'google',
        };
      } else if (provider === 'github') {
        const { id, email, name, login } = data;
        if (!id) {
          throw new UnauthorizedError('Missing required profile information from GitHub');
        }
        // GitHub may not return email, need to fetch separately
        if (!email) {
          try {
            const emailResponse = await axios.get('https://api.github.com/user/emails', {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });
            const primaryEmail = (emailResponse.data as Array<{ email: string; primary: boolean }>).find(
              (e) => e.primary,
            );
            if (!primaryEmail?.email) {
              throw new UnauthorizedError('No primary email found on GitHub account');
            }
            return {
              email: primaryEmail.email,
              name: name || login,
              providerId: id.toString(),
              provider: 'github',
            };
          } catch (err) {
            if (err instanceof UnauthorizedError) throw err;
            throw new UnauthorizedError('Failed to fetch email from GitHub');
          }
        }
        return {
          email,
          name: name || login,
          providerId: id.toString(),
          provider: 'github',
        };
      }

      throw new BadRequestError(`Unsupported provider: ${provider}`);
    } catch (err: any) {
      if (err instanceof UnauthorizedError || err instanceof BadRequestError) {
        throw err;
      }
      throw new UnauthorizedError(`Failed to fetch user profile: ${err.message}`);
    }
  }

  async function exchangeAuthCodeForProfile(
    provider: 'google' | 'github',
    code: string,
  ): Promise<OAuthUserProfile> {
    const tokens = await exchangeCodeForTokens(provider, code);
    const profile = await fetchUserProfile(provider, tokens.accessToken);
    return profile;
  }

  return {
    generateAuthorizationUrl,
    validateStateToken,
    exchangeCodeForTokens,
    fetchUserProfile,
    exchangeAuthCodeForProfile,
  };
}

export type OAuthService = ReturnType<typeof createOAuthService>;
