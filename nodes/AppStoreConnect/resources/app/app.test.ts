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
import { attachAppFilters, attachAppInfoLocalizationUpdateBody } from './app.body';
import {
	APP_INFO_LOCALIZATION_RESOURCE_TYPE,
	APP_INFO_RESOURCE_TYPE,
	APP_RESOURCE_TYPE,
} from './app.constants';
import { appOperations } from './app.resource';

/**
 * Tests for the Apps & App Info resource: the app-info localization Update body
 * builder (typed AND raw-JSON passthrough via `resolveMutationData`), the
 * declarative operation wiring (URLs, app scoping, and which shared transport
 * hook — cursor paging vs single request — each operation routes through), and —
 * driving the shared cursor-pagination hook against the Get Many URL —
 * pagination and ASC error mapping.
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
const operationOptions = appOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

describe('attachAppInfoLocalizationUpdateBody', () => {
	function build(params: Record<string, unknown>) {
		const ctx = makeCtx(params);
		return attachAppInfoLocalizationUpdateBody.call(ctx, {
			method: 'PATCH',
			url: '/v1/appInfoLocalizations/loc-1',
		} as IHttpRequestOptions);
	}

	describe('fields mode', () => {
		it('builds a body with only the attributes the user set', async () => {
			const result = await build({
				operation: 'updateAppInfoLocalization',
				inputMode: 'fields',
				localizationId: 'loc-1',
				updateFields: { name: 'My App', subtitle: 'Does things' },
			});

			expect(result.body).toEqual({
				data: {
					type: APP_INFO_LOCALIZATION_RESOURCE_TYPE,
					id: 'loc-1',
					attributes: { name: 'My App', subtitle: 'Does things' },
				},
			});
		});

		it('supports the privacy-policy attributes', async () => {
			const result = await build({
				operation: 'updateAppInfoLocalization',
				inputMode: 'fields',
				localizationId: 'loc-2',
				updateFields: {
					privacyPolicyUrl: 'https://example.com/privacy',
					privacyPolicyText: 'We respect your privacy.',
					privacyChoicesUrl: 'https://example.com/choices',
				},
			});

			expect(result.body).toEqual({
				data: {
					type: APP_INFO_LOCALIZATION_RESOURCE_TYPE,
					id: 'loc-2',
					attributes: {
						privacyPolicyUrl: 'https://example.com/privacy',
						privacyPolicyText: 'We respect your privacy.',
						privacyChoicesUrl: 'https://example.com/choices',
					},
				},
			});
		});

		it('emits an empty attributes object when no update fields are set', async () => {
			const result = await build({
				operation: 'updateAppInfoLocalization',
				inputMode: 'fields',
				localizationId: 'loc-3',
				updateFields: {},
			});

			expect(result.body).toEqual({
				data: { type: APP_INFO_LOCALIZATION_RESOURCE_TYPE, id: 'loc-3', attributes: {} },
			});
		});
	});

	describe('json mode', () => {
		it('passes the raw JSON:API data object straight through', async () => {
			const result = await build({
				operation: 'updateAppInfoLocalization',
				inputMode: 'json',
				jsonBody:
					'{"type":"appInfoLocalizations","id":"loc-raw","attributes":{"name":"Raw Name"}}',
			});

			expect(result.body).toEqual({
				data: {
					type: 'appInfoLocalizations',
					id: 'loc-raw',
					attributes: { name: 'Raw Name' },
				},
			});
		});

		it('rejects invalid JSON before building a request', async () => {
			await expect(
				build({
					operation: 'updateAppInfoLocalization',
					inputMode: 'json',
					jsonBody: 'nonsense',
				}),
			).rejects.toThrow();
		});
	});
});

describe('attachAppFilters (Get Many)', () => {
	it('folds the curated typed filters (bundleId + name + sku) into filter[...]', async () => {
		const ctx = makeCtx({
			filterBundleId: 'com.example.app',
			filterName: 'Example',
			filterSku: 'SKU-1',
		});

		const result = await attachAppFilters.call(ctx, {
			method: 'GET',
			url: '/v1/apps',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[bundleId]': 'com.example.app',
			'filter[name]': 'Example',
			'filter[sku]': 'SKU-1',
		});
	});

	it('omits unset filters and preserves any existing qs', async () => {
		const ctx = makeCtx({ filterBundleId: '', filterName: '', filterSku: '' });

		const result = await attachAppFilters.call(ctx, {
			method: 'GET',
			url: '/v1/apps',
			qs: { limit: 200 },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ limit: 200 });
	});
});

describe('attachSort (shared)', () => {
	it('folds the chosen sort value into qs.sort', async () => {
		const ctx = makeCtx({ sort: '-name' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/apps',
			qs: { 'filter[sku]': 'SKU-1' },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[sku]': 'SKU-1', sort: '-name' });
	});

	it('sends nothing when left on the default (unsorted)', async () => {
		const ctx = makeCtx({ sort: '' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/apps',
		} as IHttpRequestOptions);

		expect(result.qs).toBeUndefined();
	});
});

describe('app operation wiring', () => {
	it('Get Many is a top-level cursor-paginated read with filter + sort + query hooks', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('/v1/apps');
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([attachAppFilters, attachSort, attachQueryOptions]);
	});

	it('Get is a single request by app id, with query options', () => {
		const routing = op('get').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/apps/{{$parameter["targetApp"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachQueryOptions);
	});

	it('Get App Info reads the app-scoped appInfos sub-resource', () => {
		const routing = op('getAppInfo').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/apps/{{$parameter["targetApp"]}}/appInfos');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachQueryOptions);
	});

	it('Update App Info Localization PATCHes by localization id via the body builder', () => {
		const routing = op('updateAppInfoLocalization').routing;
		expect(routing.request.method).toBe('PATCH');
		expect(routing.request.url).toBe(
			'=/v1/appInfoLocalizations/{{$parameter["localizationId"]}}',
		);
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachAppInfoLocalizationUpdateBody);
	});
});

/**
 * Drive the shared cursor-pagination hook exactly as Get Many wires it up
 * (`/v1/apps`), with a mocked `makeRoutingRequest` returning ASC JSON:API list
 * bodies, to prove Get Many follows `links.next`, truncates under a Limit, and
 * maps a failing ASC response to a NodeApiError.
 */
describe('app Get Many pagination + error mapping', () => {
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
			options: { url: '/v1/apps', qs: {} },
		}) as unknown as DeclarativeRestApiSettings.ResultOptions;

	function ids(result: INodeExecutionData[]): string[] {
		return result.map((item) => (item.json as { id: string }).id);
	}

	it('follows links.next across pages for Return All', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[
				page(['a1', 'a2'], 'https://api.appstoreconnect.apple.com/v1/apps?cursor=2'),
				page(['a3'], null),
			],
			{ returnAll: true },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['a1', 'a2', 'a3']);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
	});

	it('truncates to the Limit and fetches no further pages', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[page(['a1', 'a2', 'a3'], 'https://api.appstoreconnect.apple.com/v1/apps?cursor=2')],
			{ returnAll: false, limit: 2 },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['a1', 'a2']);
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

describe('app constants', () => {
	it('uses the doc-derived JSON:API resource types', () => {
		expect(APP_RESOURCE_TYPE).toBe('apps');
		expect(APP_INFO_RESOURCE_TYPE).toBe('appInfos');
		expect(APP_INFO_LOCALIZATION_RESOURCE_TYPE).toBe('appInfoLocalizations');
	});
});

// Touch the exported operations array so an accidental empty export is caught.
describe('app fields', () => {
	it('exports operation properties', () => {
		const props: INodeProperties[] = appOperations;
		expect(props[0].name).toBe('operation');
	});
});
