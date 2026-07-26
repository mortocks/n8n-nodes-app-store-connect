import type { IExecuteSingleFunctions } from 'n8n-workflow';

/**
 * Read a resourceLocator parameter and return its extracted id, or `undefined`
 * when the user left it unset.
 *
 * Every app-scoped resource pulls an id out of a `resourceLocator` the same way
 * — `getNodeParameter(name, '', { extractValue: true })`, trimmed, treating an
 * empty string as "not provided". Centralising that idiom keeps the per-resource
 * `filter[...]` folding hooks (Build, Beta Group, Beta Tester, …) to a single
 * readable line and removes the copy-pasted extract-and-trim block.
 */
export function extractResourceId(
	ctx: IExecuteSingleFunctions,
	parameterName: string,
): string | undefined {
	const value = (
		ctx.getNodeParameter(parameterName, '', { extractValue: true }) as string
	)?.trim();
	return value || undefined;
}
