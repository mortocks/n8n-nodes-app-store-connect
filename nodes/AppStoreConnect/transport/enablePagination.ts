import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/**
 * Make n8n actually invoke our shared `operations.pagination` request hooks.
 *
 * n8n's declarative routing engine only calls an operation's
 * `routing.operations.pagination` function when `routing.send.paginate` is also
 * truthy: in n8n-core's `routing-node`, the pagination branch is gated on
 * `requestData.paginate`, and that flag is populated *only* from
 * `routing.send.paginate`. Set the hook but not the switch and the engine
 * silently takes its default request path instead.
 *
 * Every operation in this node routes through one of the shared hooks
 * (`ascCursorPagination` for lists, `ascSingleRequest` for single reads/writes,
 * `ascConfirmationRequest` for 204-No-Content writes) — that is where JSON:API
 * error mapping, the Simplify flag, cursor paging, and no-content confirmations
 * all live. Without the switch those hooks never run: list reads return only the
 * first page (Return All / large Limit ignored), Simplify and ASC error mapping
 * are dead, and a 204 write emits an empty-string item (`[""]`) instead of the
 * `{ <key>: true }` confirmation.
 *
 * Rather than hand-set `send.paginate: true` on every operation across every
 * resource (and risk missing one — the bug is invisible until a 204 write runs),
 * this stamps it onto each operation option that declares an
 * `operations.pagination` hook. It is applied once as the node assembles each
 * resource's operations, and a conformance test asserts the hook/switch pairing
 * so a new operation can never silently re-introduce the dead-hook bug.
 *
 * Returns new option objects (shallow copies with a fresh `routing.send`) so the
 * resource modules' exported arrays are left untouched.
 */
export function enablePaginationRouting(operations: INodeProperties[]): INodeProperties[] {
	return operations.map((prop) => {
		if (prop.name !== 'operation' || !Array.isArray(prop.options)) {
			return prop;
		}
		const options = (prop.options as INodePropertyOptions[]).map((option) => {
			const routing = option.routing;
			if (!routing?.operations?.pagination) {
				return option;
			}
			return {
				...option,
				routing: {
					...routing,
					send: { ...(routing.send ?? {}), paginate: true },
				},
			};
		});
		return { ...prop, options };
	});
}
