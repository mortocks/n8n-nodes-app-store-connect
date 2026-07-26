import { createHmac } from 'node:crypto';

import { ASC_SIGNATURE_PREFIX } from '../../utils/verifyWebhookSignature';
import {
	extractEventMetadata,
	processWebhookRequest,
	type ProcessWebhookRequestParams,
} from './processWebhookRequest';

/** Independently-derived reference digest (not a call back into module B). */
function sign(secret: string, body: string): string {
	return `${ASC_SIGNATURE_PREFIX}${createHmac('sha256', secret).update(body).digest('hex')}`;
}

const SECRET = 'super-secret-shared-value';

// Apple's real delivery shape: event type in `data.type`, id in `data.id`.
const EVENT_BODY = JSON.stringify({
	data: {
		type: 'buildUploadStateUpdated',
		id: 'delivery-123',
		version: 1,
		attributes: { timestamp: '2025-04-16T05:00:52.745Z', ping: false },
	},
});

// A test ping arrives as an ordinary event flagged with `attributes.ping: true`.
const PING_BODY = JSON.stringify({
	data: {
		type: 'buildUploadStateUpdated',
		id: 'ping-999',
		version: 1,
		attributes: { timestamp: '2025-04-16T05:00:52.745Z', ping: true },
	},
});

function params(overrides: Partial<ProcessWebhookRequestParams>): ProcessWebhookRequestParams {
	return {
		rawBody: EVENT_BODY,
		payload: JSON.parse(EVENT_BODY) as Record<string, unknown>,
		signature: sign(SECRET, EVENT_BODY),
		secret: SECRET,
		skipValidation: false,
		...overrides,
	};
}

describe('processWebhookRequest', () => {
	describe('valid signature → emit with metadata', () => {
		it('emits one item carrying payload, eventType and deliveryId', () => {
			const result = processWebhookRequest(params({}));

			expect(result.action).toBe('emit');
			if (result.action !== 'emit') return;
			expect(result.event.eventType).toBe('buildUploadStateUpdated');
			expect(result.event.deliveryId).toBe('delivery-123');
			expect(result.event.isPing).toBe(false);
			expect(result.event.payload).toEqual(JSON.parse(EVENT_BODY));
		});

		it('verifies against the raw bytes passed as a Buffer', () => {
			const rawBody = Buffer.from(EVENT_BODY, 'utf8');
			const result = processWebhookRequest(
				params({ rawBody, signature: sign(SECRET, EVENT_BODY) }),
			);
			expect(result.action).toBe('emit');
		});
	});

	describe("test ping → still emitted, flagged isPing", () => {
		it('flags a delivery with attributes.ping=true as a ping (and does not drop it)', () => {
			const result = processWebhookRequest(
				params({
					rawBody: PING_BODY,
					payload: JSON.parse(PING_BODY) as Record<string, unknown>,
					signature: sign(SECRET, PING_BODY),
				}),
			);

			expect(result.action).toBe('emit');
			if (result.action !== 'emit') return;
			expect(result.event.isPing).toBe(true);
			expect(result.event.eventType).toBe('buildUploadStateUpdated');
			expect(result.event.deliveryId).toBe('ping-999');
		});
	});

	describe('missing / invalid signature → reject (secure by default)', () => {
		it('rejects when the signature header is missing', () => {
			expect(processWebhookRequest(params({ signature: undefined })).action).toBe('reject');
			expect(processWebhookRequest(params({ signature: null })).action).toBe('reject');
			expect(processWebhookRequest(params({ signature: '' })).action).toBe('reject');
		});

		it('rejects a signature computed with the wrong secret', () => {
			const result = processWebhookRequest(params({ signature: sign('wrong-secret', EVENT_BODY) }));
			expect(result.action).toBe('reject');
		});

		it('rejects when the raw body was tampered with after signing', () => {
			const tampered = EVENT_BODY.replace('buildUploadStateUpdated', 'somethingElse');
			const result = processWebhookRequest(
				params({ rawBody: tampered, payload: JSON.parse(tampered) as Record<string, unknown> }),
			);
			expect(result.action).toBe('reject');
		});

		it('rejects when no secret is configured', () => {
			expect(processWebhookRequest(params({ secret: '' })).action).toBe('reject');
			expect(processWebhookRequest(params({ secret: undefined })).action).toBe('reject');
		});
	});

	describe('skipValidation → bypass verification (debug path)', () => {
		it('emits without verifying even when the signature is missing/invalid', () => {
			const result = processWebhookRequest(
				params({ signature: undefined, secret: undefined, skipValidation: true }),
			);
			expect(result.action).toBe('emit');
			if (result.action !== 'emit') return;
			expect(result.event.eventType).toBe('buildUploadStateUpdated');
		});
	});
});

describe('extractEventMetadata', () => {
	it('reads eventType from data.type and id from data.id', () => {
		const meta = extractEventMetadata(JSON.parse(EVENT_BODY) as Record<string, unknown>);
		expect(meta).toEqual({
			payload: JSON.parse(EVENT_BODY),
			eventType: 'buildUploadStateUpdated',
			deliveryId: 'delivery-123',
			isPing: false,
		});
	});

	it('falls back to top-level eventType/id when there is no data resource', () => {
		const payload = { eventType: 'buildUploadStateUpdated', id: 'top-level-1' };
		const meta = extractEventMetadata(payload);
		expect(meta.eventType).toBe('buildUploadStateUpdated');
		expect(meta.deliveryId).toBe('top-level-1');
	});

	it('tolerates a payload with no recognisable metadata', () => {
		const meta = extractEventMetadata({ foo: 'bar' });
		expect(meta.eventType).toBeUndefined();
		expect(meta.deliveryId).toBeUndefined();
		expect(meta.isPing).toBe(false);
	});
});
