/**
 * What actually ships inside the plugin.
 *
 * One list, imported by both the local deploy and the release package, because the two
 * answering differently is how a zip ends up carrying `node_modules` or missing a file
 * the QA site has been running happily for weeks. If it is not here, it is development
 * scaffolding and stays in the repository.
 */

/** Directories and files that never reach a running site or a release. */
export const EXCLUDED = new Set( [
	// Dependency trees. `vendor/` is Composer's dev-only tooling: the plugin has no
	// runtime PHP dependencies.
	'node_modules',
	'vendor',

	// Sources and the tools that turn them into the built bundles.
	'bin',
	'src',
	'tests',
	'package.json',
	'package-lock.json',
	'composer.json',
	'composer.lock',
	'phpcs.xml.dist',
	'vite.config.js',
	'tsconfig.json',

	// Developer documentation. `readme.txt` is the one users see, and it does ship.
	// `docs/` holds the readme's translations, which go to translate.wordpress.org.
	'README.md',
	'docs',

	// Output of the packaging step itself.
	'dist',
] );

/**
 * Whether a top-level entry belongs in a distributed copy of the plugin.
 *
 * Nothing beginning with a dot ever ships, and that rule is deliberately blind rather
 * than a list of known offenders. Version control, the wp-env config, the
 * directory-listing art in `.wordpress-org/` and every agent or editor directory that
 * appears in a repository over time are all development scaffolding, and a deny-list
 * only excludes the ones somebody remembered to add -- `.claude/settings.local.json`
 * shipped inside a release zip precisely that way. WordPress.org's own Plugin Check
 * flags hidden files, so a leak here is not merely untidy: it fails review.
 *
 * The plugin itself ships no dotfiles, so there is nothing to carve an exception for.
 *
 * @param {string} name Entry name, relative to the repository root.
 * @return {boolean} True when it ships.
 */
export function ships( name ) {
	return ! name.startsWith( '.' ) && ! EXCLUDED.has( name );
}
