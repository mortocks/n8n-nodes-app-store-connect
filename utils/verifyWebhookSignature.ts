import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Deep module B — `verifyWebhookSignature`.
 *
 * Pure, dependency-free (Node `crypto` only) verifier for App Store Connect
 * webhook deliveries. It is the SINGLE source of truth for signature checking:
 * both the standalone `Verify Webhook Signature` node (Task 05) and the Trigger
 * node (Task 06) call this exact function, so the crypto lives here and nowhere
 * else.
 *
 * ASC signs each delivery by computing `HMAC-SHA256(rawBody, secret)` and
 * sending it as the `x-apple-signature` header in the form
 * `hmacsha256=<lowercase-hex>`. See `docs/apple-api-notes.md` →
 * "Webhook signature verification (module B)" for the confirmed header name,
 * format and algorithm.
 *
 * Security notes:
 * - The HMAC is taken over the RAW request body bytes, never a re-serialized
 *   JSON representation (re-serializing would reorder keys / change whitespace
 *   and break the digest). Pass the bytes n8n received on the wire.
 * - The comparison is timing-safe (`crypto.timingSafeEqual`) and fails closed:
 *   any missing/empty input, or a length mismatch (which `timingSafeEqual`
 *   would otherwise throw on), returns `false` rather than throwing.
 */

/** The header ASC delivers the signature in (lowercase). */
export const ASC_SIGNATURE_HEADER = 'x-apple-signature';

/** The literal prefix ASC puts before the hex digest in the header value. */
export const ASC_SIGNATURE_PREFIX = 'hmacsha256=';

export interface VerifyWebhookSignatureParams {
	/**
	 * The raw request body exactly as received. A `Buffer` is compared byte for
	 * byte; a `string` is encoded as UTF-8. Do not pass re-serialized JSON.
	 */
	rawBody: Buffer | string;
	/**
	 * The `x-apple-signature` header value. Tolerated with or without the
	 * `hmacsha256=` prefix, and case-insensitive on the hex digest.
	 */
	signature: string | undefined | null;
	/** The shared webhook secret the delivery was signed with. */
	secret: string | undefined | null;
}

/**
 * Strip an optional (case-insensitive) `hmacsha256=` prefix and normalize the
 * remaining hex digest to lowercase.
 */
function normalizeSignature(signature: string): string {
	let value = signature.trim();
	if (value.toLowerCase().startsWith(ASC_SIGNATURE_PREFIX)) {
		value = value.slice(ASC_SIGNATURE_PREFIX.length);
	}
	return value.trim().toLowerCase();
}

/**
 * Verify an App Store Connect webhook signature.
 *
 * @returns `true` only when the provided signature matches
 * `HMAC-SHA256(rawBody, secret)`; `false` for any mismatch, missing/empty
 * signature or secret, or length mismatch. Never throws.
 */
export function verifyWebhookSignature(params: VerifyWebhookSignatureParams): boolean {
	const { rawBody, signature, secret } = params;

	// Fail closed on missing key material or signature.
	if (!secret) {
		return false;
	}
	if (signature === undefined || signature === null) {
		return false;
	}

	const provided = normalizeSignature(signature);
	if (provided.length === 0) {
		return false;
	}

	const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
	const expected = createHmac('sha256', secret).update(body).digest('hex');

	// Compare the lowercase-hex strings as bytes. Unequal lengths would make
	// `timingSafeEqual` throw, so guard and fail closed instead.
	const expectedBuffer = Buffer.from(expected, 'utf8');
	const providedBuffer = Buffer.from(provided, 'utf8');
	if (expectedBuffer.length !== providedBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, providedBuffer);
}
