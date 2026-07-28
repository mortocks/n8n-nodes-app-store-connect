import type { INodeProperties } from 'n8n-workflow';

import { ascConfirmationRequest, ascSingleRequest } from './request';
import { enablePaginationRouting } from './enablePagination';

/**
 * Tests for `enablePaginationRouting`: the transform that makes n8n actually
 * invoke our `operations.pagination` hooks by pairing each with
 * `send.paginate: true`. Without the switch the hook is dead code (list reads
 * return one page, Simplify/error-mapping never run, 204 writes emit `[""]`).
 */

/** A minimal operation property carrying one option with a pagination hook. */
function operationProp(overrides: Partial<Record<string, unknown>> = {}): INodeProperties {
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'get',
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a thing',
				routing: {
					request: { method: 'GET', url: '/v1/things/{{id}}' },
					send: { preSend: [] },
					operations: { pagination: ascSingleRequest },
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a thing',
				routing: {
					request: { method: 'DELETE', url: '/v1/things/{{id}}' },
					// No `send` block at all — the 204-confirmation case.
					operations: { pagination: ascConfirmationRequest('deleted') },
				},
			},
		],
		...overrides,
	} as INodeProperties;
}

describe('enablePaginationRouting', () => {
	it('sets send.paginate = true on every option that has a pagination hook', () => {
		const [prop] = enablePaginationRouting([operationProp()]);
		const options = prop.options as Array<{ routing?: { send?: { paginate?: unknown } } }>;

		expect(options[0].routing?.send?.paginate).toBe(true);
		expect(options[1].routing?.send?.paginate).toBe(true);
	});

	it('preserves an existing send block (e.g. preSend) while adding the switch', () => {
		const [prop] = enablePaginationRouting([operationProp()]);
		const get = (prop.options as Array<{ routing?: { send?: Record<string, unknown> } }>)[0];

		expect(get.routing?.send).toEqual({ preSend: [], paginate: true });
	});

	it('creates a send block for options that had none', () => {
		const [prop] = enablePaginationRouting([operationProp()]);
		const del = (prop.options as Array<{ routing?: { send?: Record<string, unknown> } }>)[1];

		expect(del.routing?.send).toEqual({ paginate: true });
	});

	it('does not mutate the input option objects (returns copies)', () => {
		const input = [operationProp()];
		const original = (input[0].options as Array<{ routing?: { send?: unknown } }>)[1];

		enablePaginationRouting(input);

		// The Delete option originally had no `send`; the transform must not have
		// added one to the source object.
		expect(original.routing?.send).toBeUndefined();
	});

	it('leaves non-operation properties and options without a hook untouched', () => {
		const plainField: INodeProperties = {
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
		};
		const noHook = operationProp({
			options: [{ name: 'Noop', value: 'noop', action: 'Noop', routing: { request: {} } }],
		});

		const result = enablePaginationRouting([plainField, noHook]);

		expect(result[0]).toBe(plainField); // untouched, same reference
		const opt = (result[1].options as Array<{ routing?: { send?: unknown } }>)[0];
		expect(opt.routing?.send).toBeUndefined();
	});
});
