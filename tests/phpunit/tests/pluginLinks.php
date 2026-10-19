<?php
/**
 * The Support link on the Plugins screen.
 *
 * @package AllTerrain_Photo_Editor
 */

/**
 * The row meta added to this plugin, and only to this plugin.
 *
 * @group lienzo
 * @covers ::lienzo_plugin_row_meta
 */
class Lienzo_Test_Plugin_Links extends WP_UnitTestCase {

	/**
	 * Removes the filters a test added.
	 */
	public function tear_down() {
		remove_all_filters( 'lienzo_support_url' );

		parent::tear_down();
	}

	/**
	 * This plugin's row gains a link to the WordPress.org support forum.
	 */
	public function test_adds_support_link_to_own_row() {
		$links = lienzo_plugin_row_meta( array( 'Version 1.1.3' ), plugin_basename( LIENZO_FILE ) );

		$this->assertCount( 2, $links );
		$this->assertSame( 'Version 1.1.3', $links[0] );
		$this->assertStringContainsString( 'href="https://wordpress.org/support/plugin/allterrain-photo-editor/"', $links[1] );
		$this->assertStringContainsString( '>Support</a>', $links[1] );
	}

	/**
	 * Every other plugin's row is returned untouched.
	 */
	public function test_leaves_other_rows_alone() {
		$links = array( 'Version 2.0' );

		$this->assertSame( $links, lienzo_plugin_row_meta( $links, 'akismet/akismet.php' ) );
	}

	/**
	 * The destination can be changed, and an empty one removes the link.
	 */
	public function test_support_url_is_filterable() {
		add_filter(
			'lienzo_support_url',
			static function () {
				return 'https://example.com/help/';
			}
		);
		$links = lienzo_plugin_row_meta( array(), plugin_basename( LIENZO_FILE ) );
		$this->assertStringContainsString( 'href="https://example.com/help/"', $links[0] );

		add_filter( 'lienzo_support_url', '__return_empty_string', 20 );
		$this->assertSame( array(), lienzo_plugin_row_meta( array(), plugin_basename( LIENZO_FILE ) ) );
	}
}
