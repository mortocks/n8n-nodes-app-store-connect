import type { IDataObject, IDisplayOptions, INodeProperties } from 'n8n-workflow';

/**
 * Shared "Simplify" plumbing for read operations.
 *
 * App Store Connect speaks JSON:API: every read wraps the useful payload in an
 * envelope — a single-resource read returns `{ data: { id, type, attributes,
 * relationships }, links, meta }`, and a Get Many item is one `data` element of
 * that same shape. That envelope is faithful but awkward to consume downstream
 * (users reach for `.data.attributes.foo` on every field). The n8n UX guidelines
 * ask read operations to offer a **Simplify** toggle that flattens the response
 * to the fields people actually want.
 *
 * Two pieces make it repeatable across resources:
 *   - **`simplifyField`** builds the standard boolean "Simplify" UI field,
 *     scoped by the caller's `displayOptions` (resource + read operations).
 *   - **`simplifyJsonApi`** is the pure transform the transport hooks apply when
 *     the toggle is on — `ascSingleRequest` (`transport/request.ts`) per returned
 *     item, and `ascCursorPagination` (`transport/pagination.ts`) per list element.
 *
 * Keeping the transform pure (no n8n context) means it is unit-tested in
 * isolation, and both transport hooks flatten identically.
 */

/** The node-parameter name the Simplify toggle lives under. */
export const SIMPLIFY_PARAMETER = 'simplify';

/**
 * Build the standard "Simplify" boolean field for a read operation.
 *
 * Defaults to **on** (the flattened shape is what most users want); the raw
 * JSON:API envelope stays one toggle away for callers who need `links`/`meta`
 * or the exact wire shape.
 *
 * @param displayOptions scope it to the resource's read operations (as every
 *   other read field is scoped).
 */
export function simplifyField(displayOptions: IDisplayOptions): INodeProperties {
	return {
		displayName: 'Simplify',
		name: SIMPLIFY_PARAMETER,
		type: 'boolean',
		default: true,
		description:
			'Whether to return a simplified version of the response instead of the raw data',
		displayOptions,
	};
}

/**
 * Flatten one JSON:API payload into the fields a workflow actually consumes.
 *
 * Accepts either shape the transport hooks hand in:
 *   - a **single-resource envelope** `{ data: { id, type, attributes, ... },
 *     links, meta }` (from `ascSingleRequest`) — the `data` object is the element;
 *   - a **bare `data` element** `{ id, type, attributes, ... }` (a Get Many item,
 *     already unwrapped by the pagination hook) — the payload itself is the element.
 *
 * From the element it returns `{ id, type, ...attributes }`, preserving
 * `relationships` when present, and dropping envelope noise (`links`, `meta`).
 * Missing `id`/`type`/`attributes` are handled gracefully (simply omitted). If
 * the element is not an object at all, the input is returned unchanged.
 */
export function simplifyJsonApi(json: IDataObject): IDataObject {
	// A single-resource envelope carries the element under `data` (a non-array
	// object). Otherwise the payload is already the `data` element itself.
	const data = json.data;
	const element =
		data !== null && typeof data === 'object' && !Array.isArray(data)
			? (data as IDataObject)
			: json;

	if (element === null || typeof element !== 'object' || Array.isArray(element)) {
		return json;
	}

	const simplified: IDataObject = {};

	if (element.id !== undefined) {
		simplified.id = element.id;
	}
	if (element.type !== undefined) {
		simplified.type = element.type;
	}

	const attributes = element.attributes;
	if (attributes !== null && typeof attributes === 'object' && !Array.isArray(attributes)) {
		Object.assign(simplified, attributes as IDataObject);
	}

	if (element.relationships !== undefined) {
		simplified.relationships = element.relationships;
	}

	return simplified;
}
