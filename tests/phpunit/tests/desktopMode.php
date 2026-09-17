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
}
