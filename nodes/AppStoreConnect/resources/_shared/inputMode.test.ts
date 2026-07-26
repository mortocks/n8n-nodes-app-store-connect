import {
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type INode,
} from 'n8n-workflow';

import { resolveMutationData } from './inputMode';

/**
 * Tests for the shared dual-input-mode helper. `resolveMutationData` is the
 * decision point every mutation body-builder calls: in `fields` mode it returns
 * whatever the typed builder assembles; in `json` mode it parses, validates, and
 * returns the user-supplied JSON:API `data` object (throwing a readable
 * `NodeOperationError` *before* any request when the JSON is unusable).
 */

const FAKE_NODE = {
	id: 'test-node',
	name: 'App Store Connect',
	type: 'n8n-nodes-app-store-connect.appStoreConnect',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

/** Mock context whose `getNodeParameter` reads from a plain params map. */
function makeCtx(params: Record<string, unknown>): IExecuteSingleFunctions {
	return {
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getNode: () => FAKE_NODE,
	} as unknown as IExecuteSingleFunctions;
}

describe('resolveMutationData', () => {
	describe('fields mode', () => {
		it('returns the typed builder output and never reads the JSON body', () => {
			const buildTyped = jest.fn(
				(): IDataObject => ({ type: 'customerReviewResponses', attributes: { responseBody: 'hi' } }),
			);
			const ctx = makeCtx({ inputMode: 'fields' });

			const data = resolveMutationData(ctx, buildTyped);

			expect(buildTyped).toHaveBeenCalledTimes(1);
			expect(data).toEqual({
				type: 'customerReviewResponses',
				attributes: { responseBody: 'hi' },
			});
		});

		it('defaults to fields mode when the toggle is absent', () => {
			const buildTyped = jest.fn((): IDataObject => ({ type: 'x' }));
			const ctx = makeCtx({});

			resolveMutationData(ctx, buildTyped);

			expect(buildTyped).toHaveBeenCalledTimes(1);
		});
	});

	describe('json mode', () => {
		const neverBuild = () => {
			throw new Error('typed builder must not run in JSON mode');
		};

		it('passes a raw JSON string data object straight through', () => {
			const ctx = makeCtx({
				inputMode: 'json',
				jsonBody: '{"type":"customerReviewResponses","attributes":{"responseBody":"Thanks!"}}',
			});

			const data = resolveMutationData(ctx, neverBuild);

			expect(data).toEqual({
				type: 'customerReviewResponses',
				attributes: { responseBody: 'Thanks!' },
			});
		});

		it('accepts an already-parsed object (n8n json field)', () => {
			const ctx = makeCtx({
				inputMode: 'json',
				jsonBody: { type: 'customerReviewResponses', attributes: { responseBody: 'Ok' } },
			});

			const data = resolveMutationData(ctx, neverBuild);

			expect(data).toEqual({
				type: 'customerReviewResponses',
				attributes: { responseBody: 'Ok' },
			});
		});

		it('unwraps a full { data: {...} } envelope down to the data object', () => {
			const ctx = makeCtx({
				inputMode: 'json',
				jsonBody: '{"data":{"type":"customerReviewResponses","attributes":{"responseBody":"x"}}}',
			});

			const data = resolveMutationData(ctx, neverBuild);

			expect(data).toEqual({
				type: 'customerReviewResponses',
				attributes: { responseBody: 'x' },
			});
		});

		it('throws a readable NodeOperationError on invalid JSON, before any request', () => {
			const ctx = makeCtx({ inputMode: 'json', jsonBody: '{ not valid json' });

			expect(() => resolveMutationData(ctx, neverBuild)).toThrow(NodeOperationError);
			expect(() => resolveMutationData(ctx, neverBuild)).toThrow(/not valid JSON/i);
		});

		it('throws when the JSON is empty', () => {
			const ctx = makeCtx({ inputMode: 'json', jsonBody: '   ' });

			expect(() => resolveMutationData(ctx, neverBuild)).toThrow(NodeOperationError);
			expect(() => resolveMutationData(ctx, neverBuild)).toThrow(/empty/i);
		});

		it('throws when the JSON:API data object has no type', () => {
			const ctx = makeCtx({
				inputMode: 'json',
				jsonBody: '{"attributes":{"responseBody":"missing type"}}',
			});

			expect(() => resolveMutationData(ctx, neverBuild)).toThrow(NodeOperationError);
			expect(() => resolveMutationData(ctx, neverBuild)).toThrow(/type/i);
		});

		it('throws when type is an empty string', () => {
			const ctx = makeCtx({ inputMode: 'json', jsonBody: '{"type":"   ","attributes":{}}' });

			expect(() => resolveMutationData(ctx, neverBuild)).toThrow(NodeOperationError);
		});
	});
});
