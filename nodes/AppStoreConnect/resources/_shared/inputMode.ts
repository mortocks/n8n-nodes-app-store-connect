import {
	NodeOperationError,
	type IDataObject,
	type IDisplayOptions,
	type IExecuteSingleFunctions,
	type INodeProperties,
} from 'n8n-workflow';

/**
 * Shared "Input Mode" field group — the dual typed-UI / raw-JSON toggle every
 * mutation (Create / Update / write) opts into.
 *
 * Two ways to define a request body, chosen by the `Input Mode` toggle:
 *   - **Fields (typed)** — the curated key/value UI: named parameters,
 *     dropdowns for enums, the app picker, etc. The default happy path.
 *   - **JSON** — a single raw-JSON field. The node sends the user-supplied
 *     JSON:API `data` object straight through the same transport, error
 *     mapping, and auth, bypassing the typed fields.
 *
 * Why: an escape hatch against API drift. When Apple adds an attribute or a new
 * resource shape before the node is updated, users hand-write the JSON instead
 * of being blocked on a node release — mirroring the webhook resource's raw
 * event-type override, generalised to whole request bodies.
 *
 * The JSON is scoped to the request `data` object only: the node still owns the
 * URL, method, auth, and pagination, so the escape hatch can't break routing or
 * leak the JWT. Both modes flow through the same `ascSingleRequest` + error
 * mapper (see `transport/`), so Continue-On-Fail and readable ASC errors behave
 * identically. Body builders call `resolveMutationData(...)` to pick the mode.
 */

/** The node-parameter name for the mode toggle. */
const INPUT_MODE_PARAMETER = 'inputMode';
/** The node-parameter name for the raw JSON body. */
const JSON_BODY_PARAMETER = 'jsonBody';

/**
 * Build the `Input Mode` toggle and its `JSON Body` companion, scoped to the
 * supplied `displayOptions` (a resource shows them on its write operations).
 *
 * Typed fields hide when JSON is active: a resource gives its own typed
 * attribute fields `inputMode: ['fields']` in their `displayOptions.show` so
 * they collapse the moment the user switches to JSON.
 */
export function inputModeFields(displayOptions: IDisplayOptions): INodeProperties[] {
	return [
		{
			displayName: 'Input Mode',
			name: INPUT_MODE_PARAMETER,
			type: 'options',
			noDataExpression: true,
			default: 'fields',
			description: 'How to define the request body sent to App Store Connect',
			displayOptions,
			options: [
				{
					name: 'Fields',
					value: 'fields',
					description: 'Build the body from the typed fields below',
				},
				{
					name: 'JSON',
					value: 'json',
					description: 'Send a raw JSON:API "data" object, bypassing the typed fields',
				},
			],
		},
		{
			displayName: 'JSON Body',
			name: JSON_BODY_PARAMETER,
			type: 'json',
			default: '{\n  "type": "",\n  "attributes": {}\n}',
			description:
				'The JSON:API `data` object to send (`{ "type", "attributes", "relationships" }`). A full `{ "data": {...} }` envelope is also accepted. Must include a `type`.',
			displayOptions: {
				...displayOptions,
				show: {
					...displayOptions.show,
					[INPUT_MODE_PARAMETER]: ['json'],
				},
			},
		},
	];
}

function isRecord(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse and validate the raw JSON-mode body into a JSON:API `data` object.
 *
 * Accepts either the `data` object directly (`{ type, attributes, ... }`) or a
 * full `{ data: {...} }` envelope, unwrapping the latter. Throws a readable
 * `NodeOperationError` — before any request is made — when the JSON is empty,
 * unparseable, or missing a non-empty `type` string.
 */
function parseJsonModeData(ctx: IExecuteSingleFunctions): IDataObject {
	const raw = ctx.getNodeParameter(JSON_BODY_PARAMETER, '') as string | IDataObject;

	let parsed: unknown;
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '') {
			throw new NodeOperationError(ctx.getNode(), 'JSON Body is empty', {
				description: 'Provide a JSON:API "data" object, or switch Input Mode back to Fields.',
			});
		}
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			throw new NodeOperationError(
				ctx.getNode(),
				`JSON Body is not valid JSON: ${(error as Error).message}`,
				{
					description: 'Fix the JSON so it parses, or switch Input Mode back to Fields.',
				},
			);
		}
	} else {
		// n8n's `json` field can hand back an already-parsed object.
		parsed = raw;
	}

	// Unwrap a full `{ data: {...} }` envelope down to the `data` object.
	const dataObject =
		isRecord(parsed) && isRecord(parsed.data) ? (parsed.data as IDataObject) : parsed;

	if (
		!isRecord(dataObject) ||
		typeof dataObject.type !== 'string' ||
		dataObject.type.trim() === ''
	) {
		throw new NodeOperationError(
			ctx.getNode(),
			'JSON Body must be a JSON:API "data" object with a non-empty "type"',
			{
				description:
					'Expected `{ "type": "...", "attributes": {...} }` (or a `{ "data": {...} }` envelope).',
			},
		);
	}

	return dataObject;
}

/**
 * The helper every write body-builder calls to choose typed-vs-JSON.
 *
 * In `fields` mode it returns whatever `buildTypedData()` assembles from the
 * typed UI. In `json` mode it returns the validated raw JSON:API `data` object
 * (and never calls `buildTypedData`, so the typed parameters aren't read). The
 * caller wraps the result as `{ data }` for the request body, keeping the JSON
 * scoped to `data` only.
 */
export function resolveMutationData(
	ctx: IExecuteSingleFunctions,
	buildTypedData: () => IDataObject,
): IDataObject {
	const inputMode = ctx.getNodeParameter(INPUT_MODE_PARAMETER, 'fields') as string;
	if (inputMode === 'json') {
		return parseJsonModeData(ctx);
	}
	return buildTypedData();
}
