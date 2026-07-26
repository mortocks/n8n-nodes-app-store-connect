import { verifyWebhookSignature } from '../../utils/verifyWebhookSignature';

/**
 * Pure request-processing decision for the App Store Connect Trigger.
 *
 * This is the security-critical branch of the Trigger node, factored out of the
 * (untestable) n8n `webhook()` framework glue so it can be unit-tested directly.
 * Given the raw request bytes, the `x-apple-signature` header value, the shared
 * secret, the already-parsed payload and the "skip validation" toggle, it
 * decides one of two things:
 *
 * - `{ action: 'reject' }`  — the signature is missing/invalid (and validation
 *   is on). The node must respond HTTP 401 and emit nothing. Secure by default.
 * - `{ action: 'emit', event }` — the request is authentic (or validation was
 *   explicitly skipped). The node emits exactly one item shaped as `event`.
 *
 * All crypto lives in deep module B (`verifyWebhookSignature`) — not
 * re-implemented here — so the Trigger and the standalone Verify node can never
 * diverge.
 */

/** The single item the Trigger emits for an authentic (or skip-validated) delivery. */
export interface EmittedEvent {
	/** The parsed webhook payload exactly as ASC sent it. */
	payload: Record<string, unknown>;
	/** The ASC event-type identifier, when present in the payload. */
	eventType: string | undefined;
	/** The delivery id, when present in the payload. */
	deliveryId: string | undefined;
	/** True when the delivery is a test ping (`attributes.ping === true`). */
	isPing: boolean;
}

export type ProcessWebhookResult =
	| { action: 'reject' }
	| { action: 'emit'; event: EmittedEvent };

export interface ProcessWebhookRequestParams {
	/** The raw request body exactly as received (never re-serialized JSON). */
	rawBody: Buffer | string;
	/** The parsed body, used only to shape the emitted item's metadata. */
	payload: Record<string, unknown>;
	/** The `x-apple-signature` header value (with or without prefix). */
	signature: string | undefined | null;
	/** The shared webhook secret to verify against. */
	secret: string | undefined | null;
	/** When true, bypass verification entirely (UNSAFE — debug only). */
	skipValidation: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Pull the `eventType`, delivery `id` and `isPing` flag out of an ASC delivery
 * payload. ASC delivers a JSON:API-style resource where the event type is the
 * `data.type` value and the delivery id is `data.id`:
 *
 *   { "data": { "type": "buildUploadStateUpdated", "id": "<uuid>", "version": 1,
 *               "attributes": { "timestamp": "...", "ping": false, ... },
 *               "relationships": { "instance": { "data": { ... } } } } }
 *
 * (confirmed against Apple's webhook-events docs). A test ping (POST
 * /v1/webhookPings) arrives as an ordinary event with `attributes.ping === true`.
 * Older/top-level fallbacks are kept so a slightly different live shape still
 * yields usable metadata rather than `undefined` everywhere.
 */
export function extractEventMetadata(payload: Record<string, unknown>): EmittedEvent {
	const data = isRecord(payload.data) ? payload.data : undefined;
	const attributes = data && isRecord(data.attributes) ? data.attributes : undefined;

	const eventType =
		asString(data?.type) ?? asString(attributes?.eventType) ?? asString(payload.eventType);
	const deliveryId = asString(data?.id) ?? asString(payload.id);

	return {
		payload,
		eventType,
		deliveryId,
		isPing: attributes?.ping === true,
	};
}

/**
 * Decide whether to reject (401, emit nothing) or emit one shaped item.
 * Verification is delegated to deep module B and fails closed there.
 */
export function processWebhookRequest(params: ProcessWebhookRequestParams): ProcessWebhookResult {
	const { rawBody, payload, signature, secret, skipValidation } = params;

	if (!skipValidation) {
		const valid = verifyWebhookSignature({ rawBody, signature, secret });
		if (!valid) {
			return { action: 'reject' };
		}
	}

	return { action: 'emit', event: extractEventMetadata(payload) };
}
