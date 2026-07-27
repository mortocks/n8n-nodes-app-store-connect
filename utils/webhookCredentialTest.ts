import type {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	INodeCredentialTestResult,
} from 'n8n-workflow';

/**
 * Credential test for the `App Store Connect Webhook API` credential.
 *
 * The credential is a bare shared secret with no API endpoint, so there is
 * nothing to authenticate against over the network — the real proof is a
 * matching HMAC on a genuine delivery, which only Apple can produce. We verify a
 * non-empty secret was entered.
 *
 * Shared by the Verify **and** Trigger nodes: both reference it via their
 * `credentials[].testedBy`, so *every* usage of the credential is tested — the
 * n8n verification scanner's `credential-test-required` rule requires the
 * credential to be tested by all nodes that use it.
 */
export async function testWebhookSecret(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	const secret = credential.data?.secret;
	if (typeof secret !== 'string' || secret.trim() === '') {
		return {
			status: 'Error',
			message: 'Enter the shared webhook secret configured in App Store Connect.',
		};
	}
	return {
		status: 'OK',
		message: 'Secret saved. It is verified against the HMAC on each incoming delivery.',
	};
}
