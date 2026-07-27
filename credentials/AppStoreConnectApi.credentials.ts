import type {
	IAuthenticate,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

import { signAscToken, type AscKeyType } from '../utils/ascToken';

const ASC_BASE_URL = 'https://api.appstoreconnect.apple.com';

/**
 * `App Store Connect API` credential — Team and Individual keys.
 *
 * Holds the ASC API key material (Key Type, Key ID, Issuer ID, `.p8` private
 * key) and mints a short-lived ES256 JWT (deep module A) inside `authenticate`.
 *
 * Minting happens in `authenticate` — a function, not the declarative form — on
 * purpose: n8n only runs `preAuthentication` in some request contexts (it is
 * skipped for `listSearch`/`loadOptions` dropdowns and for the credential test),
 * so a token minted there would be absent for the "Target App" picker and the
 * test, yielding a 401. `authenticate` runs on every authenticated request in
 * every context, so the bearer is always present. The JWT is cheap to sign and
 * short-lived, so per-request minting (no caching) is the right trade-off.
 *
 * Team keys require an Issuer ID (shown/required only when Key Type = Team);
 * Individual keys omit it — module A encodes the exact claim differences
 * (`docs/apple-api-notes.md`).
 */
export class AppStoreConnectApi implements ICredentialType {
	name = 'appStoreConnectApi';

	displayName = 'App Store Connect API';

	// Links to Apple's own API documentation (this is not an n8n-hosted doc slug).
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://developer.apple.com/documentation/appstoreconnectapi';

	icon = {
		light: 'file:../nodes/AppStoreConnect/appStore.svg',
		dark: 'file:../nodes/AppStoreConnect/appStore.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Key Type',
			name: 'keyType',
			type: 'options',
			options: [
				{ name: 'Team', value: 'team' },
				{ name: 'Individual', value: 'individual' },
			],
			default: 'team',
			description:
				'Team keys are shared across an Apple Developer team and require an Issuer ID. Individual keys belong to a single Apple ID and omit it.',
		},
		{
			displayName: 'Key ID',
			name: 'keyId',
			// The Key ID is an identifier, not a secret, so it is intentionally
			// shown in plain text (unlike the private key below).
			// eslint-disable-next-line n8n-nodes-base/cred-class-field-type-options-password-missing
			type: 'string',
			default: '',
			required: true,
			description:
				'The Key ID of the App Store Connect API key (shown under Users and Access → Integrations → App Store Connect API)',
		},
		{
			displayName: 'Issuer ID',
			name: 'issuerId',
			type: 'string',
			default: '',
			required: true,
			description: 'The Issuer ID for your team, a UUID shown above the list of API keys',
			displayOptions: {
				show: {
					keyType: ['team'],
				},
			},
		},
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			placeholder: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
			description: 'The full contents of the downloaded .p8 private key file, including the BEGIN/END lines',
		},
	];

	authenticate: IAuthenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		const token = signAscToken({
			keyId: credentials.keyId as string,
			// Only Team keys carry an Issuer ID; the field is hidden (and empty)
			// for Individual keys, and module A rejects a non-empty Issuer ID
			// when keyType is 'individual'.
			issuerId: credentials.issuerId as string | undefined,
			privateKey: credentials.privateKey as string,
			keyType: (credentials.keyType as AscKeyType | undefined) ?? 'team',
		});

		requestOptions.headers = {
			...requestOptions.headers,
			Authorization: `Bearer ${token}`,
		};
		return requestOptions;
	};

	// Because `authenticate` (above) attaches the bearer on every request, the
	// declarative test works: n8n applies `authenticate` to this request too.
	test: ICredentialTestRequest = {
		request: {
			baseURL: ASC_BASE_URL,
			url: '/v1/apps',
			qs: {
				limit: 1,
			},
		},
	};
}
