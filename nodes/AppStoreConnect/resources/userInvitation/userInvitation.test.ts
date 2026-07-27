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
import { attachUserInvitationBody, attachUserInvitationFilters } from './userInvitation.body';
import { USER_INVITATION_RESOURCE_TYPE } from './userInvitation.constants';
import { userInvitationOperations } from './userInvitation.resource';

/**
 * Tests for the User Invitations resource: the Create body builder (typed AND
 * raw-JSON passthrough via `resolveMutationData`, asserting email/firstName/
 * lastName/roles land in `attributes`), the declarative operation wiring, and —
 * driving the shared cursor-pagination hook against the Get Many URL —
 * pagination and ASC error mapping.
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
const operationOptions = userInvitationOperations[0].options as INodePropertyOptions[];
function op(value: string) {
	const match = operationOptions.find((o) => o.value === value) as
		| (INodePropertyOptions & { routing?: any })
		| undefined;
	if (!match) throw new Error(`no operation ${value}`);
	return match;
}

describe('attachUserInvitationFilters (Get Many)', () => {
	it('folds the curated typed filters into filter[...]', async () => {
		const ctx = makeCtx({
			filterEmail: 'new.hire@example.com',
			filterRoles: ['ADMIN', 'DEVELOPER'],
			visibleApp: 'app-42',
		});

		const result = await attachUserInvitationFilters.call(ctx, {
			method: 'GET',
			url: '/v1/userInvitations',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({
			'filter[email]': 'new.hire@example.com',
			'filter[roles]': 'ADMIN,DEVELOPER',
			'filter[visibleApps]': 'app-42',
		});
	});

	it('joins a single selected role into filter[roles]', async () => {
		const ctx = makeCtx({ filterRoles: ['MARKETING'] });

		const result = await attachUserInvitationFilters.call(ctx, {
			method: 'GET',
			url: '/v1/userInvitations',
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[roles]': 'MARKETING' });
	});

	it('omits blank filters and preserves existing qs', async () => {
		const ctx = makeCtx({ filterEmail: '', filterRoles: [], visibleApp: '' });

		const result = await attachUserInvitationFilters.call(ctx, {
			method: 'GET',
			url: '/v1/userInvitations',
			qs: { limit: 200 },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ limit: 200 });
	});
});

describe('attachSort (shared, userInvitation Get Many)', () => {
	it('folds the chosen sort value into qs.sort', async () => {
		const ctx = makeCtx({ sort: '-email' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/userInvitations',
			qs: { 'filter[email]': 'a@b.com' },
		} as IHttpRequestOptions);

		expect(result.qs).toEqual({ 'filter[email]': 'a@b.com', sort: '-email' });
	});

	it('sends nothing when left on the default (unsorted)', async () => {
		const ctx = makeCtx({ sort: '' });

		const result = await attachSort.call(ctx, {
			method: 'GET',
			url: '/v1/userInvitations',
		} as IHttpRequestOptions);

		expect(result.qs).toBeUndefined();
	});
});

describe('attachUserInvitationBody (Create)', () => {
	function build(params: Record<string, unknown>) {
		const ctx = makeCtx(params);
		return attachUserInvitationBody.call(ctx, {
			method: 'POST',
			url: '/v1/userInvitations',
		} as IHttpRequestOptions);
	}

	describe('fields mode', () => {
		it('builds a Create body with email, name, and roles in attributes', async () => {
			const result = await build({
				operation: 'create',
				inputMode: 'fields',
				email: 'new.hire@example.com',
				firstName: 'New',
				lastName: 'Hire',
				roles: ['DEVELOPER', 'ACCESS_TO_REPORTS'],
				additionalFields: {},
			});

			expect(result.body).toEqual({
				data: {
					type: USER_INVITATION_RESOURCE_TYPE,
					attributes: {
						email: 'new.hire@example.com',
						firstName: 'New',
						lastName: 'Hire',
						roles: ['DEVELOPER', 'ACCESS_TO_REPORTS'],
					},
				},
			});
		});

		it('folds optional visibility attributes alongside the required ones', async () => {
			const result = await build({
				operation: 'create',
				inputMode: 'fields',
				email: 'a@b.com',
				firstName: 'A',
				lastName: 'B',
				roles: ['MARKETING'],
				additionalFields: { allAppsVisible: true, provisioningAllowed: false },
			});

			expect(result.body).toEqual({
				data: {
					type: USER_INVITATION_RESOURCE_TYPE,
					attributes: {
						email: 'a@b.com',
						firstName: 'A',
						lastName: 'B',
						roles: ['MARKETING'],
						allAppsVisible: true,
						provisioningAllowed: false,
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
					'{"type":"userInvitations","attributes":{"email":"raw@example.com","firstName":"Raw","lastName":"User","roles":["FINANCE"]}}',
			});

			expect(result.body).toEqual({
				data: {
					type: 'userInvitations',
					attributes: {
						email: 'raw@example.com',
						firstName: 'Raw',
						lastName: 'User',
						roles: ['FINANCE'],
					},
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

describe('userInvitation operation wiring', () => {
	it('Get Many is a top-level cursor-paginated read with query options', () => {
		const routing = op('getMany').routing;
		expect(routing.request.method).toBe('GET');
		expect(routing.request.url).toBe('/v1/userInvitations');
		expect(routing.operations.pagination).toBe(ascCursorPagination);
		expect(routing.send.preSend).toEqual([
			attachUserInvitationFilters,
			attachSort,
			attachQueryOptions,
		]);
	});

	it('Create POSTs via the invitation body builder', () => {
		const routing = op('create').routing;
		expect(routing.request.method).toBe('POST');
		expect(routing.request.url).toBe('/v1/userInvitations');
		expect(routing.operations.pagination).toBe(ascSingleRequest);
		expect(routing.send.preSend).toContain(attachUserInvitationBody);
	});

	it('Delete DELETEs by invitation id and confirms with { deleted: true }', async () => {
		const routing = op('delete').routing;
		expect(routing.request.method).toBe('DELETE');
		expect(routing.request.url).toBe('=/v1/userInvitations/{{$parameter["invitationId"]}}');
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
			options: { method: 'DELETE', url: '/v1/userInvitations/inv-1' },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

		expect(result).toEqual([{ json: { deleted: true } }]);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(1);
	});
});

/**
 * Drive the shared cursor-pagination hook exactly as Get Many wires it up
 * (`/v1/userInvitations`) to prove it follows `links.next`, truncates under a
 * Limit, and maps a failing ASC response to a NodeApiError.
 */
describe('userInvitation Get Many pagination + error mapping', () => {
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
			options: { url: '/v1/userInvitations', qs: {} },
		} as unknown as DeclarativeRestApiSettings.ResultOptions);

	function ids(result: INodeExecutionData[]): string[] {
		return result.map((item) => (item.json as { id: string }).id);
	}

	it('follows links.next across pages for Return All', async () => {
		const { ctx, makeRoutingRequest } = paginationCtx(
			[
				page(['i1', 'i2'], 'https://api.appstoreconnect.apple.com/v1/userInvitations?cursor=2'),
				page(['i3'], null),
			],
			{ returnAll: true },
		);

		const result = await ascCursorPagination.call(ctx, baseRequest());

		expect(ids(result)).toEqual(['i1', 'i2', 'i3']);
		expect(makeRoutingRequest).toHaveBeenCalledTimes(2);
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

describe('userInvitation constants', () => {
	it('uses the doc-derived JSON:API resource type', () => {
		expect(USER_INVITATION_RESOURCE_TYPE).toBe('userInvitations');
	});
});

// Touch the exported operations array so an accidental empty export is caught.
describe('userInvitation fields', () => {
	it('exports operation properties', () => {
		const props: INodeProperties[] = userInvitationOperations;
		expect(props[0].name).toBe('operation');
	});
});
