import * as oidc from 'openid-client';

import type { ApiConfig } from '../config';

export interface OidcAuthorizationRequest {
  codeVerifier: string;
  nonce: string;
  state: string;
  url: URL;
}

export class OidcClient {
  private configuration: Promise<oidc.Configuration> | null = null;

  public constructor(private readonly config: ApiConfig) {
    if (!config.oidc) throw new Error('OIDC configuration is unavailable.');
  }

  public async createAuthorizationRequest(): Promise<OidcAuthorizationRequest> {
    const configuration = await this.getConfiguration();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const nonce = oidc.randomNonce();
    const state = oidc.randomState();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    return {
      codeVerifier,
      nonce,
      state,
      url: oidc.buildAuthorizationUrl(configuration, {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        nonce,
        redirect_uri: `${this.config.apiPublicOrigin}/auth/callback`,
        response_mode: 'query',
        response_type: 'code',
        scope: 'openid profile email',
        state,
      }),
    };
  }

  public async consumeCallback(
    callbackUrl: URL,
    checks: { codeVerifier: string; nonce: string; state: string },
  ): Promise<Record<string, unknown>> {
    const configuration = await this.getConfiguration();
    const tokens = await oidc.authorizationCodeGrant(
      configuration,
      callbackUrl,
      {
        expectedNonce: checks.nonce,
        expectedState: checks.state,
        idTokenExpected: true,
        pkceCodeVerifier: checks.codeVerifier,
      },
    );
    const claims = tokens.claims();
    if (!claims)
      throw new Error('The identity provider did not return an ID token.');
    return claims;
  }

  public async logoutUrl(): Promise<URL> {
    return oidc.buildEndSessionUrl(await this.getConfiguration(), {
      post_logout_redirect_uri: `${this.config.webOrigin}/login`,
    });
  }

  public async issuer(): Promise<string> {
    return (await this.getConfiguration()).serverMetadata().issuer;
  }

  private getConfiguration(): Promise<oidc.Configuration> {
    if (!this.configuration) {
      const settings = this.config.oidc;
      if (!settings) throw new Error('OIDC configuration is unavailable.');
      this.configuration = oidc.discovery(
        new URL(settings.issuer),
        settings.clientId,
        {
          ...(settings.clientSecret
            ? { client_secret: settings.clientSecret }
            : {}),
          redirect_uris: [`${this.config.apiPublicOrigin}/auth/callback`],
          response_types: ['code'],
        },
        settings.clientSecret
          ? oidc.ClientSecretPost(settings.clientSecret)
          : oidc.None(),
      );
    }
    return this.configuration;
  }
}
