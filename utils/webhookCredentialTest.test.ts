import type { ICredentialsDecrypted } from 'n8n-workflow';

import { testWebhookSecret } from './webhookCredentialTest';

/** Invoke the credential-test with a given stored secret value. */
function run(secret: unknown) {
	return testWebhookSecret.call(
		{} as never,
		{ data: { secret } } as unknown as ICredentialsDecrypted,
	);
}

describe('testWebhookSecret', () => {
	it('returns OK for a non-empty secret', async () => {
		const result = await run('super-secret-value');
		expect(result.status).toBe('OK');
		expect(result.message).toMatch(/HMAC/);
	});

	it('returns Error for a missing/empty/blank secret', async () => {
		expect((await run(undefined)).status).toBe('Error');
		expect((await run('')).status).toBe('Error');
		expect((await run('   ')).status).toBe('Error');
	});
});
