const { src, dest } = require('gulp');

/**
 * Copy node/credential SVG icons, plus the codex `*.node.json` metadata files,
 * into the compiled `dist` tree so they sit next to the generated `*.node.js`
 * files, mirroring the source layout. TypeScript does not copy non-code assets,
 * so this fills the gap.
 *
 * `encoding: false` keeps the copy byte-exact for every asset (gulp/vinyl v5
 * otherwise round-trips files through UTF-8 text); SVG and JSON copy fine as
 * binary, and it stays correct if a binary asset is ever added back.
 */
function buildIcons() {
	return src('nodes/**/*.{svg,json}', { base: '.', encoding: false }).pipe(dest('dist'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
