import {
	NodeApiError,
	type DeclarativeRestApiSettings,
	type IExecutePaginationFunctions,
	type INode,
	type INodeExecutionData,
} from 'n8n-workflow';

import { ascCursorPagination } from './pagination';

/**
 * Tests for the cursor-pagination routing hook. These mock `makeRoutingRequest`
 * to return successive *App Store Connect JSON:API list bodies*
 * (`{ data: [...], links: { next } }`) and assert the hook follows `links.next`
 * for Return All, truncates under a Limit, sets the right initial page size, and
 * maps a failed ASC response to a NodeApiError.
 */

const FAKE_NODE = {
	id: 'test-node',
	name: 'App Store Connect',
	type: 'n8n-nodes-apple-appstore.appStoreConnect',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

/** One ASC list page as the routing layer hands it back: body inside item[0].json. */
function page(ids: string[], next: string | null): INodeExecutionData[] {
	return [{ json: { data: ids.map((id) => ({ id })), links: { next } } }];
}

interface CallSnapshot {
	url: unknown;
	qs: Record<string, unknown>;
}

function makeCtx(
	pages: INodeExecutionData[][],
	params: { returnAll: boolean; limit?: number; simplify?: boolean },
) {
	const calls: CallSnapshot[] = [];
	let index = 0;
	const makeRoutingRequest = jest.fn(async function (
		reqOpts: DeclarativeRestApiSettings.ResultOptions,
	) {
		// Snapshot url + qs at call time (the hook mutates the same object between pages).
		calls.push({ url: reqOpts.options.url, qs: { ...reqOpts.options.qs } });
		const next = pages[index];
		index += 1;
		if (!next) throw new Error(`requested page ${index} but only ${pages.length} exist`);
		return next;
	});

	const ctx = {
		getNodeParameter: (name: string, fallback?: unknown) => {
			if (name === 'returnAll') return params.returnAll;
			if (name === 'limit') return params.limit ?? fallback;
			if (name === 'simplify') return params.simplify ?? fallback;
			return fallback;
		},
		makeRoutingRequest,
		getNode: () => FAKE_NODE,
	} as unknown as IExecutePaginationFunctions;

	return { ctx, calls, makeRoutingRequest };
}

const baseRequest = () =>
	({ options: { url: '/v1/apps/APP123/webhooks', qs: {} } } as unknown as DeclarativeRestApiSettings.ResultOptions);

function ids(result: INodeExecutionData[]): string[] {
	return result.map((item) => (item.json as { id: string }).id);
}

describe('ascCursorPagination', () => {
	describe('Return All', () => {
		it('follows links.next across pages, concatenates, and requests max page size first', async () => {
			const { ctx, calls, makeRoutingRequest } = makeCtx(
				[page(['a', 'b'], 'https://api.appstoreconnect.apple.com/v1/apps/APP123/webhooks?cursor=2'), page(['c'], null)],
				{ returnAll: true },
			);

			const result = await ascCursorPagination.call(ctx, baseRequest());

			expect(ids(result)).toEqual(['a', 'b', 'c']);
			expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
			// First page: the endpoint URL with limit=200 (ASC max).
			expect(calls[0].url).toBe('/v1/apps/APP123/webhooks');
			expect(calls[0].qs).toEqual({ limit: 200 });
			// Second page: the absolute links.next URL, with qs cleared (cursor is in the URL).
			expect(calls[1].url).toBe(
				'https://api.appstoreconnect.apple.com/v1/apps/APP123/webhooks?cursor=2',
			);
			expect(calls[1].qs).toEqual({});
		});

		it('stops when links.next is null (single page)', async () => {
			const { ctx, makeRoutingRequest } = makeCtx([page(['only'], null)], { returnAll: true });

			const result = await ascCursorPagination.call(ctx, baseRequest());

			expect(ids(result)).toEqual(['only']);
			expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		});
	});

	describe('Limit', () => {
		it('truncates the first page to the limit and fetches no further pages', async () => {
			const { ctx, calls, makeRoutingRequest } = makeCtx(
				[page(['a', 'b', 'c'], 'https://api.appstoreconnect.apple.com/next')],
				{ returnAll: false, limit: 2 },
			);

			const result = await ascCursorPagination.call(ctx, baseRequest());

			expect(ids(result)).toEqual(['a', 'b']);
			expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
			// Initial page size is the requested limit (bounded to ASC's max).
			expect(calls[0].qs).toEqual({ limit: 2 });
		});

		it('caps the initial page size at ASC max (200) when a huge limit is requested', async () => {
			const { ctx, calls } = makeCtx([page(['a'], null)], { returnAll: false, limit: 5000 });

			await ascCursorPagination.call(ctx, baseRequest());

			expect(calls[0].qs).toEqual({ limit: 200 });
		});
	});

	describe('Simplify', () => {
		it('flattens each list element when simplify is true', async () => {
			const richPage: INodeExecutionData[] = [
				{
					json: {
						data: [
							{ id: 'rev-1', type: 'customerReviews', attributes: { rating: 5 } },
							{ id: 'rev-2', type: 'customerReviews', attributes: { rating: 4 } },
						],
						links: { next: null },
					},
				},
			];
			const { ctx } = makeCtx([richPage], { returnAll: true, simplify: true });

			const result = await ascCursorPagination.call(ctx, baseRequest());

			expect(result.map((item) => item.json)).toEqual([
				{ id: 'rev-1', type: 'customerReviews', rating: 5 },
				{ id: 'rev-2', type: 'customerReviews', rating: 4 },
			]);
		});

		it('leaves each list element raw when simplify is absent', async () => {
			const richPage: INodeExecutionData[] = [
				{
					json: {
						data: [{ id: 'rev-1', type: 'customerReviews', attributes: { rating: 5 } }],
						links: { next: null },
					},
				},
			];
			const { ctx } = makeCtx([richPage], { returnAll: true });

			const result = await ascCursorPagination.call(ctx, baseRequest());

			expect(result.map((item) => item.json)).toEqual([
				{ id: 'rev-1', type: 'customerReviews', attributes: { rating: 5 } },
			]);
		});
	});

	it('maps a failed ASC response to a NodeApiError', async () => {
		const { ctx } = (() => {
			const makeRoutingRequest = jest.fn().mockRejectedValue(
				(() => {
					const err = new Error('Request failed with status code 403');
					(err as unknown as { cause: unknown }).cause = {
						response: {
							data: {
								errors: [
									{
										status: '403',
										code: 'FORBIDDEN_ERROR',
										detail: "The resource 'webhooks' does not allow 'GET_COLLECTION'",
									},
								],
							},
						},
					};
					return err;
				})(),
			);
			return {
				ctx: {
					getNodeParameter: (name: string) => (name === 'returnAll' ? true : undefined),
					makeRoutingRequest,
					getNode: () => FAKE_NODE,
				} as unknown as IExecutePaginationFunctions,
			};
		})();

		await expect(ascCursorPagination.call(ctx, baseRequest())).rejects.toBeInstanceOf(NodeApiError);
	});
});
