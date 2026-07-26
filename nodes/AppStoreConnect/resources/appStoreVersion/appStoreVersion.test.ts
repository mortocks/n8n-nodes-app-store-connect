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

import { attachQueryOptions } from '../_shared/queryOptions';
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import {
	attachAppStoreVersionFilters,
	attachLocalizationUpdateBody,
	attachPhasedReleaseBody,
	attachReleaseRequestBody,
	attachReviewSubmissionBody,
	attachSubmissionItemBody,
	attachVersionBody,
} from './appStoreVersion.body';
import {
	APP_STORE_PLATFORMS,
	APP_STORE_STATES,
	APP_STORE_VERSION_LOCALIZATION_RESOURCE_TYPE,
	APP_STORE_VERSION_PHASED_RELEASE_RESOURCE_TYPE,
	APP_STORE_VERSION_PHASED_RELEASE_STATES,
	APP_STORE_VERSION_RELEASE_REQUEST_RESOURCE_TYPE,
	APP_STORE_VERSION_RELEASE_TYPES,
	APP_STORE_VERSION_RESOURCE_TYPE,
	REVIEW_SUBMISSION_ITEM_RESOURCE_TYPE,
	REVIEW_SUBMISSION_RESOURCE_TYPE,
} from './appStoreVersion.constants';
import { appStoreVersionOperations } from './appStoreVersion.resource';

/**
 * Tests for the App Store Versions & Release resource: the declarative operation
 * wiring (URLs, methods, pagination, preSend hooks), every write body builder
 * (typed AND raw-JSON passthrough via `resolveMutationData`, asserting the
 * JSON:API relationship envelopes for the submission / release / phased-release
 * flows), and — driving the shared cursor-pagination hook against the app-scoped
 * versions URL — pagination and ASC error mapping.
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
const operationOptions = appStoreVersionOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

// --- Version Create / Update -----------------------------------------------

describe('attachVersionBody', () => {
	function run(params: Record<string, unknown>) {
		const ctx = makeCtx(params);
		return attachVersionBody.call(ctx, {
			method: 'POST',
			url: '/v1/appStoreVersions',
		} as IHttpRequestOptions);
	}

	describe('create (fields mode)', () => {
		it('builds versionString + platform attributes and an app relationship', async () => {
			const result = await run({
				operation: 'create',
				inputMode: 'fields',
				versionString: '1.2.0',
				platform: 'IOS',
				additionalFields: {},
				targetApp: 'app-1',
			});

			expect(result.body).toEqual({
				data: {
					type: APP_STORE_VERSION_RESOURCE_TYPE,
					attributes: { versionString: '1.2.0', platform: 'IOS' },
					relationships: {
						app: { data: { type: 'apps', id: 'app-1' } },
					},
				},
			});
		});

		it('folds only the optional attributes the user set', async () => {
			const result = await run({
				operation: 'create',
				inputMode: 'fields',
				versionString: '2.0.0',
				platform: 'MAC_OS',
				additionalFields: { releaseType: 'SCHEDULED', earliestReleaseDate: '2026-08-01T00:00:00Z' },
				targetApp: 'app-9',
			});

			expect((result.body as any).data.attributes).toEqual({
				versionString: '2.0.0',
				platform: 'MAC_OS',
				releaseType: 'SCHEDULED',
				earliestReleaseDate: '2026-08-01T00:00:00Z',
			});
		});
	});

	describe('update (fields mode)', () => {
		it('sends only the changed attributes and echoes the version id', async () => {
			const result = await run({
				operation: 'update',
				inputMode: 'fields',
				appStoreVersionId: 'v-1',
				updateFields: { releaseType: 'MANUAL' },
			});

			expect(result.body).toEqual({
				data: {
					type: APP_STORE_VERSION_RESOURCE_TYPE,
					id: 'v-1',
					attributes: { releaseType: 'MANUAL' },
				},
			});
		});
	});

	describe('json mode', () => {
		it('passes the raw JSON:API data object straight through', async () => {
			const result = await run({
				operation: 'create',
				inputMode: 'json',
				jsonBody: '{"type":"appStoreVersions","attributes":{"versionString":"9.9.9"}}',
			});

			expect(result.body).toEqual({
				data: { type: 'appStoreVersions', attributes: { versionString: '9.9.9' } },
			});
		});

		it('rejects invalid JSON before building a request', async () => {
			await expect(
				run({ operation: 'create', inputMode: 'json', jsonBody: 'nonsense' }),
			).rejects.toThrow();
		});
	});
});

// --- Localization Update ----------------------------------------------------

describe('attachLocalizationUpdateBody', () => {
	function run(params: Record<string, unknown>) {
		const ctx = makeCtx(params);
		return attachLocalizationUpdateBody.call(ctx, {
			method: 'PATCH',
			url: '/v1/appStoreVersionLocalizations/l-1',
		} as IHttpRequestOptions);
	}

	it("builds a body with only the metadata fields the user set (What's New)", async () => {
		const result = await run({
			operation: 'updateLocalization',
			inputMode: 'fields',
			appStoreVersionLocalizationId: 'l-1',
			updateFields: { whatsNew: 'Bug fixes and improvements', description: '' },
		});

		expect(result.body).toEqual({
			data: {
				type: APP_STORE_VERSION_LOCALIZATION_RESOURCE_TYPE,
				id: 'l-1',
				attributes: { whatsNew: 'Bug fixes and improvements' },
			},
		});
	});

	it('supports the full metadata set', async () => {
		const result = await run({
			operation: 'updateLocalization',
			inputMode: 'fields',
			appStoreVersionLocalizationId: 'l-2',
			updateFields: {
				whatsNew: 'New',
				description: 'Desc',
				keywords: 'a,b',
				promotionalText: 'Promo',
				marketingUrl: 'https://m.example.com',
				supportUrl: 'https://s.example.com',
			},
		});

		expect((result.body as any).data.attributes).toEqual({
			whatsNew: 'New',
			description: 'Desc',
			keywords: 'a,b',
			promotionalText: 'Promo',
			marketingUrl: 'https://m.example.com',
			supportUrl: 'https://s.example.com',
		});
	});

	it('passes raw JSON straight through in json mode', async () => {
		const result = await run({
			operation: 'updateLocalization',
			inputMode: 'json',
			jsonBody:
				'{"type":"appStoreVersionLocalizations","id":"l-raw","attributes":{"whatsNew":"raw"}}',
		});

		expect(result.body).toEqual({
			data: {
				type: 'appStoreVersionLocalizations',
				id: 'l-raw',
				attributes: { whatsNew: 'raw' },
			},
		});
	});
});

// --- Submit for Review ------------------------------------------------------

describe('attachReviewSubmissionBody', () => {
	it('builds a reviewSubmissions body with platform + app relationship', async () => {
		const ctx = makeCtx({
			operation: 'submitForReview',
			inputMode: 'fields',
			platform: 'IOS',
			targetApp: 'app-7',
		});

		const result = await attachReviewSubmissionBody.call(ctx, {
			method: 'POST',
			url: '/v1/reviewSubmissions',
		} as IHttpRequestOptions);

		expect(result.body).toEqual({
			data: {
				type: REVIEW_SUBMISSION_RESOURCE_TYPE,
				attributes: { platform: 'IOS' },
				relationships: {
					app: { data: { type: 'apps', id: 'app-7' } },
				},
			},
		});
	});
});

describe('attachSubmissionItemBody', () => {
	it('builds a reviewSubmissionItems body linking the submission and version', async () => {
		const ctx = makeCtx({
			operation: 'addSubmissionItem',
			inputMode: 'fields',
			reviewSubmissionId: 'rs-1',
			appStoreVersionId: 'v-1',
		});

		const result = await attachSubmissionItemBody.call(ctx, {
			method: 'POST',
			url: '/v1/reviewSubmissionItems',
		} as IHttpRequestOptions);

		expect(result.body).toEqual({
			data: {
				type: REVIEW_SUBMISSION_ITEM_RESOURCE_TYPE,
				relationships: {
					reviewSubmission: {
						data: { type: REVIEW_SUBMISSION_RESOURCE_TYPE, id: 'rs-1' },
					},
					appStoreVersion: {
						data: { type: APP_STORE_VERSION_RESOURCE_TYPE, id: 'v-1' },
					},
				},
			},
		});
	});
});

// --- Release ----------------------------------------------------------------

describe('attachReleaseRequestBody', () => {
	it('builds an appStoreVersionReleaseRequests body pointing at the version', async () => {
		const ctx = makeCtx({
			operation: 'release',
			inputMode: 'fields',
			appStoreVersionId: 'v-42',
		});

		const result = await attachReleaseRequestBody.call(ctx, {
			method: 'POST',
			url: '/v1/appStoreVersionReleaseRequests',
		} as IHttpRequestOptions);

		expect(result.body).toEqual({
			data: {
				type: APP_STORE_VERSION_RELEASE_REQUEST_RESOURCE_TYPE,
				relationships: {
					appStoreVersion: {
						data: { type: APP_STORE_VERSION_RESOURCE_TYPE, id: 'v-42' },
					},
				},
			},
		});
	});
});

// --- Phased Release ---------------------------------------------------------

describe('attachPhasedReleaseBody', () => {
	it('create: builds a body with the version relationship and no attributes by default', async () => {
		const ctx = makeCtx({
			operation: 'createPhasedRelease',
			inputMode: 'fields',
			appStoreVersionId: 'v-1',
			phasedReleaseState: '',
		});

		const result = await attachPhasedReleaseBody.call(ctx, {
			method: 'POST',
			url: '/v1/appStoreVersionPhasedReleases',
		} as IHttpRequestOptions);

		expect(result.body).toEqual({
			data: {
				type: APP_STORE_VERSION_PHASED_RELEASE_RESOURCE_TYPE,
				relationships: {
					appStoreVersion: {
						data: { type: APP_STORE_VERSION_RESOURCE_TYPE, id: 'v-1' },
					},
				},
			},
		});
	});

	it('create: includes phasedReleaseState when the user set one', async () => {
		const ctx = makeCtx({
			operation: 'createPhasedRelease',
			inputMode: 'fields',
			appStoreVersionId: 'v-1',
			phasedReleaseState: 'ACTIVE',
		});

		const result = await attachPhasedReleaseBody.call(ctx, {
			method: 'POST',
			url: '/v1/appStoreVersionPhasedReleases',
		} as IHttpRequestOptions);

		expect((result.body as any).data.attributes).toEqual({ phasedReleaseState: 'ACTIVE' });
	});

	it('update: PATCHes phasedReleaseState onto the phased-release id', async () => {
		const ctx = makeCtx({
			operation: 'updatePhasedRelease',
			inputMode: 'fields',
			phasedReleaseId: 'pr-1',
			phasedReleaseState: 'COMPLETE',
		});

		const result = await attachPhasedReleaseBody.call(ctx, {
			method: 'PATCH',
			url: '/v1/appStoreVersionPhasedReleases/pr-1',
		} as IHttpRequestOptions);

		expect(result.body).toEqual({
			data: {
				type: APP_STORE_VERSION_PHASED_RELEASE_RESOURCE_TYPE,
				id: 'pr-1',
				attributes: { phasedReleaseState: 'COMPLETE' },
			},
		});
	});
});

// --- Get Many filters -------------------------------------------------------

describe('attachAppStoreVersionFilters (Get Many)', () => {
	it('folds the curated typed filters (versionString + platform + appStoreState) into filter[...]', async () => {
		const ctx = makeCtx({
			filterVersionString: '1.2.0',
			filterPlatform: 'IOS',
			filterAppStoreState: 'READY_FOR_SALE',
		});

		const result = await attachAppStoreVersionFilters.call(ctx, {
			method: 'GET',
			url: '/v1/apps/app-1/appStoreVersions',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[versionString]': '1.2.0',
			'filter[platform]': 'IOS',
			'filter[appStoreState]': 'READY_FOR_SALE',
		});
	});

	it('omits unset filters and preserves any existing qs', async () => {
		const ctx = makeCtx({
			filterVersionString: '',
			filterPlatform: '',
			filterAppStoreState: '',
		});

		const result = await attachAppStoreVersionFilters.call(ctx, {
			method: 'GET',
			url: '/v1/apps/app-1/appStoreVersions',
			qs: { limit: 200 },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ limit: 200 });
	});
});

// --- Declarative operation wiring ------------------------------------------

describe('appStoreVersion operation wiring', () => {
	it('Get Many is an app-scoped cursor-paginated read with filter + query hooks (no sort — spec has none)', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe(
			'=/v1/apps/{{$parameter["targetApp"]}}/appStoreVersions',
		);
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([attachAppStoreVersionFilters, attachQueryOptions]);
	});

	it('Get is a single request by version id', () => {
		const routing = op('get').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/appStoreVersions/{{$parameter["appStoreVersionId"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
	});

	it('Create POSTs to the versions collection via the body builder', () => {
		const routing = op('create').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/appStoreVersions');
		expect(routing.send.preSend).toContain(attachVersionBody);
	});

	it('Update PATCHes by version id via the body builder', () => {
		const routing = op('update').routing;
		expect(routing.request.method).toBe('PATCH');
		expect(routing.request.url).toBe('=/v1/appStoreVersions/{{$parameter["appStoreVersionId"]}}');
		expect(routing.send.preSend).toContain(attachVersionBody);
	});

	it('Get Many Localizations is a cursor-paginated version-scoped read', () => {
		const routing = op('getManyLocalizations').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe(
			'=/v1/appStoreVersions/{{$parameter["appStoreVersionId"]}}/appStoreVersionLocalizations',
		);
		expect(routing.operations.pagination).toBe(ascCursorPagination);
	});

	it('Update Localization PATCHes the localization by id', () => {
		const routing = op('updateLocalization').routing;
		expect(routing.request.method).toBe('PATCH');
		expect(routing.request.url).toBe(
			'=/v1/appStoreVersionLocalizations/{{$parameter["appStoreVersionLocalizationId"]}}',
		);
		expect(routing.send.preSend).toContain(attachLocalizationUpdateBody);
	});

	it('Submit for Review POSTs to reviewSubmissions', () => {
		const routing = op('submitForReview').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/reviewSubmissions');
		expect(routing.send.preSend).toContain(attachReviewSubmissionBody);
	});

	it('Add Submission Item POSTs to reviewSubmissionItems', () => {
		const routing = op('addSubmissionItem').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/reviewSubmissionItems');
		expect(routing.send.preSend).toContain(attachSubmissionItemBody);
	});

	it('Release POSTs to appStoreVersionReleaseRequests', () => {
		const routing = op('release').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/appStoreVersionReleaseRequests');
		expect(routing.send.preSend).toContain(attachReleaseRequestBody);
	});

	it('Create Phased Release POSTs to appStoreVersionPhasedReleases', () => {
		const routing = op('createPhasedRelease').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/appStoreVersionPhasedReleases');
		expect(routing.send.preSend).toContain(attachPhasedReleaseBody);
	});

	it('Update Phased Release PATCHes by phased-release id', () => {
		const routing = op('updatePhasedRelease').routing;
		expect(routing.request.method).toBe('PATCH');
		expect(routing.request.url).toBe(
			'=/v1/appStoreVersionPhasedReleases/{{$parameter["phasedReleaseId"]}}',
		);
		expect(routing.send.preSend).toContain(attachPhasedReleaseBody);
	});
});

/**
 * Drive the shared cursor-pagination hook exactly as Get Many wires it up
 * (the app-scoped versions URL), with a mocked `makeRoutingRequest` returning
 * ASC JSON:API list bodies, to prove Get Many follows `links.next`, truncates
 * under a Limit, and maps a failing ASC response to a NodeApiError.
 */
describe('appStoreVersion Get Many pagination + error mapping', () => {
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
			options: { url: '/v1/apps/app-1/appStoreVersions', qs: {} },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

	function ids(result: INodeExecutionData[]): string[] {
		return result.map((item) => (item.json as { id: string }).id);
	}

	it('follows links.next across pages for Return All', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[
				page(['v1', 'v2'], 'https://api.appstoreconnect.apple.com/v1/apps/app-1/appStoreVersions?cursor=2'),
				page(['v3'], null),
			],
			{ returnAll: true },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['v1', 'v2', 'v3']);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
	});

	it('truncates to the Limit and fetches no further pages', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[
				page(
					['v1', 'v2', 'v3'],
					'https://api.appstoreconnect.apple.com/v1/apps/app-1/appStoreVersions?cursor=2',
				),
			],
			{ returnAll: false, limit: 2 },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['v1', 'v2']);
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
									detail: "The attribute 'versionString' is not valid",
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

describe('appStoreVersion constants', () => {
	it('uses the doc-derived JSON:API resource types', () => {
		expect(APP_STORE_VERSION_RESOURCE_TYPE).toBe('appStoreVersions');
		expect(APP_STORE_VERSION_LOCALIZATION_RESOURCE_TYPE).toBe('appStoreVersionLocalizations');
		expect(REVIEW_SUBMISSION_RESOURCE_TYPE).toBe('reviewSubmissions');
		expect(REVIEW_SUBMISSION_ITEM_RESOURCE_TYPE).toBe('reviewSubmissionItems');
		expect(APP_STORE_VERSION_RELEASE_REQUEST_RESOURCE_TYPE).toBe('appStoreVersionReleaseRequests');
		expect(APP_STORE_VERSION_PHASED_RELEASE_RESOURCE_TYPE).toBe('appStoreVersionPhasedReleases');
	});

	it('exposes the doc-derived enum sets', () => {
		expect(APP_STORE_PLATFORMS).toEqual(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']);
		expect(APP_STORE_VERSION_RELEASE_TYPES).toEqual(['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED']);
		expect(APP_STORE_VERSION_PHASED_RELEASE_STATES).toEqual([
			'INACTIVE',
			'ACTIVE',
			'PAUSED',
			'COMPLETE',
		]);
	});

	it('exposes the doc-derived App Store state enum for the Get Many filter', () => {
		expect(APP_STORE_STATES).toContain('READY_FOR_SALE');
		expect(APP_STORE_STATES).toContain('IN_REVIEW');
		expect(APP_STORE_STATES).toContain('PREPARE_FOR_SUBMISSION');
	});
});

// Touch the exported operations array so an accidental empty export is caught.
describe('appStoreVersion fields', () => {
	it('exports operation properties', () => {
		const props: INodeProperties[] = appStoreVersionOperations;
		expect(props[0].name).toBe('operation');
	});
});
