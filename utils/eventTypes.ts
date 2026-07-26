/**
 * Deep module C — `eventTypes`.
 *
 * Pure canonical list of App Store Connect webhook event-type identifiers plus
 * a merge/dedupe/normalize function. It knows nothing about n8n or HTTP: the
 * declarative Create/Update operations call `mergeEventTypes` from a `preSend`
 * hook to combine the multi-select of known types with the free-text raw
 * override before building the request body.
 *
 * See `docs/apple-api-notes.md` → "Webhook event types" for the source list.
 * The identifiers below are Apple's, confirmed against
 * developer.apple.com/documentation/appstoreconnectapi/webhook-events.
 */

/**
 * Known event-type identifiers for the ASC webhooks `eventTypes` attribute,
 * confirmed live against `POST /v1/webhooks` (a bad value returns a 409 listing
 * the valid enum).
 *
 * ⚠️ Two different spellings exist for the same events:
 *  - **Subscription** (this list — the `eventTypes` sent on Create/Update):
 *    SCREAMING_SNAKE_CASE, e.g. `BUILD_UPLOAD_STATE_UPDATED`.
 *  - **Delivery** (the webhook payload's `data.type`): camelCase, e.g.
 *    `buildUploadStateUpdated` (this list is not used to match deliveries).
 *
 * There is no "ping" event type — a test ping (POST /v1/webhookPings) is
 * delivered as an ordinary event carrying `data.attributes.ping === true`, which
 * the Trigger surfaces as `isPing`. The raw-override field still lets users
 * subscribe to anything Apple adds later without a node update.
 */
export const KNOWN_EVENT_TYPES = [
	'APP_STORE_VERSION_APP_VERSION_STATE_UPDATED',
	'BUILD_UPLOAD_STATE_UPDATED',
	'BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED',
	'BETA_FEEDBACK_CRASH_SUBMISSION_CREATED',
	'BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED',
	'BACKGROUND_ASSET_VERSION_STATE_UPDATED',
	'BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED',
	'BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED',
	'BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED',
	'ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED',
	'ALTERNATIVE_DISTRIBUTION_PACKAGE_AVAILABLE_UPDATED',
	'ALTERNATIVE_DISTRIBUTION_TERRITORY_AVAILABILITY_UPDATED',
] as const;

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

/**
 * Split a raw-override string on commas and/or whitespace (including
 * newlines), trimming each piece and dropping empties. Tolerates `undefined`/
 * `null`/empty input.
 */
function splitRawOverride(raw: string | undefined | null): string[] {
	if (!raw) {
		return [];
	}
	return raw
		.split(/[\s,]+/)
		.map((piece) => piece.trim())
		.filter((piece) => piece.length > 0);
}

/**
 * Merge the selected known event types with a free-text raw-override string,
 * de-duplicating and normalizing (trimming; splitting the raw override on
 * commas/whitespace). Order is stable: `selected` first (in the order given),
 * then any new identifiers found in `rawOverride` (in the order encountered),
 * skipping anything already present.
 *
 * Pure and side-effect-free: safe to call directly from a unit test or from
 * the declarative node's `preSend` hook.
 */
export function mergeEventTypes(
	selected: string[] | undefined | null,
	rawOverride?: string | undefined | null,
): string[] {
	const normalizedSelected = (selected ?? [])
		.map((type) => type.trim())
		.filter((type) => type.length > 0);
	const normalizedRaw = splitRawOverride(rawOverride);

	const merged: string[] = [];
	const seen = new Set<string>();

	for (const type of [...normalizedSelected, ...normalizedRaw]) {
		if (!seen.has(type)) {
			seen.add(type);
			merged.push(type);
		}
	}

	return merged;
}
