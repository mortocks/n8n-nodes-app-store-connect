import {
	formatAscErrorMessage,
	isAscErrorPayload,
	type AscErrorPayload,
} from './ascErrorMapper';

describe('isAscErrorPayload', () => {
	it('accepts a body with a non-empty errors array', () => {
		expect(isAscErrorPayload({ errors: [{ title: 'x' }] })).toBe(true);
	});

	it('rejects non-error bodies', () => {
		expect(isAscErrorPayload({ data: [] })).toBe(false);
		expect(isAscErrorPayload({ errors: [] })).toBe(false);
		expect(isAscErrorPayload(null)).toBe(false);
		expect(isAscErrorPayload('nope')).toBe(false);
		expect(isAscErrorPayload(undefined)).toBe(false);
	});
});

describe('formatAscErrorMessage', () => {
	it('combines title and detail', () => {
		const payload: AscErrorPayload = {
			errors: [
				{
					status: '409',
					code: 'ENTITY_ERROR',
					title: 'The provided entity includes an attribute with a value that is not valid',
					detail: 'The URL must be reachable over HTTPS',
				},
			],
		};
		expect(formatAscErrorMessage(payload)).toBe(
			'The provided entity includes an attribute with a value that is not valid: The URL must be reachable over HTTPS',
		);
	});

	it('appends the source pointer when present', () => {
		const payload: AscErrorPayload = {
			errors: [
				{
					status: '422',
					title: 'Invalid attribute',
					detail: 'A URL is required',
					source: { pointer: '/data/attributes/url' },
				},
			],
		};
		expect(formatAscErrorMessage(payload)).toBe(
			'Invalid attribute: A URL is required (at /data/attributes/url)',
		);
	});

	it('uses the source parameter when there is no pointer', () => {
		const payload: AscErrorPayload = {
			errors: [
				{
					status: '400',
					title: 'PARAMETER_ERROR',
					detail: 'The limit is too large',
					source: { parameter: 'limit' },
				},
			],
		};
		expect(formatAscErrorMessage(payload)).toBe(
			'PARAMETER_ERROR: The limit is too large (at limit)',
		);
	});

	it('joins multiple errors with a semicolon', () => {
		const payload: AscErrorPayload = {
			errors: [
				{ title: 'First problem', detail: 'do this' },
				{ title: 'Second problem', detail: 'do that' },
			],
		};
		expect(formatAscErrorMessage(payload)).toBe(
			'First problem: do this; Second problem: do that',
		);
	});

	it('falls back to detail alone when there is no title', () => {
		expect(formatAscErrorMessage({ errors: [{ detail: 'Something went wrong' }] })).toBe(
			'Something went wrong',
		);
	});

	it('falls back to the code when there is no title or detail', () => {
		expect(formatAscErrorMessage({ errors: [{ code: 'NOT_AUTHORIZED' }] })).toBe(
			'NOT_AUTHORIZED',
		);
	});

	it('does not duplicate text when title and detail are identical', () => {
		expect(
			formatAscErrorMessage({ errors: [{ title: 'Same message', detail: 'Same message' }] }),
		).toBe('Same message');
	});

	it('returns undefined for a body that is not an ASC error payload', () => {
		expect(formatAscErrorMessage({ data: { id: '1' } })).toBeUndefined();
		expect(formatAscErrorMessage(undefined)).toBeUndefined();
	});
});
