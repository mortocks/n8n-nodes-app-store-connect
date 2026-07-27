import {
	NodeApiError,
	type DeclarativeRestApiSettings,
	type IExecutePaginationFunctions,
	type INode,
	type INodeExecutionData,
} from 'n8n-workflow';

import { ascConfirmationRequest, ascSingleRequest } from './request';

/**
 * Tests for the single-request routing hook (Create/Get/Update/Delete). These
 * mock n8n's `makeRoutingRequest` — standing in for a live ASC round-trip — and
 * assert the hook returns the response verbatim on success and maps a failed
 * App Store Connect response through the shared error wrapper.
 */

const FAKE_NODE = {
	id: 'test-node',
	name: 'App Store Connect',
	type: 'n8n-nodes-apple-appstore.appStoreConnect',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

const REQUEST_OPTIONS = {
	options: { method: 'GET', url: '/v1/webhooks/wh-1' },
} as unknown as DeclarativeRestApiSettings.ResultOptions;

function makeCtx(
	makeRoutingRequest: jest.Mock,
	params: Record<string, unknown> = {},
): IExecutePaginationFunctions {
	return {
		makeRoutingRequest,
		// Provide `simplify` (and any other param) with a fallback, so operations
		// that don't mount the field read the passed default (false) untouched.
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getNode: () => FAKE_NODE,
	} as unknown as IExecutePaginationFunctions;
}

function ascFailure(data: unknown): Error {
	const error = new Error('Request failed with status code 404');
	(error as unknown as { cause: unknown }).cause = { response: { data } };
	return error;
}

describe('ascSingleRequest', () => {
	it('passes the request options through and returns the ASC response items', async () => {
		const responseItems: INodeExecutionData[] = [
			{ json: { data: { type: 'webhooks', id: 'wh-1', attributes: { enabled: true } } } },
		];
		const makeRoutingRequest = jest.fn().mockResolvedValue(responseItems);

		const result = await ascSingleRequest.call(makeCtx(makeRoutingRequest), REQUEST_OPTIONS);

		expect(result).toBe(responseItems);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		expect(makeRoutingRequest).toHaveBeenCalledWith(REQUEST_OPTIONS);
	});

	it('flattens the JSON:API envelope when simplify is true', async () => {
		const responseItems: INodeExecutionData[] = [
			{ json: { data: { type: 'webhooks', id: 'wh-1', attributes: { enabled: true } } } },
		];
		const makeRoutingRequest = jest.fn().mockResolvedValue(responseItems);

		const result = await ascSingleRequest.call(
			makeCtx(makeRoutingRequest, { simplify: true }),
			REQUEST_OPTIONS,
		);

		expect(result).toEqual([{ json: { type: 'webhooks', id: 'wh-1', enabled: true } }]);
	});

	it('returns the raw envelope when simplify is absent (defaults off)', async () => {
		const responseItems: INodeExecutionData[] = [
			{ json: { data: { type: 'webhooks', id: 'wh-1', attributes: { enabled: true } } } },
		];
		const makeRoutingRequest = jest.fn().mockResolvedValue(responseItems);

		const result = await ascSingleRequest.call(makeCtx(makeRoutingRequest), REQUEST_OPTIONS);

		expect(result).toBe(responseItems);
	});

	it('maps a failed ASC response to a readable NodeApiError', async () => {
		const makeRoutingRequest = jest.fn().mockRejectedValue(
			ascFailure({
				errors: [{ status: '404', title: 'The specified resource does not exist', detail: 'Webhook not found' }],
			}),
		);

		await expect(
			ascSingleRequest.call(makeCtx(makeRoutingRequest), REQUEST_OPTIONS),
		).rejects.toBeInstanceOf(NodeApiError);
	});
});

describe('ascConfirmationRequest', () => {
	it('discards the 204/empty body and returns the confirmation object', async () => {
		const makeRoutingRequest = jest.fn().mockResolvedValue([{ json: {} }]);

		const result = await ascConfirmationRequest('deleted').call(
			makeCtx(makeRoutingRequest),
			REQUEST_OPTIONS,
		);

		expect(result).toEqual([{ json: { deleted: true } }]);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		expect(makeRoutingRequest).toHaveBeenCalledWith(REQUEST_OPTIONS);
	});

	it('still maps a failed ASC response to a NodeApiError', async () => {
		const makeRoutingRequest = jest.fn().mockRejectedValue(
			ascFailure({
				errors: [{ status: '409', title: 'Conflict', detail: 'Cannot delete' }],
			}),
		);

		await expect(
			ascConfirmationRequest('deleted').call(makeCtx(makeRoutingRequest), REQUEST_OPTIONS),
		).rejects.toBeInstanceOf(NodeApiError);
	});
});
