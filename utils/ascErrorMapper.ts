/**
 * Deep module D — `ascErrorMapper`.
 *
 * Pure translator from App Store Connect's JSON:API `errors[]` payloads into a
 * single human-readable message. It does not build the `NodeApiError` itself
 * (that needs the node/execution context and lives in the transport layer);
 * keeping this a pure string-in/string-out function makes it trivially testable
 * with representative fixtures.
 *
 * See `docs/apple-api-notes.md` for the error shape.
 */

/** A single JSON:API error object as returned by ASC. */
export interface AscApiError {
	id?: string;
	status?: string;
	code?: string;
	title?: string;
	detail?: string;
	source?: {
		pointer?: string;
		parameter?: string;
	};
}

/** The `{ errors: [...] }` envelope ASC returns on failure. */
export interface AscErrorPayload {
	errors?: AscApiError[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Type guard: does this look like an ASC JSON:API error payload with at least
 * one error object?
 */
export function isAscErrorPayload(body: unknown): body is AscErrorPayload {
	return (
		isRecord(body) &&
		Array.isArray((body as AscErrorPayload).errors) &&
		(body as AscErrorPayload).errors!.length > 0
	);
}

function formatSingleError(error: AscApiError): string {
	// Prefer the most specific human text ASC gives us.
	const headline = error.title?.trim();
	const detail = error.detail?.trim();

	let message: string;
	if (headline && detail && headline !== detail) {
		message = `${headline}: ${detail}`;
	} else {
		message = detail || headline || error.code?.trim() || 'Unknown App Store Connect error';
	}

	const location = error.source?.pointer?.trim() || error.source?.parameter?.trim();
	if (location) {
		message += ` (at ${location})`;
	}

	return message;
}

/**
 * Build a readable message from an ASC error body. Returns `undefined` when the
 * body is not a recognisable JSON:API error payload, so callers can fall back
 * to a generic HTTP message.
 */
export function formatAscErrorMessage(body: unknown): string | undefined {
	if (!isAscErrorPayload(body)) {
		return undefined;
	}

	const messages = body
		.errors!.map(formatSingleError)
		.filter((message) => message.length > 0);

	if (messages.length === 0) {
		return undefined;
	}

	return messages.join('; ');
}
