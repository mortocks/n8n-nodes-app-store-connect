// Wrap the real `timingSafeEqual` in a `jest.fn` so the tests can assert the
// comparison genuinely routes through it (with real behavior preserved) — the
// export is non-configurable, so `jest.spyOn` cannot be used directly.
jest.mock('node:crypto', () => {
	const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
	return {
		...actual,
		timingSafeEqual: jest.fn(actual.timingSafeEqual),
	};
});

import * as crypto from 'node:crypto';

import {
	ASC_SIGNATURE_HEADER,
	ASC_SIGNATURE_PREFIX,
	verifyWebhookSignature,
} from './verifyWebhookSignature';

const timingSafeEqualMock = crypto.timingSafeEqual as jest.MockedFunction<
	typeof crypto.timingSafeEqual
>;

/**
 * Compute the reference digest the same way ASC does, so the test's own
 * expectation is an independently-derived fixed vector (not a call back into
 * the code under test).
 */
function hmacHex(secret: string, body: Buffer | string): string {
	return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const SECRET = 'super-secret-shared-value';
const RAW_BODY =
	'{"data":{"type":"webhookDeliveries","id":"abc123","attributes":{"eventType":"buildUploadStateUpdated"}}}';
const GOOD_HEX = hmacHex(SECRET, RAW_BODY);

describe('verifyWebhookSignature', () => {
	describe('constants match the confirmed ASC contract', () => {
		it('exposes the lowercase header name and the literal prefix', () => {
			expect(ASC_SIGNATURE_HEADER).toBe('x-apple-signature');
			expect(ASC_SIGNATURE_PREFIX).toBe('hmacsha256=');
			// The vector is a 64-char (256-bit) lowercase hex digest.
			expect(GOOD_HEX).toMatch(/^[0-9a-f]{64}$/);
		});
	});

	describe('accepts a genuine signature', () => {
		it('returns true for the bare hex digest (no prefix)', () => {
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: GOOD_HEX, secret: SECRET }),
			).toBe(true);
		});

		it('returns true with the hmacsha256= prefix', () => {
			expect(
				verifyWebhookSignature({
					rawBody: RAW_BODY,
					signature: `${ASC_SIGNATURE_PREFIX}${GOOD_HEX}`,
					secret: SECRET,
				}),
			).toBe(true);
		});

		it('returns true for mixed-case hex (case-insensitive)', () => {
			expect(
				verifyWebhookSignature({
					rawBody: RAW_BODY,
					signature: `hmacsha256=${GOOD_HEX.toUpperCase()}`,
					secret: SECRET,
				}),
			).toBe(true);
		});

		it('tolerates a case-variant prefix and surrounding whitespace', () => {
			expect(
				verifyWebhookSignature({
					rawBody: RAW_BODY,
					signature: `  HmacSha256=${GOOD_HEX}  `,
					secret: SECRET,
				}),
			).toBe(true);
		});

		it('verifies the raw body passed as a Buffer identically to a string', () => {
			expect(
				verifyWebhookSignature({
					rawBody: Buffer.from(RAW_BODY, 'utf8'),
					signature: GOOD_HEX,
					secret: SECRET,
				}),
			).toBe(true);
		});
	});

	describe('rejects invalid signatures (fails closed)', () => {
		it('returns false when the body was tampered with', () => {
			const tampered = RAW_BODY.replace('buildUploadStateUpdated', 'betaFeedbackCrashSubmissionCreated');
			expect(
				verifyWebhookSignature({ rawBody: tampered, signature: GOOD_HEX, secret: SECRET }),
			).toBe(false);
		});

		it('returns false for the wrong secret', () => {
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: GOOD_HEX, secret: 'wrong-secret' }),
			).toBe(false);
		});

		it('returns false for a garbage same-length hex signature', () => {
			const garbage = 'f'.repeat(GOOD_HEX.length);
			expect(garbage).toHaveLength(GOOD_HEX.length);
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: garbage, secret: SECRET }),
			).toBe(false);
		});

		it('returns false for a signature of a different length (no throw)', () => {
			expect(() =>
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: 'deadbeef', secret: SECRET }),
			).not.toThrow();
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: 'deadbeef', secret: SECRET }),
			).toBe(false);
		});

		it('returns false for an empty signature', () => {
			expect(verifyWebhookSignature({ rawBody: RAW_BODY, signature: '', secret: SECRET })).toBe(
				false,
			);
		});

		it('returns false for a whitespace-only / prefix-only signature', () => {
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: '   ', secret: SECRET }),
			).toBe(false);
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: 'hmacsha256=', secret: SECRET }),
			).toBe(false);
		});

		it('returns false for a missing signature (undefined/null)', () => {
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: undefined, secret: SECRET }),
			).toBe(false);
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: null, secret: SECRET }),
			).toBe(false);
		});

		it('returns false for a missing/empty secret', () => {
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: GOOD_HEX, secret: '' }),
			).toBe(false);
			expect(
				verifyWebhookSignature({ rawBody: RAW_BODY, signature: GOOD_HEX, secret: undefined }),
			).toBe(false);
		});
	});

	describe('comparison is timing-safe', () => {
		// `clearMocks: true` (jest.config.js) resets call history before each test.
		it('routes an equal-length compare through crypto.timingSafeEqual with equal-length buffers', () => {
			const result = verifyWebhookSignature({
				rawBody: RAW_BODY,
				signature: GOOD_HEX,
				secret: SECRET,
			});
			expect(result).toBe(true);
			expect(timingSafeEqualMock).toHaveBeenCalledTimes(1);
			const [a, b] = timingSafeEqualMock.mock.calls[0];
			expect(Buffer.isBuffer(a)).toBe(true);
			expect(Buffer.isBuffer(b)).toBe(true);
			expect((a as Buffer).length).toBe((b as Buffer).length);
		});

		it('short-circuits BEFORE timingSafeEqual on a length mismatch (so it cannot throw)', () => {
			const result = verifyWebhookSignature({
				rawBody: RAW_BODY,
				signature: 'deadbeef',
				secret: SECRET,
			});
			expect(result).toBe(false);
			// The guard runs first, so the (throw-prone) compare is never reached.
			expect(timingSafeEqualMock).not.toHaveBeenCalled();
		});
	});
});
