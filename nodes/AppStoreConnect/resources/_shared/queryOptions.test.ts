import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { attachQueryOptions } from './queryOptions';

/**
 * Tests for the shared Query Options `preSend` hook. It folds the JSON:API
 * query-parameter collection the user filled in (`fields[type]`, `include`,
 * `filter[key]`, `sort`, `limit`) into the outgoing request `qs`, writing only
 * the params actually set and merging onto any pre-existing `qs`.
 */

/** Mock context whose `getNodeParameter` returns a fixed `queryOptions` value. */
function makeCtx(queryOptions: unknown): IExecuteSingleFunctions {
	return {
		getNodeParameter: (name: string, fallback?: unknown) =>
			name === 'queryOptions' ? queryOptions : fallback,
	} as unknown as IExecuteSingleFunctions;
}

function run(queryOptions: unknown, initial: Partial<IHttpRequestOptions> = {}) {
	const ctx = makeCtx(queryOptions);
	const requestOptions = { method: 'GET', url: '/v1/apps/APP1/customerReviews', ...initial } as IHttpRequestOptions;
	return attachQueryOptions.call(ctx, requestOptions);
}

describe('attachQueryOptions', () => {
	it('leaves qs empty when no options are set', async () => {
		const result = await run({});
		expect(result.qs).toEqual({});
	});

	it('maps include, sort and limit into qs', async () => {
		const result = await run({ include: 'response', sort: '-createdDate', limit: 25 });
		expect(result.qs).toEqual({ include: 'response', sort: '-createdDate', limit: 25 });
	});

	it('maps sparse fieldsets into fields[type] keys', async () => {
		const result = await run({
			fields: { field: [{ type: 'customerReviews', fields: 'rating,title,body' }] },
		});
		expect(result.qs).toEqual({ 'fields[customerReviews]': 'rating,title,body' });
	});

	it('maps filters into filter[key] keys', async () => {
		const result = await run({
			filter: {
				filter: [
					{ key: 'rating', value: '1' },
					{ key: 'territory', value: 'USA' },
				],
			},
		});
		expect(result.qs).toEqual({ 'filter[rating]': '1', 'filter[territory]': 'USA' });
	});

	it('skips empty / partial entries', async () => {
		const result = await run({
			include: '   ',
			sort: '',
			fields: { field: [{ type: '', fields: 'rating' }, { type: 'customerReviews', fields: '' }] },
			filter: { filter: [{ key: '', value: '1' }, { key: 'rating', value: '' }] },
		});
		expect(result.qs).toEqual({});
	});

	it('merges onto an existing qs rather than replacing it', async () => {
		const result = await run({ include: 'response' }, { qs: { limit: 200 } });
		expect(result.qs).toEqual({ limit: 200, include: 'response' });
	});
});
