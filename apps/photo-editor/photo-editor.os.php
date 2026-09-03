<?php
/**
 * AllTerrain Photo Editor, declared as an OpenStation app.
 *
 * The window in one file: its title and icon, how big it opens, who may open it, and
 * the shortcut on the wallpaper. The App Framework turns this into a native window,
 * a dock tile and a desktop icon, and mounts the editor's client view into the
 * window body when it opens -- see `src/app.ts` for that half.
 *
 * There is no server view and no state. The editor is a canvas, not a form: its
 * document lives in the browser and speaks to the server over the `lienzo/v1` REST
 * routes it always has. What the framework contributes is the window itself, the
 * same way it does for Code Blue or WP Explorer, so the editor no longer carries its
 * own registration code for a shell that already knows how to host an app.
 *
 * Loaded by the framework from the directory `lienzo_register_apps_directory()`
 * adds, on an OpenStation that has the framework. An older shell never reads this
 * file and gets the window registered directly instead -- see
 * `lienzo_register_desktop_window()`.
 *
 * @package AllTerrain_Photo_Editor
 */

use OpenStation\App;

defined( 'ABSPATH' ) || exit;

$lienzo_app_suffix = ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) ? '' : '.min';

return App::define( 'lienzo' )
	->title( __( 'AllTerrain Photo Editor', 'allterrain-photo-editor' ) )
	->icon( 'dashicons-format-image' )
	->size( 1100, 720 )
	->min_size( 640, 480 )
	->placement( 'dock' )
	->capabilities( 'upload_files' )
	->desktop_icon( array( 'position' => 30 ) )
	// Ships with the window config, so the editor mounts the moment the window opens
	// rather than behind a spinner for the length of a `mount` round trip. There is
	// no data to compute, so the cost on every shell page load is nothing.
	->prefetch()
	->client( LIENZO_DIR . 'assets/js/lienzo-app' . $lienzo_app_suffix . '.js' );
