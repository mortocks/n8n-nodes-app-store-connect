import type { ICredentialsDecrypted, ICredentialTestFunctions } from 'n8n-workflow';

import { VerifyWebhookSignature } from './VerifyWebhookSignature.node';

/**
 * Guards the `appStoreConnectWebhookApi` credential test.
 *
 * The webhook credential is a bare shared secret (no endpoint), so it is
 * validated by a function-based test referenced via the node's
 * `credentials[].testedBy` rather than a declarative request. These tests lock
 * in that wiring (so the community-node verification scanner's
 * `credential-test-required` rule stays satisfied) and the pass/fail logic.
 */
describe('VerifyWebhookSignature credential test', () => {
	const node = new VerifyWebhookSignature();

	const runTest = (secret: unknown) =>
		node.methods.credentialTest.appStoreConnectWebhookApiTest.call(
			{} as ICredentialTestFunctions,
			{ data: { secret } } as unknown as ICredentialsDecrypted,
		);

	it('references the function-based test via testedBy on the webhook credential', () => {
		const cred = node.description.credentials?.find(
			(c) => c.name === 'appStoreConnectWebhookApi',
		);
		expect(cred?.testedBy).toBe('appStoreConnectWebhookApiTest');
	});

	it('returns OK when a non-empty secret is present', async () => {
		await expect(runTest('sh4red-s3cret')).resolves.toEqual({
			status: 'OK',
			message: expect.any(String),
		});
	});

	it.each([['', 'empty'], ['   ', 'whitespace'], [undefined, 'missing'], [123, 'non-string']])(
		'returns Error for a %s secret (%s)',
		async (secret) => {
			await expect(runTest(secret)).resolves.toEqual({
				status: 'Error',
				message: expect.any(String),
			});
		},
	);
});
