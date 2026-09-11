<?php
/**
 * Plugin Name:       AllTerrain Photo Editor for OpenStation
 * Plugin URI:        https://github.com/AllTerrainDeveloper/allterrain-photo-editor
 * Description:       A modern, non-destructive image editor for the WordPress media library. Exposure, colour and tone adjustments rendered on the GPU, in the browser.
 * Version:           1.1.1
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Daniel Lopez
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       allterrain-photo-editor
 * Requires Plugins:  desktop-mode
 *
 * AllTerrain Photo Editor is an OpenStation application and requires it. That is not a formality: the
 * rendering library is OpenStation's. AllTerrain Photo Editor ships no PixiJS at all and borrows the
 * shell's, which keeps this plugin a few tens of kilobytes rather than eight hundred,
 * and keeps exactly one Pixi on the page -- two Pixi 8 instances share GPU resource
 * registries through globals, so one copy is not merely smaller but safer.
 *
 * At its best it runs as a **native window** in the shell, rendering into the shell's
 * own DOM: that is what gives the editor OpenStation's components, its drag bridge and
 * its window chrome, none of which is reachable from inside a chromeless iframe.
 *
 * With OpenStation installed but switched *off* for a user -- a per-user preference --
 * there is no shell on the page to render into, and the editor opens on its own admin
 * page under Media and in an overlay instead. `src/platform.ts` resolves every control
 * to a plain-DOM equivalent component by component, and PixiJS is loaded straight from
 * OpenStation's own directory. So classic admin has a real editor; what it does not
 * have is the window, the desktop icon and the drag bridge.
 *
 * With OpenStation absent altogether there is no PixiJS, so nothing loads but the
 * notice on the plugins screen explaining what is missing.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

define( 'LIENZO_VERSION', '1.1.1' );
define( 'LIENZO_FILE', __FILE__ );
define( 'LIENZO_DIR', plugin_dir_path( __FILE__ ) );
define( 'LIENZO_URL', plugin_dir_url( __FILE__ ) );
define( 'LIENZO_REST_NAMESPACE', 'lienzo/v1' );

/**
 * Id of the base image layer, shared with the TypeScript twin in `model/document.ts`.
 */
define( 'LIENZO_BASE_LAYER_ID', 'base' );

/**
 * Post meta key holding the serialized edit recipe on a rendered attachment.
 */
define( 'LIENZO_RECIPE_META', '_lienzo_recipe' );

/**
 * Post meta key holding the ID of the attachment the pixels originally came from.
 */
define( 'LIENZO_SOURCE_META', '_lienzo_source' );

/**
 * Post meta key holding where a saved copy's painted layers are kept.
 *
 * A map of layer id to a path under the uploads directory. A raster layer's pixels
 * exist nowhere but in the browser, so a save that wants to open again with its layers
 * has to bring them along; this is where they land.
 */
define( 'LIENZO_LAYERS_META', '_lienzo_layers' );

/**
 * The keys these two were called before the plugin was renamed.
 *
 * Read as a fallback and never written. An image edited under the old name still holds
 * its recipe there, and a rename is no reason for someone's saved edit to stop
 * re-opening -- the pixels would still be theirs, but every slider would be back at
 * zero and the link to the original lost.
 */
define( 'LIENZO_LEGACY_RECIPE_META', '_daguerre_recipe' );
define( 'LIENZO_LEGACY_SOURCE_META', '_daguerre_source' );

require_once LIENZO_DIR . 'includes/shell-api.php';
require_once LIENZO_DIR . 'includes/requirements.php';

add_action( 'plugins_loaded', 'lienzo_boot', 5 );

/**
 * Loads the plugin, once it is known that OpenStation is there to render with.
 *
 * On `plugins_loaded` rather than at file scope, and that is not a detail: plugins are
 * loaded in alphabetical order, so `allterrain-photo-editor` runs *before* `desktop-mode` and none of
 * its functions exist yet when this file is first read. Checking then would fail on
 * every site, every time, and the plugin would silently never load.
 * `Requires Plugins:` governs activation, not load order.
 *
 * Priority 5 leaves room for the OpenStation registrations at 20 to be added by an
 * include loaded here -- WordPress runs callbacks added to a hook that is already
 * firing, as long as they sit at a later priority.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_boot() {
	if ( ! lienzo_requirements_met() ) {
		// Nothing else loads. Without OpenStation there is no PixiJS to render with, on
		// any screen, and a half-registered plugin whose editor cannot open is worse
		// than one that says plainly what it needs.
		return;
	}

	require_once LIENZO_DIR . 'includes/helpers.php';
	require_once LIENZO_DIR . 'includes/recipe.php';
	require_once LIENZO_DIR . 'includes/post-image.php';
	require_once LIENZO_DIR . 'includes/post-attach.php';
	require_once LIENZO_DIR . 'includes/presets.php';
	require_once LIENZO_DIR . 'includes/render.php';
	require_once LIENZO_DIR . 'includes/rest.php';
	require_once LIENZO_DIR . 'includes/assets.php';
	require_once LIENZO_DIR . 'includes/admin-page.php';
	require_once LIENZO_DIR . 'includes/media-actions.php';
	require_once LIENZO_DIR . 'includes/desktop-mode.php';
}
