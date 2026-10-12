<?php
/**
 * The editor as an OpenStation app window.
 *
 * @package AllTerrain_Photo_Editor
 */

/**
 * Tests for includes/desktop-mode.php.
 *
 * @group lienzo
 * @group lienzo-desktop-mode
 */
class Tests_Lienzo_Desktop_Mode extends WP_UnitTestCase {

	/**
	 * The app window names the editor bundle and its stylesheet.
	 *
	 * The client view only mounts the editor. Without the `lienzo` handle on the
	 * window, a shell that never ran the boot-time enqueue -- a live activation --
	 * opens the window with nothing to mount.
	 *
	 * @covers ::lienzo_app_window_args
	 */
	public function test_app_window_declares_the_editor_bundle_and_stylesheet() {
		$args = lienzo_app_window_args(
			array(
				'scripts' => array( 'openstation-app-runtime' ),
				'styles'  => array( 'openstation-app-runtime' ),
			),
			'lienzo'
		);

		$this->assertSame( array( 'lienzo', 'openstation-app-runtime' ), $args['scripts'] );
		$this->assertSame( array( 'openstation-app-runtime', 'lienzo' ), $args['styles'] );
	}

	/**
	 * The bundle is declared even when the framework passed no companions at all.
	 *
	 * @covers ::lienzo_app_window_args
	 */
	public function test_app_window_declares_the_bundle_when_no_companions_were_given() {
		$args = lienzo_app_window_args( array( 'title' => 'x' ), 'lienzo' );

		$this->assertSame( array( 'lienzo' ), $args['scripts'] );
		$this->assertSame( array( 'lienzo' ), $args['styles'] );
		$this->assertSame( 'x', $args['title'] );
	}

	/**
	 * Other apps' windows are left exactly as they were.
	 *
	 * @covers ::lienzo_app_window_args
	 */
	public function test_leaves_other_app_windows_alone() {
		$args = array( 'scripts' => array( 'someone-else' ) );

		$this->assertSame( $args, lienzo_app_window_args( $args, 'wp-explorer' ) );
	}

	/**
	 * The shell page enqueues the bundle itself, so the window does not ask to
	 * preload it there.
	 *
	 * @covers ::lienzo_app_window_args
	 */
	public function test_does_not_preload_on_the_shell_page() {
		$GLOBALS['lienzo_test_chromeless'] = false;

		$this->assertArrayNotHasKey( 'preload_script', lienzo_app_window_args( array(), 'lienzo' ) );
	}

	/**
	 * The payload that announces a live activation is built in a chromeless request,
	 * and there the bundle asks to load at once: the icon drop and the file opener
	 * have to work before the window is ever opened.
	 *
	 * @covers ::lienzo_app_window_args
	 */
	public function test_preloads_when_announced_from_a_chromeless_request() {
		$GLOBALS['lienzo_test_chromeless'] = true;

		$args = lienzo_app_window_args( array(), 'lienzo' );

		$GLOBALS['lienzo_test_chromeless'] = false;

		$this->assertTrue( $args['preload_script'] );
	}
}

/*
 * A shell that can say whether this request is a chromeless window, declared at file
 * scope so it exists before the run. Off unless a test switches it on, which is the
 * same answer the plugin gets with no shell function at all.
 *
 * phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound
 * phpcs:disable Universal.Files.SeparateFunctionsFromOO.Mixed
 */
if ( ! function_exists( 'desktop_mode_is_chromeless_request' ) ) {
	/**
	 * Whether the current request renders inside a window iframe.
	 *
	 * @return bool The test's switch.
	 */
	function desktop_mode_is_chromeless_request() {
		return ! empty( $GLOBALS['lienzo_test_chromeless'] );
	}
}
