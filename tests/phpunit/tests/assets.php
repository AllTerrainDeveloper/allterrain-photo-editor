<?php
/**
 * The editor bundle's registration and the configuration it carries.
 *
 * @package AllTerrain_Photo_Editor
 */

/**
 * Tests for includes/assets.php.
 *
 * @group lienzo
 * @group lienzo-assets
 */
class Tests_Lienzo_Assets extends WP_UnitTestCase {

	/**
	 * The `lienzo` handle is registered by the time `init` has run.
	 *
	 * @covers ::lienzo_register_assets
	 */
	public function test_registers_the_bundle_and_stylesheet() {
		$this->assertTrue( wp_script_is( 'lienzo', 'registered' ) );
		$this->assertTrue( wp_style_is( 'lienzo', 'registered' ) );
	}

	/**
	 * The config rides on the registered handle, not on the enqueue.
	 *
	 * OpenStation builds a window's script payload from the registered handle's
	 * inline data. A plugin activated mid-session never had its boot-time enqueue
	 * run, so a config attached only at enqueue time would be missing from the
	 * window and the editor would boot without it.
	 *
	 * @covers ::lienzo_register_assets
	 */
	public function test_config_is_attached_to_the_registered_handle_before_any_enqueue() {
		$this->assertFalse( wp_script_is( 'lienzo', 'enqueued' ) );

		$before = wp_scripts()->get_data( 'lienzo', 'before' );

		$this->assertIsArray( $before );
		$this->assertStringContainsString( 'window.lienzoConfig = {', implode( "\n", $before ) );
	}

	/**
	 * Enqueuing twice prints the config once.
	 *
	 * @covers ::lienzo_enqueue_editor
	 */
	public function test_enqueuing_more_than_once_does_not_duplicate_the_config() {
		lienzo_enqueue_editor();
		lienzo_enqueue_editor();

		$this->assertTrue( wp_script_is( 'lienzo', 'enqueued' ) );
		$this->assertTrue( wp_style_is( 'lienzo', 'enqueued' ) );

		$before = implode( "\n", (array) wp_scripts()->get_data( 'lienzo', 'before' ) );

		$this->assertSame( 1, substr_count( $before, 'window.lienzoConfig = ' ) );
	}
}
