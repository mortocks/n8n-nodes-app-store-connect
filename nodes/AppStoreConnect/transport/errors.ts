import { NodeApiError, type INode, type JsonObject } from 'n8n-workflow';

import { formatAscErrorMessage } from '../../../utils/ascErrorMapper';

/**
 * Shared framework glue for surfacing ASC's JSON:API `errors[]` (module D)
 * through every routing hook that talks to ASC directly — the list-pagination
 * hook (`pagination.ts`) and the single-request hook (`request.ts`) alike.
 *
 * Not unit-tested itself (it is pure wiring around n8n's thrown-error shape),
 * but keeping it in one place means both hooks map errors identically and a
 * later fix to the thrown-error assumption (see the Task 01 ledger note on
 * `error.cause.response.data`) only needs to change here.
 */
export async function withAscErrorMapping<T>(
	context: { getNode(): INode },
	fn: () => Promise<T>,
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		const responseBody = (error as { cause?: { response?: { data?: unknown } } }).cause?.response
			?.data;
		const readable = formatAscErrorMessage(responseBody);
		if (readable) {
			throw new NodeApiError(context.getNode(), error as JsonObject, { message: readable });
		}
		throw error;
	}
}
