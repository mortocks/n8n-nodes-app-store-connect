import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	ASC_SIGNATURE_HEADER,
	verifyWebhookSignature,
} from '../../utils/verifyWebhookSignature';
import { testWebhookSecret } from '../../utils/webhookCredentialTest';

/**
 * `Verify Webhook Signature` node (programmatic).
 *
 * A thin wrapper over deep module B (`utils/verifyWebhookSignature`). It takes
 * the raw request body, the `x-apple-signature` header value, and the shared
 * secret, and emits one item per input carrying a boolean `valid` to branch on
 * (e.g. with an IF node).
 *
 * It exists so users receiving ASC events through n8n's generic Webhook node
 * (configured to keep the raw body) can validate authenticity with the EXACT
 * same logic the Trigger (Task 06) uses — all crypto lives in module B, never
 * here. The node only marshals inputs and shapes the output.
 */
export class VerifyWebhookSignature implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Verify Webhook Signature',
		name: 'verifyWebhookSignature',
		icon: { light: 'file:appStore.svg', dark: 'file:appStore.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: 'Verify signature',
		description:
			'Verify the x-apple-signature HMAC on an App Store Connect webhook delivery',
		defaults: {
			name: 'Verify Webhook Signature',
		},
		// eslint-plugin-n8n-nodes-base@1.16.7 predates the `NodeConnectionTypes`
		// rename and only recognises the `'main'` string literal; the n8n
		// community-nodes verification scanner requires the typed enum instead.
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [NodeConnectionTypes.Main],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'appStoreConnectWebhookApi',
				required: false,
				// A shared secret has no endpoint to authenticate against, so the
				// credential is validated by a function-based test (see
				// `methods.credentialTest` below) rather than a declarative request
				// with a URL. This satisfies the n8n community-node verification
				// scanner's `credential-test-required` rule.
				testedBy: 'appStoreConnectWebhookApiTest',
				// Only needed when the Secret is sourced from the credential.
				displayOptions: {
					show: {
						secretSource: ['credential'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Raw Body',
				name: 'body',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				description:
					'The raw request body exactly as received (do not re-serialize the JSON). When using the generic Webhook node, configure it to keep the raw body and pass those bytes here.',
			},
			{
				displayName: 'Signature',
				name: 'signature',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. hmacsha256=abc123…',
				description: `The value of the incoming '${ASC_SIGNATURE_HEADER}' header. Accepted with or without the 'hmacsha256=' prefix.`,
			},
			{
				displayName: 'Secret Source',
				name: 'secretSource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Credential',
						value: 'credential',
						description: 'Use the Secret from an App Store Connect Webhook credential',
					},
					{
						name: 'Field',
						value: 'field',
						description: 'Provide the Secret directly in this node (e.g. via an expression)',
					},
				],
				default: 'credential',
				description: 'Where to read the shared webhook secret from',
			},
			{
				displayName: 'Secret',
				name: 'secret',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				description: 'The shared webhook secret used to compute the expected HMAC',
				displayOptions: {
					show: {
						secretSource: ['field'],
					},
				},
			},
		],
	};

	// Shared with the Trigger node (see `utils/webhookCredentialTest.ts`) so every
	// node that uses the webhook credential tests it — required by the scanner's
	// `credential-test-required` rule.
	methods = {
		credentialTest: {
			appStoreConnectWebhookApiTest: testWebhookSecret,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const rawBody = this.getNodeParameter('body', i, '') as string;
				const signature = this.getNodeParameter('signature', i, '') as string;
				const secretSource = this.getNodeParameter('secretSource', i) as string;

				let secret = '';
				if (secretSource === 'credential') {
					const credentials = await this.getCredentials('appStoreConnectWebhookApi', i);
					secret = (credentials.secret as string) ?? '';
				} else {
					secret = this.getNodeParameter('secret', i, '') as string;
				}

				const valid = verifyWebhookSignature({ rawBody, signature, secret });

				returnData.push({
					json: {
						valid,
						signatureHeader: ASC_SIGNATURE_HEADER,
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							valid: false,
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
