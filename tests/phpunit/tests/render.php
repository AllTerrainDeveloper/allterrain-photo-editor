<?php
/**
 * The save pipeline.
 *
 * @package AllTerrain_Photo_Editor
 */

/**
 * Tests for includes/render.php and the render route.
 *
 * @group lienzo
 * @group lienzo-render
 */
class Tests_Lienzo_Render extends WP_UnitTestCase {

	/**
	 * Administrator user ID.
	 *
	 * @var int
	 */
	private $admin;

	/**
	 * Files copied into the uploads directory, cleaned up after each test.
	 *
	 * @var string[]
	 */
	private $temp_files = array();

	/**
	 * Spins up the REST server.
	 *
	 * @return void
	 */
	public function set_up() {
		parent::set_up();

		$this->admin = self::factory()->user->create( array( 'role' => 'administrator' ) );

		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		do_action( 'rest_api_init', $wp_rest_server );
	}

	/**
	 * Removes any staged upload temp files.
	 *
	 * @return void
	 */
	public function tear_down() {
		foreach ( $this->temp_files as $file ) {
			if ( file_exists( $file ) ) {
				wp_delete_file( $file );
			}
		}

		$this->temp_files = array();

		parent::tear_down();
	}

	/**
	 * Creates an image attachment from the test suite's sample JPEG.
	 *
	 * @return int Attachment ID.
	 */
	private function make_image() {
		return self::factory()->attachment->create_upload_object( DIR_TESTDATA . '/images/canola.jpg' );
	}

	/**
	 * Stages a file the way PHP would present an upload.
	 *
	 * `wp_handle_sideload()` moves the file, so each test needs its own copy.
	 *
	 * @param string $source Path to copy.
	 * @param string $name   Filename the client claims.
	 * @return array Upload array.
	 */
	private function staged_upload( $source, $name ) {
		$tmp = wp_tempnam( $name );
		copy( $source, $tmp );

		$this->temp_files[] = $tmp;

		return array(
			'tmp_name' => $tmp,
			'name'     => $name,
			'type'     => 'image/jpeg',
			'size'     => filesize( $tmp ),
			'error'    => 0,
		);
	}

	/**
	 * Builds a valid recipe for a source attachment.
	 *
	 * @param int $source_id Source attachment.
	 * @return array Recipe.
	 */
	private function recipe( $source_id ) {
		return array(
			'version' => LIENZO_RECIPE_VERSION,
			'source'  => $source_id,
			'ops'     => array(
				array(
					'type' => 'contrast',
					'v'    => 0.3,
				),
			),
			'output'  => array(
				'format'  => 'image/jpeg',
				'quality' => 0.9,
			),
		);
	}

	/**
	 * Saving creates a new attachment and leaves the original untouched.
	 *
	 * This is the whole promise of the plugin, so it is asserted on the bytes: the
	 * source file's path and modification time must both survive a save.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_save_creates_new_attachment_and_preserves_original() {
		wp_set_current_user( $this->admin );

		$source_id   = $this->make_image();
		$source_path = get_attached_file( $source_id );
		$before      = filemtime( $source_path );

		$new_id = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertNotWPError( $new_id );
		$this->assertNotSame( $source_id, $new_id );

		clearstatcache();
		$this->assertFileExists( $source_path );
		$this->assertSame( $before, filemtime( $source_path ) );
		$this->assertSame( $source_path, get_attached_file( $source_id ) );
	}

	/**
	 * The recipe and the source pointer are stored on the new attachment.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_save_stores_recipe_and_source() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$new_id    = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertSame( $source_id, (int) get_post_meta( $new_id, LIENZO_SOURCE_META, true ) );

		$stored = lienzo_get_recipe( $new_id );

		$this->assertIsArray( $stored );
		$this->assertSame( 'contrast', $stored['ops'][0]['type'] );
	}

	/**
	 * Re-opening a saved image resolves back to the original's pixels.
	 *
	 * @covers ::lienzo_resolve_source_id
	 */
	public function test_saved_image_reopens_against_the_original() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$new_id    = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$data = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $new_id ) )->get_data();

		$this->assertSame( $new_id, $data['id'] );
		$this->assertSame( $source_id, $data['sourceId'] );
		$this->assertSame( 'contrast', $data['recipe']['ops'][0]['type'] );
	}

	/**
	 * Alt text follows the image to its rendered copy.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_save_copies_alt_text() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		update_post_meta( $source_id, '_wp_attachment_image_alt', 'A field of canola' );

		$new_id = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertSame(
			'A field of canola',
			get_post_meta( $new_id, '_wp_attachment_image_alt', true )
		);
	}

	/**
	 * Core's provenance metadata is recorded alongside our own pointer.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_save_records_parent_image() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$new_id    = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$metadata = wp_get_attachment_metadata( $new_id );

		$this->assertSame( $source_id, $metadata['parent_image']['attachment_id'] );
	}

	/**
	 * The saved action fires with the new and source IDs.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_save_fires_action() {
		wp_set_current_user( $this->admin );

		$seen = array();

		add_action(
			'lienzo_image_saved',
			static function ( $new_id, $source_id ) use ( &$seen ) {
				$seen = array( $new_id, $source_id );
			},
			10,
			3
		);

		$source_id = $this->make_image();
		$new_id    = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertSame( array( $new_id, $source_id ), $seen );
	}

	/**
	 * A disguised PHP file is rejected rather than becoming an attachment.
	 *
	 * The endpoint takes arbitrary bytes from an authenticated client, so the MIME
	 * re-check after sideloading is load-bearing security, not belt and braces.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_save_rejects_disguised_php() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();

		$tmp = wp_tempnam( 'evil.jpg' );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Staging a hostile payload on disk; WP_Filesystem would sanitise what this test needs raw.
		file_put_contents( $tmp, "<?php echo 'pwned'; ?>" );
		$this->temp_files[] = $tmp;

		$result = lienzo_store_render(
			array(
				'tmp_name' => $tmp,
				'name'     => 'evil.jpg',
				'type'     => 'image/jpeg',
				'size'     => filesize( $tmp ),
				'error'    => 0,
			),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertWPError( $result );
	}

	/**
	 * A render larger than the site's ceiling is refused.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_save_rejects_oversized_render() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();

		add_filter( 'lienzo_max_upload_bytes', static fn() => 10 );

		$result = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_render_too_large', $result->get_error_code() );
	}

	/**
	 * The route refuses a recipe belonging to a different image.
	 *
	 * @covers ::lienzo_rest_render
	 */
	public function test_route_rejects_mismatched_recipe() {
		wp_set_current_user( $this->admin );

		$a = $this->make_image();
		$b = $this->make_image();

		$request = new WP_REST_Request( 'POST', '/lienzo/v1/media/' . $a . '/render' );
		$request->set_param( 'recipe', wp_json_encode( $this->recipe( $b ) ) );
		$request->set_file_params(
			array( 'file' => $this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ) )
		);

		$response = rest_do_request( $request );

		$this->assertSame( 400, $response->get_status() );
		$this->assertSame( 'lienzo_recipe_source_mismatch', $response->get_data()['code'] );
	}

	/**
	 * The route refuses a request with no file.
	 *
	 * @covers ::lienzo_rest_render
	 */
	public function test_route_rejects_missing_file() {
		wp_set_current_user( $this->admin );

		$id      = $this->make_image();
		$request = new WP_REST_Request( 'POST', '/lienzo/v1/media/' . $id . '/render' );
		$request->set_param( 'recipe', wp_json_encode( $this->recipe( $id ) ) );

		$response = rest_do_request( $request );

		$this->assertSame( 400, $response->get_status() );
		$this->assertSame( 'lienzo_render_missing_file', $response->get_data()['code'] );
	}

	/**
	 * A user who may edit the image but not upload cannot save.
	 *
	 * @covers ::lienzo_rest_save_permission
	 */
	public function test_route_requires_upload_capability() {
		$author = self::factory()->user->create( array( 'role' => 'author' ) );

		wp_set_current_user( $author );
		$id = $this->make_image();

		// Keep edit_post but revoke upload_files -- the exact split the callback
		// guards. Done through the capability filter rather than WP_User::add_cap(),
		// because the latter edits a fresh user object while the global current-user
		// object keeps its already-resolved capabilities.
		add_filter(
			'user_has_cap',
			static function ( $allcaps ) {
				$allcaps['upload_files'] = false;

				return $allcaps;
			}
		);

		$request = new WP_REST_Request( 'POST', '/lienzo/v1/media/' . $id . '/render' );
		$request->set_param( 'recipe', wp_json_encode( $this->recipe( $id ) ) );

		$response = rest_do_request( $request );

		$this->assertSame( 403, $response->get_status() );
		$this->assertSame( 'lienzo_cannot_upload', $response->get_data()['code'] );
	}

	/**
	 * The route round-trips: a saved render comes back with a 201 and its new ID.
	 *
	 * @covers ::lienzo_rest_render
	 */
	public function test_route_saves_and_reports_stored_dimensions() {
		wp_set_current_user( $this->admin );

		$id      = $this->make_image();
		$request = new WP_REST_Request( 'POST', '/lienzo/v1/media/' . $id . '/render' );
		$request->set_param( 'recipe', wp_json_encode( $this->recipe( $id ) ) );
		$request->set_file_params(
			array( 'file' => $this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ) )
		);

		$response = rest_do_request( $request );
		$data     = $response->get_data();

		$this->assertSame( 201, $response->get_status() );
		$this->assertGreaterThan( 0, $data['id'] );
		$this->assertSame( $id, $data['sourceId'] );
		// Reported from stored metadata, not from what the client claimed.
		$this->assertGreaterThan( 0, $data['width'] );
		$this->assertGreaterThan( 0, $data['height'] );
		// No edit URL: there is no page to link to, only a window to open.
		$this->assertArrayNotHasKey( 'editUrl', $data );
	}

	/**
	 * A recipe of pure adjustments is re-editable from the original.
	 *
	 * @covers ::lienzo_recipe_is_reproducible
	 */
	public function test_adjustments_are_reproducible() {
		$recipe = lienzo_validate_recipe( wp_json_encode( $this->recipe( 12 ) ) );

		$this->assertTrue( lienzo_recipe_is_reproducible( $recipe ) );
	}

	/**
	 * A recipe carrying a raster layer is not.
	 *
	 * Painted, pasted and dropped pixels exist only in the texture the browser drew them
	 * into. No amount of replaying the recipe over the original brings them back.
	 *
	 * @covers ::lienzo_recipe_is_reproducible
	 */
	public function test_a_raster_layer_is_not_reproducible() {
		$raw           = $this->recipe( 12 );
		$raw['layers'] = array(
			array(
				'id'   => 'base',
				'kind' => 'image',
			),
			array(
				'id'   => 'layer-paint',
				'kind' => 'raster',
				'name' => 'Paint',
			),
		);

		$recipe = lienzo_validate_recipe( wp_json_encode( $raw ) );

		$this->assertFalse( lienzo_recipe_is_reproducible( $recipe ) );
	}

	/**
	 * A painted save becomes its own origin.
	 *
	 * The bug this pins: the save pointed back at the original and stored a recipe
	 * naming a raster layer whose pixels lived nowhere. The file in the library was
	 * correct, and re-opening it showed the original with an empty layer where the
	 * painting had been.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_a_painted_save_does_not_point_back_at_the_original() {
		wp_set_current_user( $this->admin );

		$source        = $this->make_image();
		$raw           = $this->recipe( $source );
		$raw['layers'] = array(
			array(
				'id'   => 'base',
				'kind' => 'image',
			),
			array(
				'id'   => 'layer-paint',
				'kind' => 'raster',
				'name' => 'Paint',
			),
		);

		$recipe = lienzo_validate_recipe( wp_json_encode( $raw ) );
		$file   = $this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'painted.jpg' );
		$new_id = lienzo_store_render( $file, $source, $recipe );

		$this->assertIsInt( $new_id );

		// No source pointer, so the editor loads the flattened pixels it just wrote.
		$this->assertSame(
			$source,
			lienzo_resolve_source_id( $source ),
			'The original still resolves to itself.'
		);
		$this->assertSame(
			$new_id,
			lienzo_resolve_source_id( $new_id ),
			'A flattened save must resolve to itself, not to the original.'
		);
		// And no recipe, so no phantom layer describing pixels that are already baked in.
		$this->assertNull( lienzo_get_recipe( $new_id ) );
	}

	/**
	 * An adjustment-only save still points back, so its sliders come back.
	 *
	 * The other half of the rule: making a painted save self-contained must not cost
	 * the non-destructive behaviour that everything else depends on.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_an_adjustment_save_still_re_opens_from_the_original() {
		wp_set_current_user( $this->admin );

		$source = $this->make_image();
		$recipe = lienzo_validate_recipe( wp_json_encode( $this->recipe( $source ) ) );
		$file   = $this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'adjusted.jpg' );
		$new_id = lienzo_store_render( $file, $source, $recipe );

		$this->assertIsInt( $new_id );
		$this->assertSame( $source, lienzo_resolve_source_id( $new_id ) );

		$stored = lienzo_get_recipe( $new_id );

		$this->assertNotNull( $stored );
		$this->assertSame( 'contrast', $stored['ops'][0]['type'] );
	}

	/**
	 * Stages a PNG the way PHP would present a layer upload.
	 *
	 * @param string $layer_id Layer id the upload is keyed under.
	 * @return array Upload array.
	 */
	private function staged_layer( $layer_id ) {
		$tmp = wp_tempnam( $layer_id . '.png' );
		copy( DIR_TESTDATA . '/images/codeispoetry.png', $tmp );

		$this->temp_files[] = $tmp;

		return array(
			'tmp_name' => $tmp,
			'name'     => $layer_id . '.png',
			'type'     => 'image/png',
			'size'     => filesize( $tmp ),
			'error'    => 0,
		);
	}

	/**
	 * A recipe carrying one raster layer.
	 *
	 * @param int    $source_id Source attachment.
	 * @param string $layer_id  Raster layer id.
	 * @return array Validated recipe.
	 */
	private function layered_recipe( $source_id, $layer_id ) {
		$raw           = $this->recipe( $source_id );
		$raw['layers'] = array(
			array(
				'id'   => 'base',
				'kind' => 'image',
			),
			array(
				'id'   => $layer_id,
				'name' => 'Paint',
				'kind' => 'raster',
			),
		);

		return lienzo_validate_recipe( $raw );
	}

	/**
	 * Text draws itself again from its words, so a recipe with text replays exactly.
	 *
	 * @covers ::lienzo_recipe_is_reproducible
	 */
	public function test_a_text_layer_is_reproducible() {
		$raw           = $this->recipe( 1 );
		$raw['layers'] = array(
			array(
				'id'   => 'base',
				'kind' => 'image',
			),
			array(
				'id'   => 'layer-words',
				'kind' => 'text',
				'text' => array( 'text' => 'Hello' ),
			),
		);

		$this->assertTrue( lienzo_recipe_is_reproducible( lienzo_validate_recipe( $raw ) ) );
	}

	/**
	 * A raster layer is reproducible once its pixels were stored with the save.
	 *
	 * @covers ::lienzo_recipe_is_reproducible
	 */
	public function test_a_raster_layer_with_stored_pixels_is_reproducible() {
		$recipe = $this->layered_recipe( 1, 'layer-paint' );

		$this->assertFalse( lienzo_recipe_is_reproducible( $recipe ) );
		$this->assertFalse( lienzo_recipe_is_reproducible( $recipe, array( 'layer-other' ) ) );
		$this->assertTrue( lienzo_recipe_is_reproducible( $recipe, array( 'layer-paint' ) ) );
	}

	/**
	 * The editor sends layers as `layers[<id>]`, which PHP nests field by field.
	 *
	 * @covers ::lienzo_layer_uploads
	 */
	public function test_layer_uploads_are_picked_out_of_the_request() {
		$uploads = lienzo_layer_uploads(
			array(
				'file'   => array( 'tmp_name' => '/tmp/render' ),
				'layers' => array(
					'name'     => array(
						'layer-ok'      => 'a.png',
						'../etc/passwd' => 'b.png',
						'layer-failed'  => 'c.png',
					),
					'type'     => array(
						'layer-ok'      => 'image/png',
						'../etc/passwd' => 'image/png',
						'layer-failed'  => 'image/png',
					),
					'tmp_name' => array(
						'layer-ok'      => '/tmp/a',
						'../etc/passwd' => '/tmp/b',
						'layer-failed'  => '/tmp/c',
					),
					'error'    => array(
						'layer-ok'      => 0,
						'../etc/passwd' => 0,
						'layer-failed'  => UPLOAD_ERR_PARTIAL,
					),
					'size'     => array(
						'layer-ok'      => 10,
						'../etc/passwd' => 10,
						'layer-failed'  => 10,
					),
				),
			)
		);

		$this->assertSame( array( 'layer-ok' ), array_keys( $uploads ) );
		$this->assertSame( '/tmp/a', $uploads['layer-ok']['tmp_name'] );
		$this->assertSame( 'layer-ok.png', $uploads['layer-ok']['name'] );

		$this->assertSame( array(), lienzo_layer_uploads( array() ) );
	}

	/**
	 * A save that brings its layers along stays editable: the recipe and the source
	 * pointer are stored, and each layer's pixels sit in the copy's own directory.
	 *
	 * @covers ::lienzo_store_render
	 * @covers ::lienzo_store_layer_files
	 * @covers ::lienzo_get_layer_files
	 * @covers ::lienzo_layer_path
	 * @covers ::lienzo_layer_urls
	 */
	public function test_save_keeps_its_layers() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$new_id    = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->layered_recipe( $source_id, 'layer-paint' ),
			array( 'layer-paint' => $this->staged_layer( 'layer-paint' ) )
		);

		$this->assertNotWPError( $new_id );
		$this->assertSame( $source_id, (int) get_post_meta( $new_id, LIENZO_SOURCE_META, true ) );
		$this->assertIsArray( lienzo_get_recipe( $new_id ) );

		$files = lienzo_get_layer_files( $new_id );

		$this->assertSame( array( 'layer-paint' ), array_keys( $files ) );

		$path = lienzo_layer_path( $new_id, 'layer-paint' );

		$this->assertNotSame( '', $path );
		$this->assertFileExists( $path );
		$this->assertSame( 'image/png', wp_get_image_mime( $path ) );
		$this->assertStringContainsString( '/allterrain-photo-editor/layers/' . $new_id . '/', $path );

		$this->assertSame( '', lienzo_layer_path( $new_id, 'layer-missing' ) );

		$urls = lienzo_layer_urls( $new_id );

		$this->assertStringContainsString( '/lienzo/v1/media/' . $new_id . '/layers/layer-paint', $urls['layer-paint'] );

		// The payload the editor opens with knows where to fetch the pixels back from.
		$data = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $new_id ) )->get_data();

		$this->assertSame( $source_id, $data['sourceId'] );
		$this->assertSame( 'raster', $data['recipe']['layers'][1]['kind'] );
		$this->assertArrayHasKey( 'layer-paint', $data['layers'] );

		// And the layers go when the copy does.
		wp_delete_attachment( $new_id, true );

		$this->assertFileDoesNotExist( $path );
		$this->assertSame( array(), lienzo_get_layer_files( $new_id ) );
	}

	/**
	 * A save whose layers did not come along flattens, as it always did, and keeps no
	 * half set of layer files.
	 *
	 * @covers ::lienzo_store_render
	 */
	public function test_save_without_its_layers_flattens() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$raw       = $this->recipe( $source_id );

		$raw['layers'] = array(
			array(
				'id'   => 'base',
				'kind' => 'image',
			),
			array(
				'id'   => 'layer-one',
				'kind' => 'raster',
			),
			array(
				'id'   => 'layer-two',
				'kind' => 'raster',
			),
		);

		$new_id = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			lienzo_validate_recipe( $raw ),
			array( 'layer-one' => $this->staged_layer( 'layer-one' ) )
		);

		$this->assertNotWPError( $new_id );
		$this->assertSame( '', get_post_meta( $new_id, LIENZO_SOURCE_META, true ) );
		$this->assertNull( lienzo_get_recipe( $new_id ) );
		$this->assertSame( array(), lienzo_get_layer_files( $new_id ) );
		$this->assertSame( '', lienzo_layer_path( $new_id, 'layer-one' ) );
	}

	/**
	 * The layer route answers 404 for a layer that was never stored, and streams a
	 * stored one.
	 *
	 * @covers ::lienzo_rest_get_layer
	 */
	public function test_layer_route() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$new_id    = lienzo_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->layered_recipe( $source_id, 'layer-paint' ),
			array( 'layer-paint' => $this->staged_layer( 'layer-paint' ) )
		);

		$missing = rest_do_request(
			new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $new_id . '/layers/layer-nope' )
		);

		$this->assertSame( 404, $missing->get_status() );

		$found = rest_do_request(
			new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $new_id . '/layers/layer-paint' )
		);

		$this->assertSame( 200, $found->get_status() );
	}
}
