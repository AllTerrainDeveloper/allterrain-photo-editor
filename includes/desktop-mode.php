<?php
/**
 * OpenStation integration.
 *
 * Every registration in this file is additive and sits behind a `function_exists()`
 * gate. AllTerrain Photo Editor is a standalone plugin: with OpenStation absent, nothing here
 * runs and all four standalone hosts continue to work untouched. There is
 * deliberately no `Requires Plugins: desktop-mode` header on the bootstrap.
 *
 * The window itself is declared twice over, and exactly one declaration is used. On
 * an OpenStation with the App Framework, `apps/photo-editor/photo-editor.os.php` is
 * the window -- title, size, capability, icon -- and the framework mounts the editor
 * into it. On an older shell without the framework, `lienzo_register_desktop_window()`
 * registers the same window directly. Both land on the same id, so everything that
 * opens the editor -- the file opener, the icon drop, the media modal, the block
 * toolbar -- asks for `lienzo` and neither knows nor cares which path answered.
 *
 * @package AllTerrain_Photo_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Determines whether OpenStation is installed and switched on for the current user.
 *
 * Two separate questions, and both matter. `function_exists()` answers "is the
 * plugin active"; `openstation_is_enabled()` answers "has this particular user
 * opted in", since OpenStation is a per-user preference rather than a site-wide
 * one. Only when both hold should AllTerrain Photo Editor present itself as a desktop app.
 *
 * @since 0.1.0
 *
 * @return bool True when OpenStation is active for the current user.
 */
function lienzo_is_desktop_mode_active() {
	if ( ! lienzo_shell_has( 'register_window' ) || ! lienzo_shell_has( 'is_enabled' ) ) {
		return false;
	}

	return (bool) lienzo_shell_call( 'is_enabled' );
}

add_action( 'plugins_loaded', 'lienzo_maybe_init_desktop_mode', 20 );

/**
 * Wires up the OpenStation integrations, if OpenStation is there to wire into.
 *
 * The gate is on the registration function rather than on a version constant, so a
 * OpenStation release that renames itself or drops the API degrades to "no desktop
 * integration" instead of a fatal error on every request.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_maybe_init_desktop_mode() {
	if ( ! lienzo_shell_has( 'register_window' ) ) {
		return;
	}

	if ( lienzo_uses_app_framework() ) {
		add_filter( 'openstation_apps_directories', 'lienzo_register_apps_directory' );
		add_action( 'init', 'lienzo_register_file_opener', 20 );
	} else {
		add_action( 'init', 'lienzo_register_desktop_window', 20 );
	}

	// Registered against both spellings. Which one fires depends on the shell's
	// version, and a listener for a hook that never fires costs nothing.
	foreach ( lienzo_shell_hooks( 'mode_init' ) as $hook ) {
		add_action( $hook, 'lienzo_enqueue_in_shell' );
	}

	foreach ( lienzo_shell_hooks( 'my_wordpress_preview_actions' ) as $hook ) {
		add_filter( $hook, 'lienzo_my_wordpress_action' );
	}
}

/**
 * Whether this OpenStation can host the editor as an App Framework app.
 *
 * Tested by capability, as everything about the shell is: the function that turns
 * apps into windows, and the class an `.os.php` file returns. A shell with one and
 * not the other is mid-upgrade or a fork, and gets the direct registration.
 *
 * @since 1.1.0
 *
 * @return bool True when the `.os.php` declaration will be read.
 */
function lienzo_uses_app_framework() {
	return lienzo_shell_has( 'apps_register_windows' ) && class_exists( 'OpenStation\App' );
}

/**
 * Points the App Framework at this plugin's apps.
 *
 * @since 1.1.0
 *
 * @param array $dirs Directories the framework scans for `.os.php` files.
 * @return array Directories, with ours appended.
 */
function lienzo_register_apps_directory( $dirs ) {
	$dirs   = (array) $dirs;
	$dirs[] = LIENZO_DIR . 'apps';

	return $dirs;
}

/**
 * Registers the native window, its wallpaper icon, and the file opener.
 *
 * A *native* window rather than an iframe: rendering into the shell's own DOM is
 * what gives the editor access to the desktop's drag bridge, so a photo can be
 * dragged onto it and a saved result dragged back out into a Gutenberg window.
 * Neither is possible across an iframe boundary.
 *
 * The path for a shell without the App Framework. With it, the window comes from
 * `apps/photo-editor/photo-editor.os.php` and only the file opener is registered here.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_register_desktop_window() {
	$registered = lienzo_shell_call(
		'register_window',
		'lienzo',
		array(
			'title'        => __( 'AllTerrain Photo Editor', 'allterrain-photo-editor' ),
			'icon'         => 'dashicons-format-image',
			'template'     => 'lienzo_render_desktop_template',
			'script'       => 'lienzo',
			'style'        => 'lienzo',
			'width'        => 1100,
			'height'       => 720,
			'min_width'    => 640,
			'min_height'   => 480,
			'placement'    => 'dock',
			'capabilities' => array( 'upload_files' ),
		)
	);

	if ( is_wp_error( $registered ) ) {
		return;
	}

	if ( lienzo_shell_has( 'register_icon' ) ) {
		lienzo_shell_call(
			'register_icon',
			'lienzo',
			array(
				'title'        => __( 'AllTerrain Photo Editor', 'allterrain-photo-editor' ),
				'icon'         => 'dashicons-format-image',
				'window'       => 'lienzo',
				'position'     => 30,
				'capabilities' => array( 'upload_files' ),
			)
		);
	}

	lienzo_register_file_opener();
}

/**
 * Offers the editor as a way to open image files on the desktop.
 *
 * Shared by both registration paths: an app window and a directly registered one
 * open files the same way.
 *
 * @since 1.1.0
 *
 * @return void
 */
function lienzo_register_file_opener() {
	if ( ! lienzo_shell_has( 'register_file_opener' ) ) {
		return;
	}

	lienzo_shell_call(
		'register_file_opener',
		'lienzo',
		array(
			'label'        => __( 'Edit in AllTerrain Photo Editor', 'allterrain-photo-editor' ),
			'types'        => array( 'attachment' ),
			'is_default'   => false,
			'sort'         => 15,
			'script'       => 'lienzo',
			'capabilities' => array( 'upload_files' ),
		)
	);
}

/**
 * Emits the native window's body markup.
 *
 * The shell clones this into the window before calling the JavaScript render
 * callback, so the callback enhances existing markup rather than building from
 * nothing -- which means the window paints something immediately instead of
 * flashing empty while the bundle boots.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_render_desktop_template() {
	echo '<div class="lienzo-root" data-lienzo-root data-host="window"></div>';
}

/**
 * Loads the editor assets into OpenStation.
 *
 * `openstation_mode_init` fires while the shell itself is rendering, which is the
 * documented place for a plugin to enqueue shell-level code. Registering the script
 * handle on the window is not enough on its own: the shell enqueues the handle but
 * never runs our `wp_localize_script()`, so the bundle would boot without its
 * configuration.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_enqueue_in_shell() {
	if ( ! current_user_can( 'upload_files' ) ) {
		return;
	}

	lienzo_enqueue_editor();
}

/**
 * Adds "Edit in AllTerrain Photo Editor" to the My WordPress media preview rail.
 *
 * @since 0.1.0
 *
 * @param array $actions Registered preview actions.
 * @return array Filtered actions.
 */
function lienzo_my_wordpress_action( $actions ) {
	$actions[] = array(
		'id'         => 'lienzo',
		'label'      => __( 'Edit in AllTerrain Photo Editor', 'allterrain-photo-editor' ),
		'icon'       => 'dashicons-format-image',
		'capability' => 'upload_files',
		'mime'       => '^image/',
		'sections'   => array( 'media' ),
		'script'     => 'lienzo',
	);

	return $actions;
}

/**
 * Determines whether the current request is rendering inside an OpenStation window.
 *
 * Chromeless requests are the admin page loaded inside a window iframe, with the
 * admin bar and menu suppressed. The editor uses this to drop its own page chrome
 * and fill the window body.
 *
 * @since 0.1.0
 *
 * @return bool True when rendering inside an OpenStation window iframe.
 */
function lienzo_is_desktop_mode_chromeless() {
	if ( ! lienzo_shell_has( 'is_chromeless_request' ) ) {
		return false;
	}

	return (bool) lienzo_shell_call( 'is_chromeless_request' );
}
