const { src, dest } = require('gulp');

/**
 * Copy node/credential SVG/PNG icons, plus the codex `*.node.json` metadata
 * files, into the compiled `dist` tree so they sit next to the generated
 * `*.node.js` files, mirroring the source layout. TypeScript does not copy
 * non-code assets, so this fills the gap.
 *
 * `encoding: false` is REQUIRED: gulp/vinyl v5 otherwise decodes files as text,
 * which corrupts binary PNGs (the leading 0x89 byte becomes the UTF-8
 * replacement char). Text assets (svg/json) copy fine as binary too.
 */
function buildIcons() {
	return src('nodes/**/*.{png,svg,json}', { base: '.', encoding: false }).pipe(dest('dist'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
