import type {
	DeclarativeRestApiSettings,
	IExecutePaginationFunctions,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { attachSort } from '../_shared/listFilters';
import { attachQueryOptions } from '../_shared/queryOptions';
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import { attachUserBody, attachUserFilters } from './user.body';
import { USER_RESOURCE_TYPE } from './user.constants';
import { userOperations } from './user.resource';

/**
 * Tests for the Users resource: the Update Roles body builder (typed AND
 * raw-JSON passthrough via `resolveMutationData`, asserting the `roles` array
 * lands in `attributes`), the declarative operation wiring (URLs, and which
 * shared transport hook each operation routes through), and — driving the shared
 * cursor-pagination hook against the Get Many URL — pagination and ASC error
 * mapping.
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
const operationOptions = userOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

describe('attachUserFilters (Get Many)', () => {
	it('folds the curated typed filters into filter[...]', async () => {
		const ctx = makeCtx({
			filterUsername: 'jane@example.com',
			filterRoles: ['ADMIN', 'DEVELOPER'],
			visibleApp: 'app-42',
		});

		const result = await attachUserFilters.call(ctx, {
			method: 'GET',
			url: '/v1/users',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[username]': 'jane@example.com',
			'filter[roles]': 'ADMIN,DEVELOPER',
			'filter[visibleApps]': 'app-42',
		});
	});

	it('joins a single selected role into filter[roles]', async () => {
		const ctx = makeCtx({ filterRoles: ['MARKETING'] });

		const result = await attachUserFilters.call(ctx, {
			method: 'GET',
			url: '/v1/users',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[roles]': 'MARKETING' });
	});

	it('omits blank filters and preserves existing qs', async () => {
		const ctx = makeCtx({ filterUsername: '', filterRoles: [], visibleApp: '' });

		const result = await attachUserFilters.call(ctx, {
			method: 'GET',
			url: '/v1/users',
			qs: { limit: 200 },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ limit: 200 });
	});
});

describe('attachSort (shared, user Get Many)', () => {
	it('folds the chosen sort value into qs.sort', async () => {
		const ctx = makeCtx({ sort: '-lastName' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/users',
			qs: { 'filter[username]': 'jane@example.com' },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[username]': 'jane@example.com', sort: '-lastName' });
	});

	it('sends nothing when left on the default (unsorted)', async () => {
		const ctx = makeCtx({ sort: '' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/users',
		} as IHttpRequestOptions);

		expect(result.qs).toBeUndefined();
	});
});

describe('attachUserBody (Update Roles)', () => {
	function build(params: Record<string, unknown>) {
		const ctx = makeCtx(params);
		return attachUserBody.call(ctx, {
			method: 'PATCH',
			url: '/v1/users/u-1',
		} as IHttpRequestOptions);
	}

	describe('fields mode', () => {
		it('builds a body keyed by the user id with the roles array in attributes', async () => {
			const result = await build({
				operation: 'updateRoles',
				inputMode: 'fields',
				userId: 'u-1',
				roles: ['ADMIN', 'DEVELOPER'],
				additionalFields: {},
			});

			expect(result.body).toEqual({
				data: {
					type: USER_RESOURCE_TYPE,
					id: 'u-1',
					attributes: { roles: ['ADMIN', 'DEVELOPER'] },
				},
			});
		});

		it('folds optional visibility attributes alongside the roles', async () => {
			const result = await build({
				operation: 'updateRoles',
				inputMode: 'fields',
				userId: 'u-2',
				roles: ['MARKETING'],
				additionalFields: { allAppsVisible: false, provisioningAllowed: true },
			});

			expect(result.body).toEqual({
				data: {
					type: USER_RESOURCE_TYPE,
					id: 'u-2',
					attributes: {
						roles: ['MARKETING'],
						allAppsVisible: false,
						provisioningAllowed: true,
					},
				},
			});
		});
	});

	describe('json mode', () => {
		it('passes the raw JSON:API data object straight through', async () => {
			const result = await build({
				operation: 'updateRoles',
				inputMode: 'json',
				jsonBody:
					'{"type":"users","id":"u-raw","attributes":{"roles":["FINANCE"]}}',
			});

			expect(result.body).toEqual({
				data: {
					type: 'users',
					id: 'u-raw',
					attributes: { roles: ['FINANCE'] },
				},
			});
		});

		it('rejects invalid JSON before building a request', async () => {
			await expect(
				build({ operation: 'updateRoles', inputMode: 'json', jsonBody: 'nonsense' }),
			).rejects.toThrow();
		});
	});
});

describe('user operation wiring', () => {
	it('Get Many is a top-level cursor-paginated read with query options', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('/v1/users');
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([attachUserFilters, attachSort, attachQueryOptions]);
	});

	it('Get is a single request by user id, with query options', () => {
		const routing = op('get').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/users/{{$parameter["userId"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachQueryOptions);
	});

	it('Update Roles PATCHes by user id via the body builder', () => {
		const routing = op('updateRoles').routing;
		expect(routing.request.method).toBe('PATCH');
		expect(routing.request.url).toBe('=/v1/users/{{$parameter["userId"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachUserBody);
	});

	it('Remove DELETEs by user id and confirms with { deleted: true }', async () => {
		const routing = op('remove').routing;
		expect(routing.request.method).toBe('DELETE');
		expect(routing.request.url).toBe('=/v1/users/{{$parameter["userId"]}}');
		// No longer the plain single-request hook: it's a confirmation hook that
		// discards the 204 body and emits an explicit deletion confirmation.
		expect(routing.operations.pagination).not.toBe(ascSingleRequest);
		expect(typeof routing.operations.pagination).toBe('function');

		const makeRoutingRequest = jest.fn().mockResolvedValue([{ json: {} }]);
		const ctx = {
			makeRoutingRequest,
			getNode: () => FAKE_NODE,
		} as unknown as IExecutePaginationFunctions;
		const result = await routing.operations.pagination.call(ctx, {
			options: { method: 'DELETE', url: '/v1/users/u-1' },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

		expect(result).toEqual([{ json: { deleted: true } }]);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
	});
});

/**
 * Drive the shared cursor-pagination hook exactly as Get Many wires it up
 * (`/v1/users`), with a mocked `makeRoutingRequest` returning ASC JSON:API list
 * bodies, to prove Get Many follows `links.next`, truncates under a Limit, and
 * maps a failing ASC response to a NodeApiError.
 */
describe('user Get Many pagination + error mapping', () => {
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
			options: { url: '/v1/users', qs: {} },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

	function ids(result: INodeExecutionData[]): string[] {
		return result.map((item) => (item.json as { id: string }).id);
	}

	it('follows links.next across pages for Return All', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[
				page(['u1', 'u2'], 'https://api.appstoreconnect.apple.com/v1/users?cursor=2'),
				page(['u3'], null),
			],
			{ returnAll: true },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['u1', 'u2', 'u3']);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
	});

	it('truncates to the Limit and fetches no further pages', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[page(['u1', 'u2', 'u3'], 'https://api.appstoreconnect.apple.com/v1/users?cursor=2')],
			{ returnAll: false, limit: 2 },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['u1', 'u2']);
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
									detail: "The attribute 'roles' is not valid",
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

describe('user constants', () => {
	it('uses the doc-derived JSON:API resource type', () => {
		expect(USER_RESOURCE_TYPE).toBe('users');
	});
});

// Touch the exported operations array so an accidental empty export is caught.
describe('user fields', () => {
	it('exports operation properties', () => {
		const props: INodeProperties[] = userOperations;
		expect(props[0].name).toBe('operation');
	});
});
