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
import { APP_RESOURCE_TYPE } from '../../methods/apps';
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import { attachBetaGroupBody, attachBetaGroupFilters } from './betaGroup.body';
import {
	BETA_GROUP_INVITATION_RESOURCE_TYPE,
	BETA_GROUP_RESOURCE_TYPE,
} from './betaGroup.constants';
import { betaGroupOperations } from './betaGroup.resource';

/**
 * Tests for the Beta Groups resource: the Get Many app-filter hook (folding the
 * curated Target App into a `filter[app]` query param), the Create/Update body
 * builder (typed AND raw-JSON passthrough via `resolveMutationData`), the
 * declarative operation wiring, and — driving the shared cursor-pagination hook
 * against the Get Many URL — pagination and ASC error mapping.
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
const operationOptions = betaGroupOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

describe('attachBetaGroupFilters (Get Many)', () => {
	it('folds the chosen app into filter[app]', async () => {
		const ctx = makeCtx({ targetApp: 'app-42' });

		const result = await attachBetaGroupFilters.call(ctx, {
			method: 'GET',
			url: '/v1/betaGroups',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[app]': 'app-42' });
	});

	it('omits the filter when no app is chosen and preserves existing qs', async () => {
		const ctx = makeCtx({ targetApp: '' });

		const result = await attachBetaGroupFilters.call(ctx, {
			method: 'GET',
			url: '/v1/betaGroups',
			qs: { limit: 200 },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ limit: 200 });
	});

	it('folds the curated typed filters (name + tri-state booleans) into filter[...]', async () => {
		const ctx = makeCtx({
			targetApp: 'app-42',
			filterName: 'Internal QA',
			filterIsInternalGroup: 'true',
			filterPublicLinkEnabled: 'false',
		});

		const result = await attachBetaGroupFilters.call(ctx, {
			method: 'GET',
			url: '/v1/betaGroups',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[app]': 'app-42',
			'filter[name]': 'Internal QA',
			'filter[isInternalGroup]': 'true',
			'filter[publicLinkEnabled]': 'false',
		});
	});

	it('skips tri-state boolean filters left on "Any" (empty value)', async () => {
		const ctx = makeCtx({
			filterName: '',
			filterIsInternalGroup: '',
			filterPublicLinkEnabled: '',
		});

		const result = await attachBetaGroupFilters.call(ctx, {
			method: 'GET',
			url: '/v1/betaGroups',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({});
	});
});

describe('attachSort (shared)', () => {
	it('folds the chosen sort value into qs.sort', async () => {
		const ctx = makeCtx({ sort: '-name' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/betaGroups',
			qs: { 'filter[app]': 'app-42' },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[app]': 'app-42', sort: '-name' });
	});

	it('sends nothing when left on the default (unsorted)', async () => {
		const ctx = makeCtx({ sort: '' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/betaGroups',
		} as IHttpRequestOptions);

		expect(result.qs).toBeUndefined();
	});
});

describe('attachBetaGroupBody', () => {
	function build(params: Record<string, unknown>) {
		const ctx = makeCtx(params);
		return attachBetaGroupBody.call(ctx, {
			method: 'POST',
			url: '/v1/betaGroups',
		} as IHttpRequestOptions);
	}

	describe('fields mode', () => {
		it('builds a Create body with name, optional attributes, and an app relationship', async () => {
			const result = await build({
				operation: 'create',
				inputMode: 'fields',
				name: 'Internal QA',
				targetApp: 'app-1',
				additionalFields: { publicLinkEnabled: true, feedbackEnabled: false },
			});

			expect(result.body).toEqual({
				data: {
					type: BETA_GROUP_RESOURCE_TYPE,
					attributes: {
						name: 'Internal QA',
						publicLinkEnabled: true,
						feedbackEnabled: false,
					},
					relationships: {
						app: { data: { type: APP_RESOURCE_TYPE, id: 'app-1' } },
					},
				},
			});
		});

		it('builds an Update body keyed by the group id with only the fields set, no relationship', async () => {
			const result = await build({
				operation: 'update',
				inputMode: 'fields',
				betaGroup: 'g-9',
				updateFields: { name: 'Renamed', publicLinkLimit: 500 },
			});

			expect(result.body).toEqual({
				data: {
					type: BETA_GROUP_RESOURCE_TYPE,
					id: 'g-9',
					attributes: { name: 'Renamed', publicLinkLimit: 500 },
				},
			});
		});

		it('emits an empty attributes object on Update when no fields are set', async () => {
			const result = await build({
				operation: 'update',
				inputMode: 'fields',
				betaGroup: 'g-3',
				updateFields: {},
			});

			expect(result.body).toEqual({
				data: { type: BETA_GROUP_RESOURCE_TYPE, id: 'g-3', attributes: {} },
			});
		});
	});

	describe('json mode', () => {
		it('passes the raw JSON:API data object straight through', async () => {
			const result = await build({
				operation: 'create',
				inputMode: 'json',
				jsonBody:
					'{"type":"betaGroups","attributes":{"name":"Raw"},"relationships":{"app":{"data":{"type":"apps","id":"app-raw"}}}}',
			});

			expect(result.body).toEqual({
				data: {
					type: 'betaGroups',
					attributes: { name: 'Raw' },
					relationships: { app: { data: { type: 'apps', id: 'app-raw' } } },
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

describe('betaGroup operation wiring', () => {
	it('Get Many is a top-level cursor-paginated read with filter + query hooks', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('/v1/betaGroups');
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([attachBetaGroupFilters, attachSort, attachQueryOptions]);
	});

	it('Get is a single request by group id, with query options', () => {
		const routing = op('get').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/betaGroups/{{$parameter["betaGroup"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachQueryOptions);
	});

	it('Create POSTs via the body builder', () => {
		const routing = op('create').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/betaGroups');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachBetaGroupBody);
	});

	it('Update PATCHes by group id via the body builder', () => {
		const routing = op('update').routing;
		expect(routing.request.method).toBe('PATCH');
		expect(routing.request.url).toBe('=/v1/betaGroups/{{$parameter["betaGroup"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachBetaGroupBody);
	});

	it('Delete DELETEs by group id and confirms with { deleted: true }', async () => {
		const routing = op('delete').routing;
		expect(routing.request.method).toBe('DELETE');
		expect(routing.request.url).toBe('=/v1/betaGroups/{{$parameter["betaGroup"]}}');
		expect(routing.send).toBeUndefined();

		// Delete replies 204 No Content; the confirmation hook runs the request
		// for its side effect and emits an explicit `{ deleted: true }` item
		// rather than passing n8n's empty body through.
		const makeRoutingRequest = jest.fn(async () => [] as INodeExecutionData[]);
		const ctx = {
			makeRoutingRequest,
			getNode: () => FAKE_NODE,
		} as unknown as IExecutePaginationFunctions;

		const result = await routing.operations.pagination.call(
			ctx,
			{
				options: { url: '/v1/betaGroups/g-1' },
			} as unknown as DeclarativeRestApiSettings.ResultOptions,
		);

		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		expect(result).toEqual([{ json: { deleted: true } }]);
	});
});

/**
 * Drive the shared cursor-pagination hook exactly as Get Many wires it up
 * (`/v1/betaGroups`), with a mocked `makeRoutingRequest` returning ASC JSON:API
 * list bodies, to prove Get Many follows `links.next`, truncates under a Limit,
 * and maps a failing ASC response to a NodeApiError.
 */
describe('betaGroup Get Many pagination + error mapping', () => {
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
			options: { url: '/v1/betaGroups', qs: {} },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

	function ids(result: INodeExecutionData[]): string[] {
		return result.map((item) => (item.json as { id: string }).id);
	}

	it('follows links.next across pages for Return All', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[
				page(['g1', 'g2'], 'https://api.appstoreconnect.apple.com/v1/betaGroups?cursor=2'),
				page(['g3'], null),
			],
			{ returnAll: true },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['g1', 'g2', 'g3']);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
	});

	it('truncates to the Limit and fetches no further pages', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[page(['g1', 'g2', 'g3'], 'https://api.appstoreconnect.apple.com/v1/betaGroups?cursor=2')],
			{ returnAll: false, limit: 2 },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['g1', 'g2']);
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
									detail: "The attribute 'name' is not valid",
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

describe('betaGroup constants', () => {
	it('uses the doc-derived JSON:API resource types', () => {
		expect(BETA_GROUP_RESOURCE_TYPE).toBe('betaGroups');
		expect(BETA_GROUP_INVITATION_RESOURCE_TYPE).toBe('betaGroupInvitations');
	});
});

// Touch the exported operations array so an accidental empty export is caught.
describe('betaGroup fields', () => {
	it('exports operation properties', () => {
		const props: INodeProperties[] = betaGroupOperations;
		expect(props[0].name).toBe('operation');
	});
});
