import { describe, expect, it } from 'vitest';

import { validateIdentityClaims } from './claims';

const issuer = 'https://login.microsoftonline.com/tenant/v2.0';
const validClaims = {
  email: 'PERSON@Example.com',
  iss: issuer,
  name: 'Person One',
  oid: 'immutable-object-id',
  tid: 'tenant-id',
  xms_edov: true,
};

describe('identity claim validation', () => {
  it('maps a verified identity using immutable tenant and object IDs', () => {
    expect(validateIdentityClaims(validClaims, issuer)).toMatchObject({
      email: 'person@example.com',
      providerSubject: 'immutable-object-id',
      providerTenantId: 'tenant-id',
    });
  });

  it.each([
    ['altered issuer', { ...validClaims, iss: 'https://attacker.invalid' }],
    ['missing object ID', { ...validClaims, oid: undefined }],
    [
      'unverified email',
      { ...validClaims, email_verified: false, xms_edov: false },
    ],
  ])('rejects %s claims', (_label, claims) => {
    expect(() => validateIdentityClaims(claims, issuer)).toThrow();
  });
});
