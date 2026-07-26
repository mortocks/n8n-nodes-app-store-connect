import type {
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INode,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';

import type { DeclarativeRestApiSettings, IExecutePaginationFunctions } from 'n8n-workflow';

import { attachSort } from '../_shared/listFilters';
import { attachQueryOptions } from '../_shared/queryOptions';
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import {
	attachCustomerReviewFilters,
	attachCustomerReviewResponseBody,
} from './customerReview.body';
import {
	CUSTOMER_REVIEW_RESOURCE_TYPE,
	CUSTOMER_REVIEW_RESPONSE_RESOURCE_TYPE,
} from './customerReview.constants';
import { customerReviewOperations } from './customerReview.resource';

/**
 * Tests for the Customer Reviews resource: the review-response body builder
 * (typed create/update AND raw-JSON passthrough) and the declarative operation
 * wiring (URLs, app scoping, and which shared transport hook — cursor paging vs
 * single request — each operation routes through).
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

function build(params: Record<string, unknown>) {
	const ctx = makeCtx(params);
	const requestOptions = { method: 'POST', url: '/v1/customerReviewResponses' } as IHttpRequestOptions;
	return attachCustomerReviewResponseBody.call(ctx, requestOptions);
}

/** Pull the operation option objects out of the declarative `Operation` field. */
const operationOptions = customerReviewOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

describe('attachCustomerReviewFilters (Get Many)', () => {
	it('folds the curated typed filters (rating + territory) into filter[...]', async () => {
		const ctx = makeCtx({ filterRating: '5', filterTerritory: 'USA' });

		const result = await attachCustomerReviewFilters.call(ctx, {
			method: 'GET',
			url: '/v1/apps/app-1/customerReviews',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[rating]': '5',
			'filter[territory]': 'USA',
		});
	});

	it('omits unset filters and preserves any existing qs', async () => {
		const ctx = makeCtx({ filterRating: '', filterTerritory: '' });

		const result = await attachCustomerReviewFilters.call(ctx, {
			method: 'GET',
			url: '/v1/apps/app-1/customerReviews',
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
			url: '/v1/apps/app-1/customerReviews',
			qs: { 'filter[rating]': '5' },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[rating]': '5', sort: '-createdDate' });
	});

	it('sends nothing when left on the default (unsorted)', async () => {
		const ctx = makeCtx({ sort: '' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/apps/app-1/customerReviews',
		} as IHttpRequestOptions);

		expect(result.qs).toBeUndefined();
	});
});

describe('attachCustomerReviewResponseBody', () => {
	describe('fields mode', () => {
		it('builds a Create Response body with a review relationship', async () => {
			const result = await build({
				operation: 'createResponse',
				inputMode: 'fields',
				responseBody: 'Thanks for the feedback!',
				reviewId: 'rev-123',
			});

			expect(result.body).toEqual({
				data: {
					type: CUSTOMER_REVIEW_RESPONSE_RESOURCE_TYPE,
					attributes: { responseBody: 'Thanks for the feedback!' },
					relationships: {
						review: { data: { type: CUSTOMER_REVIEW_RESOURCE_TYPE, id: 'rev-123' } },
					},
				},
			});
		});

		it('builds an Update Response body keyed by the response id, no relationship', async () => {
			const result = await build({
				operation: 'updateResponse',
				inputMode: 'fields',
				responseBody: 'Edited reply',
				responseId: 'resp-9',
			});

			expect(result.body).toEqual({
				data: {
					type: CUSTOMER_REVIEW_RESPONSE_RESOURCE_TYPE,
					id: 'resp-9',
					attributes: { responseBody: 'Edited reply' },
				},
			});
		});
	});

	describe('json mode', () => {
		it('passes the raw JSON:API data object straight through', async () => {
			const result = await build({
				operation: 'createResponse',
				inputMode: 'json',
				jsonBody:
					'{"type":"customerReviewResponses","attributes":{"responseBody":"raw"},"relationships":{"review":{"data":{"type":"customerReviews","id":"rev-x"}}}}',
			});

			expect(result.body).toEqual({
				data: {
					type: 'customerReviewResponses',
					attributes: { responseBody: 'raw' },
					relationships: { review: { data: { type: 'customerReviews', id: 'rev-x' } } },
				},
			});
		});

		it('rejects invalid JSON before building a request', async () => {
			await expect(
				build({ operation: 'createResponse', inputMode: 'json', jsonBody: 'nonsense' }),
			).rejects.toThrow();
		});
	});
});

describe('customerReview operation wiring', () => {
	it('Get Many is app-scoped and cursor-paginated, with query options', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/apps/{{$parameter["targetApp"]}}/customerReviews');
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([
			attachCustomerReviewFilters,
			attachSort,
			attachQueryOptions,
		]);
	});

	it('Get is a single request by review id, with query options', () => {
		const routing = op('get').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/customerReviews/{{$parameter["reviewId"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachQueryOptions);
	});

	it('Get Response reads the review response sub-resource', () => {
		const routing = op('getResponse').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('=/v1/customerReviews/{{$parameter["reviewId"]}}/response');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
	});

	it('Create Response POSTs via the response body builder', () => {
		const routing = op('createResponse').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/customerReviewResponses');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachCustomerReviewResponseBody);
	});

	it('Update Response PATCHes by response id via the body builder', () => {
		const routing = op('updateResponse').routing;
		expect(routing.request.method).toBe('PATCH');
		expect(routing.request.url).toBe('=/v1/customerReviewResponses/{{$parameter["responseId"]}}');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachCustomerReviewResponseBody);
	});

	it('Delete Response DELETEs by response id and confirms with { deleted: true }', async () => {
		const routing = op('deleteResponse').routing;
		expect(routing.request.method).toBe('DELETE');
		expect(routing.request.url).toBe('=/v1/customerReviewResponses/{{$parameter["responseId"]}}');
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
			options: { method: 'DELETE', url: '/v1/customerReviewResponses/resp-9' },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

		expect(result).toEqual([{ json: { deleted: true } }]);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
	});
});

describe('customerReview constants', () => {
	it('uses the doc-derived JSON:API resource types', () => {
		expect(CUSTOMER_REVIEW_RESOURCE_TYPE).toBe('customerReviews');
		expect(CUSTOMER_REVIEW_RESPONSE_RESOURCE_TYPE).toBe('customerReviewResponses');
	});
});

// Touch the exported fields array so an accidental empty export is caught.
describe('customerReview fields', () => {
	it('exports operation properties', () => {
		const props: INodeProperties[] = customerReviewOperations;
		expect(props[0].name).toBe('operation');
	});
});
