import { generateKeyPairSync } from 'node:crypto';

import type { ICredentialTestFunctions, ICredentialsDecrypted } from 'n8n-workflow';

import { testApiCredential } from './apiCredentialTest';

function makePrivateKeyPem(): string {
	const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
	return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

/**
 * Build a mock `ICredentialTestFunctions` whose `request` either resolves
 * (success) or rejects with an error shaped like the one n8n throws on a non-2xx
 * (`cause.response.{status,data}`), so we can drive each branch.
 */
function mockContext(behaviour: { resolve?: unknown; rejectStatus?: number; rejectBody?: unknown }) {
	// Mirrors the request-promise StatusCodeError shape (`statusCode` + `error`
	// body) that `this.helpers.request` throws on a non-2xx response.
	const request = jest.fn(async (_options: Record<string, unknown>) => {
		if (behaviour.rejectStatus !== undefined) {
			throw {
				message: `${behaviour.rejectStatus} - error`,
				statusCode: behaviour.rejectStatus,
				error: behaviour.rejectBody,
			};
		}
		return behaviour.resolve ?? { data: [] };
	});
	return {
		ctx: { helpers: { request } } as unknown as ICredentialTestFunctions,
		request,
	};
}

function credential(data: Record<string, unknown>): ICredentialsDecrypted {
	return { id: 'x', name: 'ASC', type: 'appStoreConnectApi', data } as ICredentialsDecrypted;
}

const privateKey = makePrivateKeyPem();
const teamData = {
	keyType: 'team',
	keyId: 'ABC123DEF4',
	issuerId: '69a6de70-03db-11e5-0000-c8a1e1c1abcd',
	privateKey,
};
const individualData = { keyType: 'individual', keyId: 'L2UZB63I8H29', privateKey };

describe('testApiCredential', () => {
	it('returns OK when App Store Connect accepts the token (2xx)', async () => {
		const { ctx, request } = mockContext({ resolve: { data: [{ id: '1' }] } });
		const result = await testApiCredential.call(ctx, credential(teamData));
		expect(result.status).toBe('OK');
		expect(request).toHaveBeenCalledTimes(1);
		// The request carries the minted bearer token.
		const opts = request.mock.calls[0][0] as { headers?: Record<string, string> };
		expect(opts.headers?.Authorization).toMatch(/^Bearer .+\..+\..+/);
	});

	it('reports the signing error without a network call when key material is invalid', async () => {
		const { ctx, request } = mockContext({ resolve: {} });
		const result = await testApiCredential.call(
			ctx,
			credential({ ...teamData, privateKey: 'not-a-key' }),
		);
		expect(result.status).toBe('Error');
		expect(result.message).toMatch(/private key/i);
		expect(request).not.toHaveBeenCalled();
	});

	it('explains a 401 as a bad Key ID / inactive key and surfaces Apple detail', async () => {
		const { ctx } = mockContext({
			rejectStatus: 401,
			rejectBody: {
				errors: [
					{
						status: '401',
						code: 'NOT_AUTHORIZED',
						title: 'Authentication credentials are missing or invalid.',
						detail: 'Provide a properly configured and signed bearer token.',
					},
				],
			},
		});
		const result = await testApiCredential.call(ctx, credential(individualData));
		expect(result.status).toBe('Error');
		expect(result.message).toMatch(/401/);
		expect(result.message).toMatch(/Key ID/i);
		// Individual-key branch hints at the ~12-char ID / blank Issuer ID.
		expect(result.message).toMatch(/Individual key/i);
		expect(result.message).toMatch(/Apple said:/);
	});

	it('distinguishes a 403 agreements gate as authenticated-but-blocked', async () => {
		const { ctx } = mockContext({
			rejectStatus: 403,
			rejectBody: {
				errors: [
					{
						status: '403',
						code: 'FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED',
						title: 'A required agreement is missing or has expired.',
						detail: 'This request requires an in-effect agreement that has not been signed.',
					},
				],
			},
		});
		const result = await testApiCredential.call(ctx, credential(individualData));
		expect(result.status).toBe('Error');
		expect(result.message).toMatch(/authenticated/i);
		expect(result.message).toMatch(/agreement/i);
		// Must NOT reuse the 401 "rejected the token" wording — a 403 means the
		// key is valid, so blaming the key would send the user down the wrong path.
		expect(result.message).not.toMatch(/rejected the token/i);
	});
});
