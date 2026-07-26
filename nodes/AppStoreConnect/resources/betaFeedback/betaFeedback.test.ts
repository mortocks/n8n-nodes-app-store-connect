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
import { attachBetaFeedbackFilters } from './betaFeedback.body';
import {
	BETA_FEEDBACK_CRASH_RESOURCE_TYPE,
	BETA_FEEDBACK_SCREENSHOT_RESOURCE_TYPE,
} from './betaFeedback.constants';
import { betaFeedbackFields, betaFeedbackOperations } from './betaFeedback.resource';

/**
 * Tests for the Beta Feedback resource: the declarative operation wiring (URLs,
 * app scoping, and which shared transport hook each operation routes through),
 * that the Feedback Type selector switches the endpoint between the crash and
 * screenshot resource types, and — driving the shared cursor-pagination hook
 * against the resolved Get Many URL for BOTH kinds — pagination and ASC error
 * mapping.
 */

const FAKE_NODE = {
	id: 'test-node',
	name: 'App Store Connect',
	type: 'n8n-nodes-app-store-connect.appStoreConnect',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

/** Pull the operation option objects out of the declarative `Operation` field. */
const operationOptions = betaFeedbackOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

/**
 * Resolve a declarative URL template the way n8n's expression engine would,
 * substituting `{{$parameter["name"]}}` from the supplied params. Lets the tests
 * assert the concrete endpoint the chosen Feedback Type produces.
 */
function resolveUrl(template: string, params: Record<string, string>): string {
	return template
		.replace(/^=/, '')
		.replace(/\{\{\$parameter\["(\w+)"\]\}\}/g, (_match, name: string) => params[name] ?? '');
}

function makeCtx(params: Record<string, unknown>): IExecuteSingleFunctions {
	return {
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getNode: () => FAKE_NODE,
	} as unknown as IExecuteSingleFunctions;
}

describe('attachBetaFeedbackFilters (Get Many)', () => {
	it('folds the curated typed filters into filter[...] (same set for both kinds)', async () => {
		const ctx = makeCtx({
			filterDevicePlatform: 'IOS',
			filterAppPlatform: 'MAC_OS',
			filterDeviceModel: 'iPhone14,3',
			filterOsVersion: '17.5.1',
			filterBuild: 'build-1',
		});

		const result = await attachBetaFeedbackFilters.call(ctx, {
			method: 'GET',
			url: '/v1/apps/APP1/betaFeedbackCrashSubmissions',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[devicePlatform]': 'IOS',
			'filter[appPlatform]': 'MAC_OS',
			'filter[deviceModel]': 'iPhone14,3',
			'filter[osVersion]': '17.5.1',
			'filter[build]': 'build-1',
		});
	});

	it('omits unset filters and preserves any existing qs', async () => {
		const ctx = makeCtx({
			filterDevicePlatform: '',
			filterAppPlatform: '',
			filterDeviceModel: '',
			filterOsVersion: '',
			filterBuild: '',
		});

		const result = await attachBetaFeedbackFilters.call(ctx, {
			method: 'GET',
			url: '/v1/apps/APP1/betaFeedbackScreenshotSubmissions',
			qs: { limit: 200 },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ limit: 200 });
	});
});

describe('attachSort (shared)', () => {
	it('folds the chosen sort value into qs.sort', async () => {
		const ctx = makeCtx({ sort: '-createdDate' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/apps/APP1/betaFeedbackCrashSubmissions',
			qs: { 'filter[devicePlatform]': 'IOS' },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[devicePlatform]': 'IOS', sort: '-createdDate' });
	});

	it('sends nothing when left on the default (unsorted)', async () => {
		const ctx = makeCtx({ sort: '' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/apps/APP1/betaFeedbackCrashSubmissions',
		} as IHttpRequestOptions);

		expect(result.qs).toBeUndefined();
	});
});

describe('betaFeedback operation wiring', () => {
	it('Get Many is app-scoped and cursor-paginated, with filter + sort + query hooks', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe(
			'=/v1/apps/{{$parameter["targetApp"]}}/{{$parameter["feedbackType"]}}',
		);
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([
			attachBetaFeedbackFilters,
			attachSort,
			attachQueryOptions,
		]);
	});

	it('Get is a single request by feedback id, with query options', () => {
		const routing = op('get').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe(
			'=/v1/{{$parameter["feedbackType"]}}/{{$parameter["feedbackId"]}}',
		);
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachQueryOptions);
	});

	it('Delete DELETEs by feedback id and confirms with { deleted: true }, with no body hook', async () => {
		const routing = op('delete').routing;
		expect(routing.request.method).toBe('DELETE');
		expect(routing.request.url).toBe(
			'=/v1/{{$parameter["feedbackType"]}}/{{$parameter["feedbackId"]}}',
		);
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
				options: { url: '/v1/betaFeedbackCrashSubmissions/fb-1' },
			} as unknown as DeclarativeRestApiSettings.ResultOptions,
		);

		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		expect(result).toEqual([{ json: { deleted: true } }]);
	});
});

describe('betaFeedback Feedback Type endpoint selection', () => {
	const getManyUrl = op('getMany').routing.request.url as string;
	const getUrl = op('get').routing.request.url as string;
	const deleteUrl = op('delete').routing.request.url as string;

	it('Get Many hits the crash collection when Feedback Type is crash', () => {
		expect(resolveUrl(getManyUrl, { targetApp: 'APP1', feedbackType: BETA_FEEDBACK_CRASH_RESOURCE_TYPE })).toBe(
			'/v1/apps/APP1/betaFeedbackCrashSubmissions',
		);
	});

	it('Get Many hits the screenshot collection when Feedback Type is screenshot', () => {
		expect(
			resolveUrl(getManyUrl, {
				targetApp: 'APP1',
				feedbackType: BETA_FEEDBACK_SCREENSHOT_RESOURCE_TYPE,
			}),
		).toBe('/v1/apps/APP1/betaFeedbackScreenshotSubmissions');
	});

	it('Get and Delete address the chosen resource-type by id', () => {
		expect(resolveUrl(getUrl, { feedbackType: BETA_FEEDBACK_CRASH_RESOURCE_TYPE, feedbackId: 'fb-1' })).toBe(
			'/v1/betaFeedbackCrashSubmissions/fb-1',
		);
		expect(
			resolveUrl(deleteUrl, {
				feedbackType: BETA_FEEDBACK_SCREENSHOT_RESOURCE_TYPE,
				feedbackId: 'fb-2',
			}),
		).toBe('/v1/betaFeedbackScreenshotSubmissions/fb-2');
	});
});

/**
 * Drive the shared cursor-pagination hook exactly as Get Many wires it up, with
 * the URL resolved for each Feedback Type and a mocked `makeRoutingRequest`
 * returning ASC JSON:API list bodies (crash submissions carry `attributes.crashLog`,
 * screenshots carry `attributes.screenshots`). Proves Get Many follows `links.next`,
 * truncates under a Limit, stays app-scoped to the selected endpoint, surfaces the
 * asset references, and maps a failing ASC response to a NodeApiError.
 */
describe('betaFeedback Get Many pagination + app scoping (both kinds)', () => {
	interface CallSnapshot {
		url: unknown;
		qs: Record<string, unknown>;
	}

	function paginationCtx(
		pages: INodeExecutionData[][],
		params: { returnAll: boolean; limit?: number },
	) {
		const calls: CallSnapshot[] = [];
		let index = 0;
		const makeRoutingRequest = jest.fn(async function (
			reqOpts: DeclarativeRestApiSettings.ResultOptions,
		) {
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
				return fallback;
			},
			makeRoutingRequest,
			getNode: () => FAKE_NODE,
		} as unknown as IExecutePaginationFunctions;
		return { ctx, calls, makeRoutingRequest };
	}

	const baseRequest = (url: string) =>
		({ options: { url, qs: {} } } as unknown as DeclarativeRestApiSettings.ResultOptions);

	function items(result: INodeExecutionData[]) {
		return result.map((item) => item.json as { id: string; attributes?: Record<string, unknown> });
	}

	it('follows links.next across pages for crash submissions, surfacing the crash log', async () => {
		const crashUrl = '/v1/apps/APP1/betaFeedbackCrashSubmissions';
		const { ctx, calls, makeRoutingRequest } = paginationCtx(
			[
				[
					{
						json: {
							data: [
								{ id: 'c1', attributes: { crashLog: { url: 'https://assets/c1.crash' } } },
							],
							links: {
								next: `https://api.appstoreconnect.apple.com${crashUrl}?cursor=2`,
							},
						},
					},
				],
				[
					{
						json: {
							data: [
								{ id: 'c2', attributes: { crashLog: { url: 'https://assets/c2.crash' } } },
							],
							links: { next: null },
						},
					},
				],
			],
			{ returnAll: true },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest(crashUrl));

		expect(items(result).map((i) => i.id)).toEqual(['c1', 'c2']);
		expect(items(result)[0].attributes?.crashLog).toEqual({ url: 'https://assets/c1.crash' });
		expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
		// First page is the app-scoped crash endpoint with the ASC max page size.
		expect(calls[0].url).toBe(crashUrl);
		expect(calls[0].qs).toEqual({ limit: 200 });
	});

	it('truncates screenshot submissions to the Limit, surfacing screenshot assets', async () => {
		const screenshotUrl = '/v1/apps/APP1/betaFeedbackScreenshotSubmissions';
		const { ctx, calls, makeRoutingRequest } = paginationCtx(
			[
				[
					{
						json: {
							data: [
								{ id: 's1', attributes: { screenshots: [{ url: 'https://assets/s1.png' }] } },
								{ id: 's2', attributes: { screenshots: [{ url: 'https://assets/s2.png' }] } },
								{ id: 's3', attributes: { screenshots: [{ url: 'https://assets/s3.png' }] } },
							],
							links: { next: 'https://api.appstoreconnect.apple.com/next' },
						},
					},
				],
			],
			{ returnAll: false, limit: 2 },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest(screenshotUrl));

		expect(items(result).map((i) => i.id)).toEqual(['s1', 's2']);
		expect(items(result)[0].attributes?.screenshots).toEqual([{ url: 'https://assets/s1.png' }]);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
		expect(calls[0].url).toBe(screenshotUrl);
		expect(calls[0].qs).toEqual({ limit: 2 });
	});

	it('maps a failed ASC response to a NodeApiError', async () => {
		const makeRoutingRequest = jest.fn().mockRejectedValue(
			(() => {
				const err = new Error('Request failed with status code 404');
				(err as unknown as { cause: unknown }).cause = {
					response: {
						data: {
							errors: [
								{
									status: '404',
									code: 'NOT_FOUND',
									detail: "There is no resource of type 'betaFeedbackCrashSubmissions' with id 'nope'",
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

		await expect(
			ascCursorPagination.call(ctx, baseRequest('/v1/apps/APP1/betaFeedbackCrashSubmissions')),
		).rejects.toBeInstanceOf(NodeApiError);
	});
});

describe('betaFeedback constants', () => {
	it('uses the doc-derived JSON:API resource types', () => {
		expect(BETA_FEEDBACK_CRASH_RESOURCE_TYPE).toBe('betaFeedbackCrashSubmissions');
		expect(BETA_FEEDBACK_SCREENSHOT_RESOURCE_TYPE).toBe('betaFeedbackScreenshotSubmissions');
	});
});

// Touch the exported fields array so an accidental empty export is caught.
describe('betaFeedback fields', () => {
	it('exports operation and field properties', () => {
		const ops: INodeProperties[] = betaFeedbackOperations;
		expect(ops[0].name).toBe('operation');
		const fields: INodeProperties[] = betaFeedbackFields;
		expect(fields[0].name).toBe('feedbackType');
	});
});
