import { NodeApiError, type INode } from 'n8n-workflow';

import { withAscErrorMapping } from './errors';

/**
 * Tests for the shared ASC error-mapping wrapper. These mock the *shape of a
 * failed App Store Connect response* — an error carrying
 * `cause.response.data = { errors: [...] }` — and assert the wrapper turns it
 * into a readable `NodeApiError`, while leaving non-ASC failures untouched.
 */

const FAKE_NODE = {
	id: 'test-node',
	name: 'App Store Connect',
	type: 'n8n-nodes-apple-appstore.appStoreConnect',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

const ctx = { getNode: () => FAKE_NODE };

/** Build the error object n8n's HTTP layer throws for a failed ASC request. */
function ascFailure(data: unknown): Error {
	const error = new Error('Request failed with status code 409');
	(error as unknown as { cause: unknown }).cause = { response: { data } };
	return error;
}

describe('withAscErrorMapping', () => {
	it('returns the resolved value on success without touching it', async () => {
		const result = await withAscErrorMapping(ctx, async () => [{ json: { id: 'wh-1' } }]);
		expect(result).toEqual([{ json: { id: 'wh-1' } }]);
	});

	it('maps an ASC JSON:API errors[] response to a NodeApiError with a readable message', async () => {
		const failure = ascFailure({
			errors: [
				{
					status: '409',
					code: 'ENTITY_ERROR.ATTRIBUTE.INVALID',
					title: 'The provided entity includes an attribute with an invalid value',
					detail: 'eventTypes is not a valid value',
					source: { pointer: '/data/attributes/eventTypes' },
				},
			],
		});

		await expect(
			withAscErrorMapping(ctx, async () => {
				throw failure;
			}),
		).rejects.toBeInstanceOf(NodeApiError);

		// The readable message (title: detail (at pointer)) is surfaced, not a bare status.
		await expect(
			withAscErrorMapping(ctx, async () => {
				throw failure;
			}),
		).rejects.toThrow(/eventTypes is not a valid value \(at \/data\/attributes\/eventTypes\)/);
	});

	it('joins multiple ASC errors into one message', async () => {
		const failure = ascFailure({
			errors: [
				{ title: 'First problem', detail: 'first detail' },
				{ title: 'Second problem', detail: 'second detail' },
			],
		});

		await expect(
			withAscErrorMapping(ctx, async () => {
				throw failure;
			}),
		).rejects.toThrow(/first detail; .*second detail/);
	});

	it('re-throws the original error unchanged when the body is not an ASC error payload', async () => {
		const plain = new Error('socket hang up');

		await expect(
			withAscErrorMapping(ctx, async () => {
				throw plain;
			}),
		).rejects.toBe(plain); // same instance — not wrapped in NodeApiError
	});

	it('re-throws when there is a cause but no recognisable errors[] array', async () => {
		const failure = ascFailure({ message: 'Bad Gateway' }); // no `errors` key

		await expect(
			withAscErrorMapping(ctx, async () => {
				throw failure;
			}),
		).rejects.toBe(failure);
	});
});
