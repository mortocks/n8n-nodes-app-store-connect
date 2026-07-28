import type {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	INodeCredentialTestResult,
} from 'n8n-workflow';

import { formatAscErrorMessage } from './ascErrorMapper';
import { signAscToken, type AscKeyType } from './ascToken';

const ASC_APPS_URL = 'https://api.appstoreconnect.apple.com/v1/apps';

/**
 * Pull the App Store Connect JSON:API error body and HTTP status out of an
 * error thrown by `httpRequest`. n8n has wrapped the underlying axios error in
 * several shapes across versions, so probe the known locations defensively and
 * fall back to parsing a stringified body. Mirrors the `error.cause.response`
 * assumption in `transport/errors.ts`.
 */
function extractResponse(error: unknown): { status?: number; body?: unknown } {
	const e = error as {
		statusCode?: number;
		httpCode?: number | string;
		error?: unknown;
		cause?: { response?: { status?: number; data?: unknown } };
		response?: { status?: number; statusCode?: number; data?: unknown; body?: unknown };
	};

	const status =
		e.cause?.response?.status ??
		e.response?.status ??
		e.response?.statusCode ??
		e.statusCode ??
		(typeof e.httpCode === 'string' ? Number(e.httpCode) : e.httpCode);

	// `this.helpers.request` (request-promise) throws a StatusCodeError whose body
	// is on `.error` / `.response.body`; other wrappers use `cause.response.data`.
	let body: unknown =
		e.cause?.response?.data ?? e.response?.data ?? e.response?.body ?? e.error;

	if (typeof body === 'string') {
		try {
			body = JSON.parse(body);
		} catch {
			// leave as the raw string; the mapper will ignore it and we fall back
		}
	}

	return { status: typeof status === 'number' && !Number.isNaN(status) ? status : undefined, body };
}

/**
 * Credential test for the `App Store Connect API` credential (Team and
 * Individual keys).
 *
 * n8n's declarative credential test only reports a generic "Authorization
 * failed" for any non-2xx, which hides *why* a key is rejected — a real pain
 * when the token is valid but Apple is gating on something else. This code-based
 * test mints the same ES256 JWT the node uses and calls `GET /v1/apps`, then
 * translates Apple's actual response into an actionable message:
 *
 *  - 2xx → the key is fully working.
 *  - 401 `NOT_AUTHORIZED` → Apple rejected the token itself: the Key ID must
 *    match the `.p8` exactly (Individual key IDs are ~12 chars, Team ~10), the
 *    key must be active, Team keys need the correct Issuer ID, and Individual
 *    keys must leave it blank.
 *  - 403 (e.g. `REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`) → the token
 *    authenticated fine; the account/role is the blocker (sign the pending
 *    agreements in App Store Connect, or use a key whose role has access).
 *
 * Shared by the App Store Connect node and the Trigger (when it manages the
 * webhook) so every usage of the credential is tested — the n8n verification
 * scanner's `credential-test-required` rule requires that.
 */
export async function testApiCredential(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	const data = credential.data ?? {};
	const keyType = ((data.keyType as AscKeyType | undefined) ?? 'team') as AscKeyType;

	// Mint the token exactly as the credential's `authenticate` does; surface any
	// key-material / claim-shape problem before we ever hit the network.
	let token: string;
	try {
		token = signAscToken({
			keyId: data.keyId as string,
			issuerId: data.issuerId as string | undefined,
			privateKey: data.privateKey as string,
			keyType,
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return { status: 'Error', message: detail };
	}

	try {
		await this.helpers.request({
			method: 'GET',
			uri: ASC_APPS_URL,
			qs: { limit: 1 },
			headers: { Authorization: `Bearer ${token}` },
			json: true,
		});
		return {
			status: 'OK',
			message: 'Authentication successful — App Store Connect accepted this key.',
		};
	} catch (error) {
		const { status, body } = extractResponse(error);
		const appleMessage = formatAscErrorMessage(body);

		if (status === 401) {
			const keyIdHint =
				keyType === 'individual'
					? 'For an Individual key, the Key ID is typically ~12 characters and the Issuer ID must be left blank.'
					: 'For a Team key, check the Key ID (~10 characters) and that the Issuer ID matches the one shown above your keys in App Store Connect.';
			return {
				status: 'Error',
				message: `App Store Connect rejected the token (401 NOT_AUTHORIZED). Confirm the Key ID matches the downloaded .p8 (the file is named AuthKey_<KeyID>.p8) and that the key is still active. ${keyIdHint}${appleMessage ? ` Apple said: ${appleMessage}` : ''}`,
			};
		}

		if (status === 403) {
			return {
				status: 'Error',
				message: `The key authenticated, but App Store Connect refused the request (403). This is an account/agreement/role issue, not a bad key: sign any pending agreements in App Store Connect (Business → Agreements, Tax, and Banking) and make sure the key's role can read apps.${appleMessage ? ` Apple said: ${appleMessage}` : ''}`,
			};
		}

		if (appleMessage) {
			return { status: 'Error', message: `App Store Connect error: ${appleMessage}` };
		}

		const detail = error instanceof Error ? error.message : String(error);
		return {
			status: 'Error',
			message: `Could not reach App Store Connect${status ? ` (HTTP ${status})` : ''}: ${detail}`,
		};
	}
}
