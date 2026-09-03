import { defineConfig } from 'vite';

/**
 * Four passes write into the same output directory. `--mode development` emits the
 * readable `lienzo.js` that WordPress serves under SCRIPT_DEBUG, and
 * `--mode production` emits the minified `lienzo.min.js`. `--mode app` and
 * `--mode app-min` do the same for `lienzo-app[.min].js`, the few lines that
 * declare the editor's window to OpenStation's App Framework -- a second entry
 * because an IIFE bundle has exactly one. `emptyOutDir` is off so no pass deletes
 * another's output.
 *
 * PixiJS is never bundled — see bin/vendor-pixi.mjs for why. It is read off
 * `window.PIXI` at runtime and typed against src/engine/pixi-types.ts.
 */
export default defineConfig( ( { mode } ) => {
	const app = mode.startsWith( 'app' );
	const isProd = mode === 'production' || mode === 'app-min';
	const base = app ? 'lienzo-app' : 'lienzo';

	return {
		build: {
			outDir: 'assets/js',
			emptyOutDir: false,
			target: 'es2020',
			minify: isProd ? 'esbuild' : false,
			sourcemap: false,
			lib: {
				entry: app ? 'src/app.ts' : 'src/index.ts',
				formats: [ 'iife' ],
				name: app ? 'lienzoApp' : 'lienzo',
				fileName: () => `${ base }${ isProd ? '.min' : '' }.js`,
			},
		},
		test: {
			environment: 'jsdom',
			include: [ 'tests/vitest/**/*.test.ts' ],
		},
	};
} );
