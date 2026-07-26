import { createPrivateKey, createSign, type KeyObject } from 'node:crypto';

/**
 * Deep module A — `ascToken`.
 *
 * Pure ES256 JWT signer for the App Store Connect API. Owns JWT header and
 * claim construction plus expiry, and nothing else. It has no knowledge of n8n
 * or of how the token is transported; it takes key material in and returns a
 * signed compact JWS string.
 *
 * See `docs/apple-api-notes.md` for the confirmed claim rules.
 */

/**
 * ASC API key kind. Team keys carry an Issuer ID; Individual keys omit `iss`
 * and set `sub: "user"` instead. Task 01 only wires Team keys through the
 * credential UI, but the signer supports both so the credential's Key Type
 * toggle (Task 02) plugs in without touching this module.
 */
export type AscKeyType = 'team' | 'individual';

export interface AscTokenParams {
	/** The ASC API Key ID (the `kid` header value). */
	keyId: string;
	/** The `.p8` private key contents, an EC P-256 key in PKCS#8 PEM. */
	privateKey: string;
	/** Team or Individual key. Defaults to `team`. */
	keyType?: AscKeyType;
	/** The team Issuer ID (UUID). Required for `team`, forbidden for `individual`. */
	issuerId?: string;
	/**
	 * Current time in seconds since the epoch. Injectable for deterministic
	 * tests; defaults to the wall clock.
	 */
	nowSeconds?: number;
	/**
	 * Token lifetime in seconds. Defaults to 19 minutes. Apple rejects tokens
	 * whose lifetime exceeds 20 minutes, so values above the hard cap throw.
	 */
	expiresInSeconds?: number;
}

interface JwtHeader {
	alg: 'ES256';
	kid: string;
	typ: 'JWT';
}

interface JwtClaims {
	aud: string;
	iat: number;
	exp: number;
	iss?: string;
	sub?: string;
}

/** The ASC API audience claim (identical for both key types). */
export const ASC_AUDIENCE = 'appstoreconnect-v1';

/** Default token lifetime: 19 minutes, per the PRD. */
export const DEFAULT_EXPIRES_IN_SECONDS = 19 * 60;

/** Apple's hard maximum token lifetime: 20 minutes. */
export const MAX_EXPIRES_IN_SECONDS = 20 * 60;

function base64UrlEncode(input: Buffer | string): string {
	const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
	return buffer.toString('base64url');
}

/**
 * Normalize a PEM private key. Apple's `.p8` is a PEM whose body must be split
 * across newline-delimited lines, but pasting it into a single-line form field
 * (or through clipboards that strip newlines) commonly collapses it to one line
 * like `-----BEGIN PRIVATE KEY-----MHcC…-----END PRIVATE KEY-----`, which
 * OpenSSL cannot decode. If we can see the BEGIN/END markers, rebuild a
 * canonical PEM: take the base64 body between them, strip all whitespace, and
 * re-wrap at 64 characters. Idempotent for already-valid keys; left untouched
 * if the markers aren't present.
 */
function normalizePem(pem: string): string {
	const match = pem.match(/-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/);
	if (!match) {
		return pem;
	}
	const label = match[1].trim();
	const body = match[2].replace(/\s+/g, '');
	const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
	return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

function loadPrivateKey(privateKey: string): KeyObject {
	const trimmed = privateKey?.trim();
	if (!trimmed) {
		throw new Error('App Store Connect token: private key is empty.');
	}
	try {
		return createPrivateKey(normalizePem(trimmed));
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`App Store Connect token: could not parse the .p8 private key (${detail}).`,
		);
	}
}

function buildClaims(params: AscTokenParams, iat: number, exp: number): JwtClaims {
	const keyType = params.keyType ?? 'team';
	const claims: JwtClaims = {
		aud: ASC_AUDIENCE,
		iat,
		exp,
	};

	if (keyType === 'team') {
		const issuerId = params.issuerId?.trim();
		if (!issuerId) {
			throw new Error('App Store Connect token: Team keys require an Issuer ID.');
		}
		claims.iss = issuerId;
	} else {
		if (params.issuerId?.trim()) {
			throw new Error(
				'App Store Connect token: Individual keys must not include an Issuer ID.',
			);
		}
		claims.sub = 'user';
	}

	return claims;
}

/**
 * Sign a short-lived ES256 JWT for the App Store Connect API.
 *
 * @returns the compact JWS string (`header.payload.signature`).
 */
export function signAscToken(params: AscTokenParams): string {
	const keyId = params.keyId?.trim();
	if (!keyId) {
		throw new Error('App Store Connect token: Key ID is required.');
	}

	const expiresInSeconds = params.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
	if (expiresInSeconds <= 0) {
		throw new Error('App Store Connect token: expiry must be positive.');
	}
	if (expiresInSeconds > MAX_EXPIRES_IN_SECONDS) {
		throw new Error(
			`App Store Connect token: expiry must not exceed ${MAX_EXPIRES_IN_SECONDS} seconds (Apple's hard limit).`,
		);
	}

	const iat = Math.floor(params.nowSeconds ?? Date.now() / 1000);
	const exp = iat + expiresInSeconds;

	const header: JwtHeader = { alg: 'ES256', kid: keyId, typ: 'JWT' };
	const claims = buildClaims(params, iat, exp);

	const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
		JSON.stringify(claims),
	)}`;

	const key = loadPrivateKey(params.privateKey);
	if (key.asymmetricKeyType !== 'ec') {
		throw new Error(
			'App Store Connect token: the private key must be an EC (P-256) key.',
		);
	}

	const signer = createSign('SHA256');
	signer.update(signingInput);
	signer.end();
	// `ieee-p1363` yields the raw r||s form JOSE/JWT requires (not ASN.1 DER).
	const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' });

	return `${signingInput}.${base64UrlEncode(signature)}`;
}
