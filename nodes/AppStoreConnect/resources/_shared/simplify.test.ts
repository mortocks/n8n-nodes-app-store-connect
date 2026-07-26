import type { IDataObject } from 'n8n-workflow';

import { SIMPLIFY_PARAMETER, simplifyField, simplifyJsonApi } from './simplify';

/**
 * Tests for the shared Simplify plumbing: the pure JSON:API flattener
 * (`simplifyJsonApi`) across the shapes the transport hooks hand it, and the
 * boolean UI field builder (`simplifyField`).
 */

describe('simplifyJsonApi', () => {
	it('flattens a single-resource envelope, dropping links/meta', () => {
		const envelope: IDataObject = {
			data: {
				id: 'wh-1',
				type: 'webhooks',
				attributes: { enabled: true, url: 'https://example.com' },
			},
			links: { self: 'https://api.appstoreconnect.apple.com/v1/webhooks/wh-1' },
			meta: { paging: {} },
		};

		expect(simplifyJsonApi(envelope)).toEqual({
			id: 'wh-1',
			type: 'webhooks',
			enabled: true,
			url: 'https://example.com',
		});
	});

	it('flattens a bare data element (already-unwrapped Get Many item)', () => {
		const element: IDataObject = {
			id: 'rev-9',
			type: 'customerReviews',
			attributes: { rating: 5, title: 'Great' },
		};

		expect(simplifyJsonApi(element)).toEqual({
			id: 'rev-9',
			type: 'customerReviews',
			rating: 5,
			title: 'Great',
		});
	});

	it('handles a missing attributes object gracefully', () => {
		const element: IDataObject = { id: 'x', type: 'things' };

		expect(simplifyJsonApi(element)).toEqual({ id: 'x', type: 'things' });
	});

	it('preserves relationships when present', () => {
		const element: IDataObject = {
			id: 'resp-1',
			type: 'customerReviewResponses',
			attributes: { responseBody: 'Thanks' },
			relationships: {
				review: { data: { type: 'customerReviews', id: 'rev-9' } },
			},
		};

		expect(simplifyJsonApi(element)).toEqual({
			id: 'resp-1',
			type: 'customerReviewResponses',
			responseBody: 'Thanks',
			relationships: { review: { data: { type: 'customerReviews', id: 'rev-9' } } },
		});
	});

	it('treats a non-object `data` as "payload is the element" (no envelope)', () => {
		// `data` is a string, so it is not a single-resource envelope; the payload
		// itself is the element, which here carries no id/type/attributes → empty.
		const payload = { data: 'not-an-object' } as unknown as IDataObject;
		expect(simplifyJsonApi(payload)).toEqual({});
	});

	it('returns the input unchanged when the whole payload is not an object', () => {
		const primitive = 'just-a-string' as unknown as IDataObject;
		expect(simplifyJsonApi(primitive)).toBe(primitive);
	});
});

describe('simplifyField', () => {
	it('builds an on-by-default boolean scoped by the passed displayOptions', () => {
		const displayOptions = {
			show: { resource: ['customerReview'], operation: ['get'] },
		};

		const field = simplifyField(displayOptions);

		expect(field.name).toBe(SIMPLIFY_PARAMETER);
		expect(field.type).toBe('boolean');
		expect(field.default).toBe(true);
		expect(field.description).toBe(
			'Whether to return a simplified version of the response instead of the raw data',
		);
		expect(field.displayOptions).toBe(displayOptions);
	});
});
