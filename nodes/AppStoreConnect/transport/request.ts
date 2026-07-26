import type {
	DeclarativeRestApiSettings,
	IDataObject,
	IExecutePaginationFunctions,
	INodeExecutionData,
} from 'n8n-workflow';

import { simplifyJsonApi } from '../resources/_shared/simplify';
import { withAscErrorMapping } from './errors';

/**
 * Declarative routing hook for single, non-list ASC requests — Create, Get,
 * Update, Delete. Plugged in via the same `operations.pagination` extension
 * point `ascCursorPagination` (`pagination.ts`) uses for list endpoints, but
 * issues exactly one request via `makeRoutingRequest` instead of following a
 * cursor. Sharing the extension point (rather than relying on n8n's default,
 * uninstrumented request path) means every webhook operation — list and
 * single alike — maps ASC's JSON:API `errors[]` through module D identically,
 * and honours Continue On Fail identically, via the shared
 * `withAscErrorMapping` wrapper.
 *
 * Read operations that mount the shared **Simplify** field (`_shared/simplify.ts`)
 * get their JSON:API envelope flattened here when the toggle is on. Operations
 * that don't mount the field read a `false` fallback, so writes are unaffected.
 */
export async function ascSingleRequest(
	this: IExecutePaginationFunctions,
	requestOptions: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	return withAscErrorMapping(this, async () => {
		const items = await this.makeRoutingRequest(requestOptions);
		const simplify = this.getNodeParameter('simplify', false) as boolean;
		if (!simplify) {
			return items;
		}
		return items.map((item) => ({ json: simplifyJsonApi(item.json as IDataObject) }));
	});
}

/**
 * Build a routing hook for operations whose success response carries no useful
 * body — Delete (ASC replies `204 No Content`) and relationship writes (add /
 * remove a to-many linkage, also `204`). Instead of passing n8n's empty item
 * through, these emit a single explicit confirmation object so a downstream
 * workflow has something truthy to branch on.
 *
 * Returns a `operations.pagination` function (the same extension point
 * `ascSingleRequest` plugs into), used as e.g.
 * `pagination: ascConfirmationRequest('deleted')` on a Delete op, or
 * `'added'` / `'removed'` on relationship writes. The request still runs through
 * `withAscErrorMapping`, so a failed ASC response maps to a NodeApiError exactly
 * as elsewhere.
 *
 * @param confirmationKey the boolean key to emit, e.g. `'deleted'` → `{ deleted: true }`.
 */
export function ascConfirmationRequest(
	confirmationKey: string,
): (
	this: IExecutePaginationFunctions,
	requestOptions: DeclarativeRestApiSettings.ResultOptions,
) => Promise<INodeExecutionData[]> {
	return async function ascConfirmationRequestHook(
		this: IExecutePaginationFunctions,
		requestOptions: DeclarativeRestApiSettings.ResultOptions,
	): Promise<INodeExecutionData[]> {
		return withAscErrorMapping(this, async () => {
			// Run the request for its side effect + error surface; the 204/empty
			// body is intentionally discarded in favour of the confirmation object.
			await this.makeRoutingRequest(requestOptions);
			return [{ json: { [confirmationKey]: true } }];
		});
	};
}
