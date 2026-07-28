import { createVerify, generateKeyPairSync } from 'node:crypto';

import {
	ASC_AUDIENCE,
	DEFAULT_EXPIRES_IN_SECONDS,
	MAX_EXPIRES_IN_SECONDS,
	signAscToken,
	type AscTokenParams,
} from './ascToken';

interface DecodedJwt {
	header: Record<string, unknown>;
	claims: Record<string, unknown>;
	signingInput: string;
	signature: Buffer;
}

function decodeJwt(token: string): DecodedJwt {
	const parts = token.split('.');
	expect(parts).toHaveLength(3);
	const [headerPart, claimsPart, signaturePart] = parts;
	return {
		header: JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')),
		claims: JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8')),
		signingInput: `${headerPart}.${claimsPart}`,
		signature: Buffer.from(signaturePart, 'base64url'),
	};
}

/** Generate a throwaway EC P-256 keypair mirroring an Apple `.p8` key. */
function makeKeyPair() {
	const { publicKey, privateKey } = generateKeyPairSync('ec', {
		namedCurve: 'P-256',
	});
	return {
		publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
		privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
	};
}

const FIXED_NOW = 1_700_000_000;

describe('signAscToken', () => {
	const { publicKeyPem, privateKeyPem } = makeKeyPair();

	const teamParams: AscTokenParams = {
		keyId: 'ABC123DEF4',
		privateKey: privateKeyPem,
		keyType: 'team',
		issuerId: '69a6de70-03db-11e5-0000-c8a1e1c1abcd',
		nowSeconds: FIXED_NOW,
	};

	it('produces a JWT with the ES256 header (alg, kid, typ)', () => {
		const { header } = decodeJwt(signAscToken(teamParams));
		expect(header).toEqual({
			alg: 'ES256',
			kid: 'ABC123DEF4',
			typ: 'JWT',
		});
	});

	it('sets the audience, issuer and bounded expiry for a Team key', () => {
		const { claims } = decodeJwt(signAscToken(teamParams));
		expect(claims.aud).toBe(ASC_AUDIENCE);
		expect(claims.iss).toBe(teamParams.issuerId);
		expect(claims.sub).toBeUndefined();
		expect(claims.iat).toBe(FIXED_NOW);
		expect(claims.exp).toBe(FIXED_NOW + DEFAULT_EXPIRES_IN_SECONDS);
		// Expiry sits strictly inside Apple's 20-minute hard limit.
		expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(
			MAX_EXPIRES_IN_SECONDS,
		);
		expect((claims.exp as number) - (claims.iat as number)).toBeGreaterThan(0);
	});

	it('signs with the private key so the matching public key verifies it', () => {
		const { signingInput, signature } = decodeJwt(signAscToken(teamParams));
		const verifier = createVerify('SHA256');
		verifier.update(signingInput);
		verifier.end();
		const verified = verifier.verify(
			{ key: publicKeyPem, dsaEncoding: 'ieee-p1363' },
			signature,
		);
		expect(verified).toBe(true);
	});

	it('accepts a PEM whose newlines were stripped on paste (single line)', () => {
		// Simulate a .p8 pasted through a field/clipboard that collapsed all
		// newlines: markers present, body unwrapped onto one line.
		const oneLine = privateKeyPem.replace(/\s+/g, ' ').trim();
		expect(oneLine).not.toContain('\n');
		const token = signAscToken({ ...teamParams, privateKey: oneLine });
		const { signingInput, signature } = decodeJwt(token);
		const verifier = createVerify('SHA256');
		verifier.update(signingInput);
		verifier.end();
		expect(
			verifier.verify({ key: publicKeyPem, dsaEncoding: 'ieee-p1363' }, signature),
		).toBe(true);
	});

	it('accepts a PEM whose newlines became literal \\n escapes (copied from JSON/.env)', () => {
		// Pasting a key out of a JSON string, a `.env`, or a CI secret turns the
		// real newlines into literal backslash-n text. OpenSSL then reports
		// `DECODER routines::unsupported` unless we strip those escapes.
		const escaped = privateKeyPem.replace(/\r?\n/g, '\\n');
		expect(escaped).toContain('\\n');
		expect(escaped).not.toContain('\n');
		const token = signAscToken({ ...teamParams, privateKey: escaped });
		const { signingInput, signature } = decodeJwt(token);
		const verifier = createVerify('SHA256');
		verifier.update(signingInput);
		verifier.end();
		expect(
			verifier.verify({ key: publicKeyPem, dsaEncoding: 'ieee-p1363' }, signature),
		).toBe(true);
	});

	it('accepts a PEM wrapped in surrounding quotes with literal \\n escapes', () => {
		// The env-var shape: `"-----BEGIN…\n…\n-----END…-----\n"`, quotes and all.
		const quoted = `"${privateKeyPem.replace(/\r?\n/g, '\\n')}"`;
		const token = signAscToken({ ...teamParams, privateKey: quoted });
		const { signingInput, signature } = decodeJwt(token);
		const verifier = createVerify('SHA256');
		verifier.update(signingInput);
		verifier.end();
		expect(
			verifier.verify({ key: publicKeyPem, dsaEncoding: 'ieee-p1363' }, signature),
		).toBe(true);
	});

	it('does not verify against an unrelated public key', () => {
		const other = makeKeyPair();
		const { signingInput, signature } = decodeJwt(signAscToken(teamParams));
		const verifier = createVerify('SHA256');
		verifier.update(signingInput);
		verifier.end();
		expect(
			verifier.verify(
				{ key: other.publicKeyPem, dsaEncoding: 'ieee-p1363' },
				signature,
			),
		).toBe(false);
	});

	it('emits a 64-byte raw (ieee-p1363) signature, not ASN.1 DER', () => {
		const { signature } = decodeJwt(signAscToken(teamParams));
		expect(signature).toHaveLength(64);
	});

	it('honours a custom expiry within the limit', () => {
		const { claims } = decodeJwt(
			signAscToken({ ...teamParams, expiresInSeconds: 600 }),
		);
		expect((claims.exp as number) - (claims.iat as number)).toBe(600);
	});

	it('rejects an expiry beyond the 20-minute maximum', () => {
		expect(() =>
			signAscToken({ ...teamParams, expiresInSeconds: MAX_EXPIRES_IN_SECONDS + 1 }),
		).toThrow(/20|hard limit|exceed/i);
	});

	it('requires an Issuer ID for Team keys', () => {
		expect(() => signAscToken({ ...teamParams, issuerId: undefined })).toThrow(
			/Issuer ID/i,
		);
	});

	it('requires a Key ID', () => {
		expect(() => signAscToken({ ...teamParams, keyId: '' })).toThrow(/Key ID/i);
	});

	it('rejects an unparseable private key', () => {
		expect(() =>
			signAscToken({ ...teamParams, privateKey: 'not-a-key' }),
		).toThrow(/private key/i);
	});

	describe('Individual key claim form', () => {
		const individualParams: AscTokenParams = {
			keyId: 'ABC123DEF4',
			privateKey: privateKeyPem,
			keyType: 'individual',
			nowSeconds: FIXED_NOW,
		};

		it('produces a JWT with the ES256 header (alg, kid, typ)', () => {
			const { header } = decodeJwt(signAscToken(individualParams));
			expect(header).toEqual({
				alg: 'ES256',
				kid: 'ABC123DEF4',
				typ: 'JWT',
			});
		});

		it('omits iss and sets sub=user, with the audience and bounded expiry identical to Team', () => {
			const { claims } = decodeJwt(signAscToken(individualParams));
			expect(claims.iss).toBeUndefined();
			expect(claims.sub).toBe('user');
			expect(claims.aud).toBe(ASC_AUDIENCE);
			expect(claims.iat).toBe(FIXED_NOW);
			expect(claims.exp).toBe(FIXED_NOW + DEFAULT_EXPIRES_IN_SECONDS);
			expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(
				MAX_EXPIRES_IN_SECONDS,
			);
			expect((claims.exp as number) - (claims.iat as number)).toBeGreaterThan(0);
		});

		it('signs Individual-key tokens with the private key so the matching public key verifies it', () => {
			const { signingInput, signature } = decodeJwt(signAscToken(individualParams));
			const verifier = createVerify('SHA256');
			verifier.update(signingInput);
			verifier.end();
			const verified = verifier.verify(
				{ key: publicKeyPem, dsaEncoding: 'ieee-p1363' },
				signature,
			);
			expect(verified).toBe(true);
		});

		it('rejects an Issuer ID on an Individual key', () => {
			expect(() =>
				signAscToken({ ...individualParams, issuerId: 'should-not-be-here' }),
			).toThrow(/must not include an Issuer ID/i);
		});
	});
});
