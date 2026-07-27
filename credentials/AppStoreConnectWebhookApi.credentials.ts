import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * `App Store Connect Webhook API` credential — the shared signing Secret only.
 *
 * App Store Connect signs each webhook delivery with an HMAC-SHA256 over the
 * raw body keyed by a shared secret (the same value set on the webhook when it
 * was created). This credential simply holds that secret so the `Verify
 * Webhook Signature` node and the Trigger can validate the `x-apple-signature`
 * header without the secret being pasted into a workflow in plain text.
 *
 * It is deliberately separate from the `App Store Connect API` credential (the
 * ES256 key material): a workflow that only receives and verifies deliveries
 * needs the secret but not the API key, and vice versa.
 *
 * ## Credential test
 *
 * A bare shared secret has no endpoint to authenticate against, so a
 * declarative `test` request (which n8n requires to carry a real URL) is not
 * meaningful here. Instead the credential is validated by a function-based
 * test — `credentialTest.appStoreConnectWebhookApiTest` on the `Verify Webhook
 * Signature` node — referenced via that node's `credentials[].testedBy`. The
 * function checks the Secret is present and well-formed without any network
 * call. This is the minimal approach the n8n community-node verification
 * scanner (`credential-test-required`) accepts for a secret-only credential.
 */
export class AppStoreConnectWebhookApi implements ICredentialType {
	name = 'appStoreConnectWebhookApi';

	displayName = 'App Store Connect Webhook API';

	// Links to Apple's own API documentation (this is not an n8n-hosted doc slug).
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://developer.apple.com/documentation/appstoreconnectapi';

	icon = {
		light: 'file:../nodes/AppStoreConnect/appStore.svg',
		dark: 'file:../nodes/AppStoreConnect/appStore.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Secret',
			name: 'secret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description:
				'The shared secret configured on the App Store Connect webhook. Used to verify the HMAC-SHA256 `x-apple-signature` header on incoming deliveries.',
		},
	];
}
