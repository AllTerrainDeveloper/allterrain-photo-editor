<?php
/**
 * Script and style registration.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', 'lienzo_register_assets' );

/**
 * Registers the editor bundle and stylesheet.
 *
 * Registration happens on `init` so that any surface which needs the editor -- the
 * admin page, the media modal, the block editor, an OpenStation native window --
 * can simply `wp_enqueue_script( 'lienzo' )` without caring who got there first.
 *
 * PixiJS is deliberately *not* registered as a dependency. It belongs to OpenStation,
 * and `src/engine/pixi-loader.ts` reaches for it at runtime only when `window.PIXI` is
 * absent -- through OpenStation's module registry inside the shell, and by URL outside
 * it. Enqueuing it here would mean 800KB on every media screen for a button that has
 * not been clicked, and a second Pixi on every page the shell already has one on.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_register_assets() {
	$suffix = ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) ? '' : '.min';
	$script = 'assets/js/lienzo' . $suffix . '.js';

	wp_register_script(
		'lienzo',
		LIENZO_URL . $script,
		array( 'wp-i18n' ),
		lienzo_asset_version( $script ),
		true
	);

	wp_set_script_translations( 'lienzo', 'allterrain-photo-editor', LIENZO_DIR . 'languages' );

	wp_register_style(
		'lienzo',
		LIENZO_URL . 'assets/css/lienzo.css',
		array( 'dashicons' ),
		lienzo_asset_version( 'assets/css/lienzo.css' )
	);
}

/**
 * Builds the cache-busting version for a bundled asset.
 *
 * The plugin version alone is not enough during development: it stays at 0.1.0 across
 * every rebuild, so the browser keeps serving the bundle it already has and a change
 * appears not to have worked. The file's modification time changes whenever the build
 * writes it, which is exactly the signal wanted. Falls back to the plugin version when
 * the file cannot be read, so a packaged install still gets a sensible value.
 *
 * @since 0.1.0
 *
 * @param string $relative Path within the plugin directory.
 * @return string Version string for `wp_register_script()`.
 */
function lienzo_asset_version( $relative ) {
	$path = LIENZO_DIR . $relative;

	if ( ! file_exists( $path ) ) {
		return LIENZO_VERSION;
	}

	$modified = filemtime( $path );

	return $modified ? LIENZO_VERSION . '.' . $modified : LIENZO_VERSION;
}

/**
 * Enqueues the editor bundle and hands it its runtime configuration.
 *
 * Safe to call more than once per request; the second call is a no-op because the
 * inline script is only added the first time the handle is enqueued.
 *
 * The config goes out as JSON via `wp_add_inline_script()` rather than through
 * `wp_localize_script()`, which casts every scalar to a string on its way to the
 * browser -- `true` arrives as `'1'` and `false` as `''`. That is fine for text and
 * quietly wrong for a flag: a strict check against `true` fails, and the JavaScript
 * concludes OpenStation is off while PHP is saying it is on. Booleans and numbers now
 * arrive as booleans and numbers.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_enqueue_editor() {
	if ( wp_script_is( 'lienzo', 'enqueued' ) ) {
		return;
	}

	wp_enqueue_script( 'lienzo' );
	wp_enqueue_style( 'lienzo' );

	wp_add_inline_script(
		'lienzo',
		'window.lienzoConfig = ' . wp_json_encode( lienzo_get_config() ) . ';',
		'before'
	);
}

/**
 * Builds the configuration blob handed to the browser as `window.lienzoConfig`.
 *
 * @since 0.1.0
 *
 * @return array Configuration array, JSON-encodable.
 */
function lienzo_get_config() {
	$config = array(
		'version'            => LIENZO_VERSION,
		'restUrl'            => esc_url_raw( trailingslashit( rest_url( LIENZO_REST_NAMESPACE ) ) ),
		'restNonce'          => wp_create_nonce( 'wp_rest' ),
		'pluginUrl'          => esc_url_raw( LIENZO_URL ),
		'mediaUrl'           => esc_url_raw( rest_url( 'wp/v2/media' ) ),
		'supportedMimes'     => lienzo_supported_mime_types(),
		'maxRenderPixels'    => lienzo_max_render_pixels(),
		'maxUploadBytes'     => lienzo_max_upload_bytes(),
		'maxSelectionPixels' => lienzo_max_selection_pixels(),
		'maxEdgePixels'      => lienzo_max_edge_pixels(),
		'canUpload'          => current_user_can( 'upload_files' ),
		'desktopMode'        => lienzo_is_desktop_mode_active(),
		'editorUrl'          => esc_url_raw( lienzo_editor_page_url() ),
		'pixiUrl'            => esc_url_raw( lienzo_pixi_url() ),
		'renderer'           => lienzo_renderer_backend(),
		'schema'             => lienzo_op_schema(),
	);

	/**
	 * Filters the editor's runtime configuration blob.
	 *
	 * @since 0.1.0
	 *
	 * @param array $config Configuration handed to the browser.
	 */
	return (array) apply_filters( 'lienzo_config', $config );
}

/**
 * Returns the URL of OpenStation's vendored PixiJS.
 *
 * AllTerrain Photo Editor ships no rendering library. Inside the shell the browser asks OpenStation's
 * module registry for `pixijs` and never comes here; on a classic admin screen that
 * registry is not on the page, but OpenStation *is* installed -- AllTerrain Photo Editor requires it --
 * so its file can be loaded directly.
 *
 * The URL is built from OpenStation's own constant rather than from a slug, so a
 * rename, a fork or a bundled copy all resolve. Two guards, because this is one
 * plugin reaching into another's directory: an unresolvable constant and a missing
 * file both yield an empty string, and the editor then says plainly that it cannot
 * find PixiJS instead of loading a 404 and failing somewhere stranger.
 *
 * @since 0.1.0
 *
 * @return string Absolute URL, or an empty string when it cannot be resolved.
 */
function lienzo_pixi_url() {
	$url  = lienzo_shell_constant( 'URL' );
	$dir  = lienzo_shell_constant( 'DIR' );
	$file = 'assets/vendor/pixi.min.js';

	$resolved = ( $url && $dir && file_exists( $dir . $file ) ) ? $url . $file : '';

	/**
	 * Filters where the browser loads PixiJS from.
	 *
	 * Only used outside the desktop shell, where OpenStation's module registry is not
	 * on the page. An empty string means "nowhere", and the editor reports it.
	 *
	 * @since 0.1.0
	 *
	 * @param string $resolved Absolute URL, or an empty string.
	 */
	return (string) apply_filters( 'lienzo_pixi_url', $resolved );
}

/**
 * Returns which rendering backend the browser should ask for.
 *
 * WebGL by default. The adjustment shader ships a WGSL program as well as a GLSL one,
 * so WebGPU renders the whole pipeline correctly -- but WebGL is the path with years
 * of use behind it, and a site that wants the newer one should say so rather than
 * being moved onto it by an update.
 *
 * `auto` asks for WebGPU and falls back to WebGL by itself where the browser has no
 * WebGPU at all.
 *
 * @since 0.1.0
 *
 * @return string One of `auto`, `webgl` or `webgpu`.
 */
function lienzo_renderer_backend() {
	/**
	 * Filters the rendering backend the editor asks for.
	 *
	 * @since 0.1.0
	 *
	 * @param string $backend One of `auto`, `webgl` or `webgpu`.
	 */
	$backend = apply_filters( 'lienzo_renderer_backend', 'webgl' );

	return in_array( $backend, array( 'auto', 'webgl', 'webgpu' ), true ) ? $backend : 'webgl';
}
