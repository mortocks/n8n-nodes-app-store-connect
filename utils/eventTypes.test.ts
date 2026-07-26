import { KNOWN_EVENT_TYPES, mergeEventTypes } from './eventTypes';

describe('KNOWN_EVENT_TYPES', () => {
	it('lists the confirmed SCREAMING_SNAKE_CASE subscription identifiers', () => {
		expect(KNOWN_EVENT_TYPES.length).toBe(12);
		expect(KNOWN_EVENT_TYPES).toContain('BUILD_UPLOAD_STATE_UPDATED');
		expect(KNOWN_EVENT_TYPES).toContain('APP_STORE_VERSION_APP_VERSION_STATE_UPDATED');
		expect(KNOWN_EVENT_TYPES).toContain('ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED');
		// Subscription form is SCREAMING_SNAKE, not the delivery's camelCase.
		expect(KNOWN_EVENT_TYPES).not.toContain('buildUploadStateUpdated');
	});

	it('has no duplicate entries', () => {
		expect(new Set(KNOWN_EVENT_TYPES).size).toBe(KNOWN_EVENT_TYPES.length);
	});
});

describe('mergeEventTypes', () => {
	it('merges selected known types with new raw-override types', () => {
		expect(mergeEventTypes(['buildUploadStateUpdated'], 'assetPackStateUpdated')).toEqual([
			'buildUploadStateUpdated',
			'assetPackStateUpdated',
		]);
	});

	it('de-duplicates a raw-override entry that repeats a selected type', () => {
		expect(mergeEventTypes(['buildUploadStateUpdated'], 'buildUploadStateUpdated')).toEqual([
			'buildUploadStateUpdated',
		]);
	});

	it('de-duplicates repeats within the selected list itself', () => {
		expect(mergeEventTypes(['a', 'b', 'a'])).toEqual(['a', 'b']);
	});

	it('de-duplicates repeats within the raw override itself', () => {
		expect(mergeEventTypes([], 'x, x, y')).toEqual(['x', 'y']);
	});

	it('splits the raw override on commas', () => {
		expect(mergeEventTypes([], 'a,b,c')).toEqual(['a', 'b', 'c']);
	});

	it('splits the raw override on whitespace, including newlines and tabs', () => {
		expect(mergeEventTypes([], 'a b\tc\nd')).toEqual(['a', 'b', 'c', 'd']);
	});

	it('splits the raw override on mixed commas and whitespace, collapsing runs', () => {
		expect(mergeEventTypes([], 'a, b ,, c   d')).toEqual(['a', 'b', 'c', 'd']);
	});

	it('trims whitespace around raw-override entries', () => {
		expect(mergeEventTypes([], '  a  ,  b  ')).toEqual(['a', 'b']);
	});

	it('trims whitespace around selected entries', () => {
		expect(mergeEventTypes(['  a  ', 'b '])).toEqual(['a', 'b']);
	});

	it('drops empty/whitespace-only entries from the raw override', () => {
		expect(mergeEventTypes([], '  ,  ,   ')).toEqual([]);
	});

	it('drops empty-string entries from the selected list', () => {
		expect(mergeEventTypes(['', '  ', 'a'])).toEqual(['a']);
	});

	it('returns an empty array when both inputs are empty', () => {
		expect(mergeEventTypes([], '')).toEqual([]);
	});

	it('handles undefined selected and undefined rawOverride', () => {
		expect(mergeEventTypes(undefined, undefined)).toEqual([]);
	});

	it('handles null selected and null rawOverride', () => {
		expect(mergeEventTypes(null, null)).toEqual([]);
	});

	it('handles a missing rawOverride argument entirely', () => {
		expect(mergeEventTypes(['a'])).toEqual(['a']);
	});

	it('preserves selected order and appends new raw types in encounter order', () => {
		expect(mergeEventTypes(['b', 'a'], 'd, c, a')).toEqual(['b', 'a', 'd', 'c']);
	});

	it('is case-sensitive (does not fold case when de-duplicating)', () => {
		expect(mergeEventTypes(['buildUploadStateUpdated'], 'BuildUploadStateUpdated')).toEqual([
			'buildUploadStateUpdated',
			'BuildUploadStateUpdated',
		]);
	});
});
