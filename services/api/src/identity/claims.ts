import type { VerifiedIdentity } from './types';

type IdentityClaims = Record<string, unknown>;

function requiredString(claims: IdentityClaims, name: string): string {
  const value = claims[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`The ${name} identity claim is required.`);
  }
  return value;
}

export function validateIdentityClaims(
  claims: IdentityClaims,
  expectedIssuer: string,
): VerifiedIdentity {
  const issuer = requiredString(claims, 'iss');
  if (issuer !== expectedIssuer)
    throw new Error('The identity issuer is invalid.');

  const email = requiredString(claims, 'email').trim().toLowerCase();
  const emailVerified =
    claims.email_verified === true || claims.xms_edov === true;
  if (!emailVerified) throw new Error('A verified email claim is required.');

  const providerSubject = requiredString(claims, 'oid');
  const providerTenantId = requiredString(claims, 'tid');
  const displayName =
    typeof claims.name === 'string' && claims.name.trim() !== ''
      ? claims.name.trim()
      : email;

  return {
    displayName,
    email,
    emailVerified: true,
    issuer,
    providerSessionId: typeof claims.sid === 'string' ? claims.sid : undefined,
    providerSubject,
    providerTenantId,
  };
}
