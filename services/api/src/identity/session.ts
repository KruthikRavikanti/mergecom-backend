import { hashToken, randomToken } from '../security/crypto';
import type { SessionMaterial } from './store';

export interface NewSession {
  csrfToken: string;
  material: SessionMaterial;
  token: string;
}

export function createSessionMaterial(
  now: Date,
  idleMilliseconds: number,
  absoluteMilliseconds: number,
): NewSession {
  const token = randomToken();
  const csrfToken = randomToken();
  return {
    csrfToken,
    material: {
      absoluteExpiresAt: new Date(now.getTime() + absoluteMilliseconds),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt: new Date(now.getTime() + idleMilliseconds),
      tokenHash: hashToken(token),
    },
    token,
  };
}
