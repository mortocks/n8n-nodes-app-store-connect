import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * `App Store Connect Webhook` credential — the shared signing Secret only.
 *
 * App Store Connect signs each webhook delivery with an HMAC-SHA256 over the
 * raw body keyed by a shared secret (the same value set on the webhook when it
 * was created). This credential simply holds that secret so the `Verify
 * Webhook Signature` node (Task 05) and the Trigger (Task 06) can validate the
 * `x-apple-signature` header without the secret being pasted into a workflow
 * in plain text.
 *
 * It is deliberately separate from the `App Store Connect API` credential (the
 * ES256 key material): a workflow that only receives and verifies deliveries
 * needs the secret but not the API key, and vice versa. There is no credential
 * test — a bare secret has no endpoint to authenticate against.
 */
// This credential holds only the webhook signing secret — it is not an ASC
// API credential, so the n8n `-Api`/`API` naming convention does not apply and
// forcing it would mislabel the credential in the UI.
// eslint-disable-next-line n8n-nodes-base/cred-class-name-unsuffixed
export class AppStoreConnectWebhook implements ICredentialType {
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-name-unsuffixed
	name = 'appStoreConnectWebhook';

	// eslint-disable-next-line n8n-nodes-base/cred-class-field-display-name-missing-api
	displayName = 'App Store Connect Webhook';

	// Links to Apple's own API documentation (this is not an n8n-hosted doc slug).
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://developer.apple.com/documentation/appstoreconnectapi';

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
