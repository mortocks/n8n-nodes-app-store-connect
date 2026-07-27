import {
	NodeApiError,
	type DeclarativeRestApiSettings,
	type IExecutePaginationFunctions,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type INode,
	type INodeExecutionData,
	type INodeProperties,
	type INodePropertyOptions,
} from 'n8n-workflow';

import { attachSort } from '../_shared/listFilters';
import { attachQueryOptions } from '../_shared/queryOptions';
import { BETA_GROUP_RESOURCE_TYPE } from '../betaGroup/betaGroup.constants';
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import {
	attachBetaTesterBody,
	attachBetaTesterFilters,
	attachBetaTesterGroupLinkage,
} from './betaTester.body';
import { BETA_TESTER_RESOURCE_TYPE } from './betaTester.constants';
import { betaTesterOperations } from './betaTester.resource';

/**
 * Tests for the Beta Testers resource: the Get Many filter hook (app / group /
 * email → `filter[...]`), the Create/invite body builder (typed AND raw-JSON
 * passthrough via `resolveMutationData`), the relationship-linkage add/remove
 * writes (URL + JSON:API to-many linkage body shape), the declarative operation
 * wiring, and — driving the shared cursor-pagination hook against the Get Many
 * URL — pagination and ASC error mapping.
 */

const FAKE_NODE = {
	id: 'test-node',
	name: 'App Store Connect',
	type: 'n8n-nodes-apple-appstore.appStoreConnect',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

function makeCtx(params: Record<string, unknown>): IExecuteSingleFunctions {
	return {
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getNode: () => FAKE_NODE,
	} as unknown as IExecuteSingleFunctions;
}

/** Pull the operation option objects out of the declarative `Operation` field. */
const operationOptions = betaTesterOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

describe('attachBetaTesterFilters (Get Many)', () => {
	it('folds app, group, email, names, and invite type into filter[...] query params', async () => {
		const ctx = makeCtx({
			targetApp: 'app-7',
			betaGroup: 'g-5',
			filterEmail: 'tester@example.com',
			filterFirstName: 'Ada',
			filterLastName: 'Lovelace',
			filterInviteType: 'PUBLIC_LINK',
		});

		const result = await attachBetaTesterFilters.call(ctx, {
			method: 'GET',
			url: '/v1/betaTesters',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[apps]': 'app-7',
			'filter[betaGroups]': 'g-5',
			'filter[email]': 'tester@example.com',
			'filter[firstName]': 'Ada',
			'filter[lastName]': 'Lovelace',
			'filter[inviteType]': 'PUBLIC_LINK',
		});
	});

	it('omits unset filters and preserves any existing qs', async () => {
		const ctx = makeCtx({
			targetApp: '',
			betaGroup: '',
			filterEmail: '',
			filterFirstName: '',
			filterLastName: '',
			filterInviteType: '',
		});

		const result = await attachBetaTesterFilters.call(ctx, {
			method: 'GET',
			url: '/v1/betaTesters',
			qs: { limit: 200 },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ limit: 200 });
	});
});

describe('attachSort (shared)', () => {
	it('folds the chosen sort value into qs.sort', async () => {
		const ctx = makeCtx({ sort: '-email' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/betaTesters',
			qs: { 'filter[apps]': 'app-7' },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[apps]': 'app-7', sort: '-email' });
	});

	it('sends nothing when left on the default (unsorted)', async () => {
		const ctx = makeCtx({ sort: '' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/betaTesters',
		} as IHttpRequestOptions);

		expect(result.qs).toBeUndefined();
	});
});

describe('attachBetaTesterBody (Create / invite)', () => {
	function build(params: Record<string, unknown>) {
		const ctx = makeCtx(params);
		return attachBetaTesterBody.call(ctx, {
			method: 'POST',
			url: '/v1/betaTesters',
		} as IHttpRequestOptions);
	}

	describe('fields mode', () => {
		it('builds a body with email, optional names, and a betaGroups relationship array', async () => {
			const result = await build({
				operation: 'create',
				inputMode: 'fields',
				email: 'new@example.com',
				firstName: 'Ada',
				lastName: 'Lovelace',
				betaGroup: 'g-1',
			});

			expect(result.body).toEqual({
				data: {
					type: BETA_TESTER_RESOURCE_TYPE,
					attributes: { email: 'new@example.com', firstName: 'Ada', lastName: 'Lovelace' },
					relationships: {
						betaGroups: { data: [{ type: BETA_GROUP_RESOURCE_TYPE, id: 'g-1' }] },
					},
				},
			});
		});

		it('sends only the email attribute when names are blank', async () => {
			const result = await build({
				operation: 'create',
				inputMode: 'fields',
				email: 'min@example.com',
				firstName: '',
				lastName: '',
				betaGroup: 'g-2',
			});

			expect(result.body).toEqual({
				data: {
					type: BETA_TESTER_RESOURCE_TYPE,
					attributes: { email: 'min@example.com' },
					relationships: {
						betaGroups: { data: [{ type: BETA_GROUP_RESOURCE_TYPE, id: 'g-2' }] },
					},
				},
			});
		});
	});

	describe('json mode', () => {
		it('passes the raw JSON:API data object straight through', async () => {
			const result = await build({
				operation: 'create',
				inputMode: 'json',
				jsonBody:
					'{"type":"betaTesters","attributes":{"email":"raw@example.com"},"relationships":{"betaGroups":{"data":[{"type":"betaGroups","id":"g-raw"}]}}}',
			});

			expect(result.body).toEqual({
				data: {
					type: 'betaTesters',
					attributes: { email: 'raw@example.com' },
					relationships: { betaGroups: { data: [{ type: 'betaGroups', id: 'g-raw' }] } },
				},
			});
		});

		it('rejects invalid JSON before building a request', async () => {
			await expect(
				build({ operation: 'create', inputMode: 'json', jsonBody: 'nonsense' }),
			).rejects.toThrow();
		});
	});
});

describe('attachBetaTesterGroupLinkage (Add / Remove from Group)', () => {
	it('builds a JSON:API to-many linkage body from the tester id', async () => {
		const ctx = makeCtx({ betaGroup: 'g-1', betaTesterId: 't-9' });

		const result = await attachBetaTesterGroupLinkage.call(ctx, {
			method: 'POST',
			url: '/v1/betaGroups/g-1/relationships/betaTesters',
		} as IHttpRequestOptions);

		// The linkage `data` is an ARRAY of resource identifiers (to-many), not a
		// single resource object.
		expect(result.body).toEqual({
			data: [{ type: BETA_TESTER_RESOURCE_TYPE, id: 't-9' }],
		});
	});
});

describe('betaTester operation wiring', () => {
	it('Get Many is a top-level cursor-paginated read with filter + query hooks', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('/v1/betaTesters');
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([attachBetaTesterFilters, attachSort, attachQueryOptions]);
	});

	it('Get is a single request by tester id, with query options', () => {
		const routing = op('get').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/betaTesters/{{$parameter["betaTesterId"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachQueryOptions);
	});

	it('Create POSTs via the body builder', () => {
		const routing = op('create').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/betaTesters');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachBetaTesterBody);
	});

	it('Delete DELETEs by tester id and confirms with { deleted: true }', async () => {
		const routing = op('delete').routing;
		expect(routing.request.method).toBe('DELETE');
		expect(routing.request.url).toBe('=/v1/betaTesters/{{$parameter["betaTesterId"]}}');
		expect(routing.send).toBeUndefined();

		const makeRoutingRequest = jest.fn(async () => [] as INodeExecutionData[]);
		const ctx = {
			makeRoutingRequest,
			getNode: () => FAKE_NODE,
		} as unknown as IExecutePaginationFunctions;

		const result = await routing.operations.pagination.call(
			ctx,
			{ options: { url: '/v1/betaTesters/t-1' } } as unknown as DeclarativeRestApiSettings.ResultOptions,
		);

		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		expect(result).toEqual([{ json: { deleted: true } }]);
	});

	it('Add to Group POSTs the linkage and confirms with { added: true }', async () => {
		const option = op('addToGroup');
		expect(option.name).toBe('Add to Group');
		const routing = option.routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe(
			'=/v1/betaGroups/{{$parameter["betaGroup"]}}/relationships/betaTesters',
		);
		expect(routing.send.preSend).toContain(attachBetaTesterGroupLinkage);

		// Relationship write replies 204 No Content; the confirmation hook emits
		// an explicit `{ added: true }` item rather than n8n's empty body.
		const makeRoutingRequest = jest.fn(async () => [] as INodeExecutionData[]);
		const ctx = {
			makeRoutingRequest,
			getNode: () => FAKE_NODE,
		} as unknown as IExecutePaginationFunctions;

		const result = await routing.operations.pagination.call(
			ctx,
			{
				options: { url: '/v1/betaGroups/g-1/relationships/betaTesters' },
			} as unknown as DeclarativeRestApiSettings.ResultOptions,
		);

		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		expect(result).toEqual([{ json: { added: true } }]);
	});

	it('Remove from Group DELETEs the linkage and confirms with { removed: true }', async () => {
		const option = op('removeFromGroup');
		expect(option.name).toBe('Remove from Group');
		const routing = option.routing;
		expect(routing.request.method).toBe('DELETE');
		expect(routing.request.url).toBe(
			'=/v1/betaGroups/{{$parameter["betaGroup"]}}/relationships/betaTesters',
		);
		expect(routing.send.preSend).toContain(attachBetaTesterGroupLinkage);

		const makeRoutingRequest = jest.fn(async () => [] as INodeExecutionData[]);
		const ctx = {
			makeRoutingRequest,
			getNode: () => FAKE_NODE,
		} as unknown as IExecutePaginationFunctions;

		const result = await routing.operations.pagination.call(
			ctx,
			{
				options: { url: '/v1/betaGroups/g-1/relationships/betaTesters' },
			} as unknown as DeclarativeRestApiSettings.ResultOptions,
		);

		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		expect(result).toEqual([{ json: { removed: true } }]);
	});
});

/**
 * Drive the shared cursor-pagination hook exactly as Get Many wires it up
 * (`/v1/betaTesters`), with a mocked `makeRoutingRequest` returning ASC JSON:API
 * list bodies, to prove Get Many follows `links.next`, truncates under a Limit,
 * and maps a failing ASC response to a NodeApiError.
 */
describe('betaTester Get Many pagination + error mapping', () => {
	function page(ids: string[], next: string | null): INodeExecutionData[] {
		return [{ json: { data: ids.map((id) => ({ id })), links: { next } } }];
	}

	function paginationCtx(
		pages: INodeExecutionData[][],
		params: { returnAll: boolean; limit?: number },
	) {
		let index = 0;
		const makeRoutingRequest = jest.fn(async () => {
			const next = pages[index];
			index += 1;
			if (!next) throw new Error(`requested page ${index} but only ${pages.length} exist`);
			return next;
		});
		const ctx = {
			getNodeParameter: (name: string, fallback?: unknown) => {
				if (name === 'returnAll') return params.returnAll;
				if (name === 'limit') return params.limit ?? fallback;
				return fallback;
			},
			makeRoutingRequest,
			getNode: () => FAKE_NODE,
		} as unknown as IExecutePaginationFunctions;
		return { ctx, makeRoutingRequest };
	}

	const baseRequest = () =>
		({
			options: { url: '/v1/betaTesters', qs: {} },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

	function ids(result: INodeExecutionData[]): string[] {
		return result.map((item) => (item.json as { id: string }).id);
	}

	it('follows links.next across pages for Return All', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[
				page(['t1', 't2'], 'https://api.appstoreconnect.apple.com/v1/betaTesters?cursor=2'),
				page(['t3'], null),
			],
			{ returnAll: true },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['t1', 't2', 't3']);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
	});

	it('truncates to the Limit and fetches no further pages', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[page(['t1', 't2', 't3'], 'https://api.appstoreconnect.apple.com/v1/betaTesters?cursor=2')],
			{ returnAll: false, limit: 2 },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['t1', 't2']);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
	});

	it('maps a failed ASC response to a NodeApiError', async () => {
		const makeRoutingRequest = jest.fn().mockRejectedValue(
			(() => {
				const err = new Error('Request failed with status code 409');
				(err as unknown as { cause: unknown }).cause = {
					response: {
						data: {
							errors: [
								{
									status: '409',
									code: 'ENTITY_ERROR',
									detail: "The attribute 'email' is not valid",
								},
							],
						},
					},
				};
				return err;
			})(),
		);
		const ctx = {
			getNodeParameter: (name: string) => (name === 'returnAll' ? true : undefined),
			makeRoutingRequest,
			getNode: () => FAKE_NODE,
		} as unknown as IExecutePaginationFunctions;

		await expect(ascCursorPagination.call(ctx, baseRequest())).rejects.toBeInstanceOf(
			NodeApiError,
		);
	});
});

describe('betaTester constants', () => {
	it('uses the doc-derived JSON:API resource type', () => {
		expect(BETA_TESTER_RESOURCE_TYPE).toBe('betaTesters');
	});
});

// Touch the exported operations array so an accidental empty export is caught.
describe('betaTester fields', () => {
	it('exports operation properties', () => {
		const props: INodeProperties[] = betaTesterOperations;
		expect(props[0].name).toBe('operation');
	});
});
