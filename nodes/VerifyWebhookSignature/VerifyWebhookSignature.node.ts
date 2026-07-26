import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	ASC_SIGNATURE_HEADER,
	verifyWebhookSignature,
} from '../../utils/verifyWebhookSignature';

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
		// Uses the official App Store Connect PNG logo (intentionally not SVG).
		// eslint-disable-next-line n8n-nodes-base/node-class-description-icon-not-svg
		icon: 'file:verifyWebhookSignature.png',
		group: ['transform'],
		version: 1,
		subtitle: 'Verify signature',
		description:
			'Verify the x-apple-signature HMAC on an App Store Connect webhook delivery',
		defaults: {
			name: 'Verify Webhook Signature',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'appStoreConnectWebhook',
				required: false,
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
					const credentials = await this.getCredentials('appStoreConnectWebhook', i);
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
				throw error;
			}
		}

		return [returnData];
	}
}
