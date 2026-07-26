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
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import { attachBuildFilters, attachBuildUpdateBody } from './build.body';
import {
	BUILD_BETA_DETAIL_RESOURCE_TYPE,
	BUILD_PROCESSING_STATES,
	BUILD_RESOURCE_TYPE,
	PRE_RELEASE_VERSION_RESOURCE_TYPE,
} from './build.constants';
import { buildOperations } from './build.resource';

/**
 * Tests for the Builds resource: the Get Many filter hook (folding curated
 * app/version/processingState/preReleaseVersion into `filter[...]` query
 * params), the Update body builder (typed AND raw-JSON passthrough via
 * `resolveMutationData`), the declarative operation wiring, and — driving the
 * shared cursor-pagination hook against the Get Many URL — pagination and ASC
 * error mapping.
 */

const FAKE_NODE = {
	id: 'test-node',
	name: 'App Store Connect',
	type: 'n8n-nodes-app-store-connect.appStoreConnect',
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
const operationOptions = buildOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

describe('attachBuildFilters (Get Many)', () => {
	it('folds every curated filter into filter[...] query params', async () => {
		const ctx = makeCtx({
			targetApp: 'app-99',
			filterVersion: '1024',
			filterProcessingState: 'VALID',
			filterPreReleaseVersion: 'prv-7',
			filterExpired: 'false',
		});

		const result = await attachBuildFilters.call(ctx, {
			method: 'GET',
			url: '/v1/builds',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[app]': 'app-99',
			'filter[version]': '1024',
			'filter[processingState]': 'VALID',
			'filter[preReleaseVersion]': 'prv-7',
			'filter[expired]': 'false',
		});
	});

	it('skips the tri-state Expired filter left on "Any" (empty value)', async () => {
		const ctx = makeCtx({ filterExpired: '' });

		const result = await attachBuildFilters.call(ctx, {
			method: 'GET',
			url: '/v1/builds',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({});
	});

	it('omits unset filters and preserves any existing qs', async () => {
		const ctx = makeCtx({
			targetApp: '',
			filterVersion: '',
			filterProcessingState: '',
			filterPreReleaseVersion: '',
		});

		const result = await attachBuildFilters.call(ctx, {
			method: 'GET',
			url: '/v1/builds',
			qs: { limit: 200 },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ limit: 200 });
	});

	it('sends only the app filter when only the app is chosen', async () => {
		const ctx = makeCtx({ targetApp: 'app-1' });

		const result = await attachBuildFilters.call(ctx, {
			method: 'GET',
			url: '/v1/builds',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[app]': 'app-1' });
	});
});

describe('attachSort (shared)', () => {
	it('folds the chosen sort value into qs.sort', async () => {
		const ctx = makeCtx({ sort: '-uploadedDate' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/builds',
			qs: { 'filter[app]': 'app-1' },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[app]': 'app-1', sort: '-uploadedDate' });
	});

	it('sends nothing when left on the default (unsorted)', async () => {
		const ctx = makeCtx({ sort: '' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/builds',
		} as IHttpRequestOptions);

		expect(result.qs).toBeUndefined();
	});
});

describe('attachBuildUpdateBody', () => {
	function build(params: Record<string, unknown>) {
		const ctx = makeCtx(params);
		return attachBuildUpdateBody.call(ctx, {
			method: 'PATCH',
			url: '/v1/builds/b-1',
		} as IHttpRequestOptions);
	}

	describe('fields mode', () => {
		it('builds a body with only the attributes the user set', async () => {
			const result = await build({
				operation: 'update',
				inputMode: 'fields',
				buildId: 'b-1',
				updateFields: { expired: true },
			});

			expect(result.body).toEqual({
				data: {
					type: BUILD_RESOURCE_TYPE,
					id: 'b-1',
					attributes: { expired: true },
				},
			});
		});

		it('supports usesNonExemptEncryption and expired together', async () => {
			const result = await build({
				operation: 'update',
				inputMode: 'fields',
				buildId: 'b-2',
				updateFields: { expired: false, usesNonExemptEncryption: true },
			});

			expect(result.body).toEqual({
				data: {
					type: BUILD_RESOURCE_TYPE,
					id: 'b-2',
					attributes: { expired: false, usesNonExemptEncryption: true },
				},
			});
		});

		it('emits an empty attributes object when no update fields are set', async () => {
			const result = await build({
				operation: 'update',
				inputMode: 'fields',
				buildId: 'b-3',
				updateFields: {},
			});

			expect(result.body).toEqual({
				data: { type: BUILD_RESOURCE_TYPE, id: 'b-3', attributes: {} },
			});
		});
	});

	describe('json mode', () => {
		it('passes the raw JSON:API data object straight through', async () => {
			const result = await build({
				operation: 'update',
				inputMode: 'json',
				jsonBody: '{"type":"builds","id":"b-raw","attributes":{"usesNonExemptEncryption":false}}',
			});

			expect(result.body).toEqual({
				data: {
					type: 'builds',
					id: 'b-raw',
					attributes: { usesNonExemptEncryption: false },
				},
			});
		});

		it('rejects invalid JSON before building a request', async () => {
			await expect(
				build({ operation: 'update', inputMode: 'json', jsonBody: 'nonsense' }),
			).rejects.toThrow();
		});
	});
});

describe('build operation wiring', () => {
	it('Get Many is a top-level cursor-paginated read with filter + query hooks', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('/v1/builds');
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([attachBuildFilters, attachSort, attachQueryOptions]);
	});

	it('Get is a single request by build id, with query options', () => {
		const routing = op('get').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/builds/{{$parameter["buildId"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachQueryOptions);
	});

	it('Get Beta Detail reads the buildBetaDetail sub-resource', () => {
		const routing = op('getBetaDetail').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/builds/{{$parameter["buildId"]}}/buildBetaDetail');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
	});

	it('Update PATCHes by build id via the body builder', () => {
		const routing = op('update').routing;
		expect(routing.request.method).toBe('PATCH');
		expect(routing.request.url).toBe('=/v1/builds/{{$parameter["buildId"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachBuildUpdateBody);
	});
});

/**
 * Drive the shared cursor-pagination hook exactly as Get Many wires it up
 * (`/v1/builds`), with a mocked `makeRoutingRequest` returning ASC JSON:API list
 * bodies, to prove Get Many follows `links.next`, truncates under a Limit, and
 * maps a failing ASC response to a NodeApiError.
 */
describe('build Get Many pagination + error mapping', () => {
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
			options: { url: '/v1/builds', qs: {} },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

	function ids(result: INodeExecutionData[]): string[] {
		return result.map((item) => (item.json as { id: string }).id);
	}

	it('follows links.next across pages for Return All', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[
				page(['b1', 'b2'], 'https://api.appstoreconnect.apple.com/v1/builds?cursor=2'),
				page(['b3'], null),
			],
			{ returnAll: true },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['b1', 'b2', 'b3']);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
	});

	it('truncates to the Limit and fetches no further pages', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[page(['b1', 'b2', 'b3'], 'https://api.appstoreconnect.apple.com/v1/builds?cursor=2')],
			{ returnAll: false, limit: 2 },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['b1', 'b2']);
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
									detail: "The attribute 'expired' is not valid",
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

describe('build constants', () => {
	it('uses the doc-derived JSON:API resource types', () => {
		expect(BUILD_RESOURCE_TYPE).toBe('builds');
		expect(PRE_RELEASE_VERSION_RESOURCE_TYPE).toBe('preReleaseVersions');
		expect(BUILD_BETA_DETAIL_RESOURCE_TYPE).toBe('buildBetaDetails');
		expect(BUILD_PROCESSING_STATES).toEqual(['PROCESSING', 'FAILED', 'INVALID', 'VALID']);
	});
});

// Touch the exported operations array so an accidental empty export is caught.
describe('build fields', () => {
	it('exports operation properties', () => {
		const props: INodeProperties[] = buildOperations;
		expect(props[0].name).toBe('operation');
	});
});
