<?php
/**
 * Recipe schema and validation.
 *
 * @package AllTerrain_Photo_Editor
 */

/**
 * Tests for lienzo_validate_recipe() and friends.
 *
 * @group lienzo
 * @group lienzo-recipe
 */
class Tests_Lienzo_Recipe extends WP_UnitTestCase {

	/**
	 * Builds a minimal valid recipe with the given ops.
	 *
	 * @param array $ops Op list.
	 * @return array Recipe.
	 */
	private function recipe( $ops = array() ) {
		$recipe        = lienzo_default_recipe( 42 );
		$recipe['ops'] = $ops;

		return $recipe;
	}

	/**
	 * A well-formed recipe survives validation unchanged.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_valid_recipe_round_trips() {
		$recipe = $this->recipe(
			array(
				array(
					'type' => 'exposure',
					'v'    => 0.25,
				),
			)
		);
		$result = lienzo_validate_recipe( $recipe );

		$this->assertNotWPError( $result );
		$this->assertSame( LIENZO_RECIPE_VERSION, $result['version'] );
		$this->assertSame( 42, $result['source'] );
		$this->assertCount( 1, $result['ops'] );
		$this->assertSame( 'exposure', $result['ops'][0]['type'] );
		$this->assertEqualsWithDelta( 0.25, $result['ops'][0]['v'], 1e-9 );
	}

	/**
	 * The working space round-trips, and anything unrecognised is sRGB.
	 *
	 * A recipe written before schema version 6 has no space at all. Refusing one would
	 * make an old edit unopenable over a field it could not have known to write, so an
	 * absent or unknown value means the space every earlier recipe was rendered in.
	 *
	 * @covers ::lienzo_validate_recipe
	 * @covers ::lienzo_validate_space
	 */
	public function test_working_space() {
		$recipe          = $this->recipe();
		$recipe['space'] = 'linear';

		$this->assertSame( 'linear', lienzo_validate_recipe( $recipe )['space'] );

		$recipe['space'] = 'prophoto';
		$this->assertSame( 'srgb', lienzo_validate_recipe( $recipe )['space'] );

		unset( $recipe['space'] );
		$this->assertSame( 'srgb', lienzo_validate_recipe( $recipe )['space'] );
	}

	/**
	 * A JSON string is accepted as readily as a decoded array.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_accepts_json_string() {
		$result = lienzo_validate_recipe( wp_json_encode( $this->recipe() ) );

		$this->assertNotWPError( $result );
		$this->assertSame( 42, $result['source'] );
	}

	/**
	 * Malformed JSON is rejected rather than silently treated as empty.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_malformed_json() {
		$result = lienzo_validate_recipe( '{ not json' );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_invalid_json', $result->get_error_code() );
	}

	/**
	 * A recipe from a newer schema than this site understands is rejected.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_future_version() {
		$recipe            = $this->recipe();
		$recipe['version'] = LIENZO_RECIPE_VERSION + 1;

		$result = lienzo_validate_recipe( $recipe );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_bad_version', $result->get_error_code() );
	}

	/**
	 * An op type nothing knows how to render is rejected, not dropped.
	 *
	 * A dropped op would produce a recipe that re-opens showing sliders which do not
	 * match the pixels on screen, so this has to be loud.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_unknown_op() {
		$result = lienzo_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'teleport',
						'v'    => 1,
					),
				)
			)
		);

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_unknown_op', $result->get_error_code() );
		$this->assertSame( 'teleport', $result->get_error_data()['op'] );
	}

	/**
	 * Values outside an op's declared range are rejected.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_out_of_range_value() {
		$result = lienzo_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'exposure',
						'v'    => 4,
					),
				)
			)
		);

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_value_out_of_range', $result->get_error_code() );
	}

	/**
	 * Hue accepts the full degree range that exposure would reject.
	 *
	 * Guards against a regression where every op shares one hardcoded -1..1 bound.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_hue_uses_its_own_range() {
		$result = lienzo_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'hue',
						'v'    => 175,
					),
				)
			)
		);

		$this->assertNotWPError( $result );
		$this->assertEqualsWithDelta( 175.0, $result['ops'][0]['v'], 1e-9 );
	}

	/**
	 * The same op twice is rejected; last-wins would be ambiguous.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_duplicate_op() {
		$result = lienzo_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'contrast',
						'v'    => 0.1,
					),
					array(
						'type' => 'contrast',
						'v'    => 0.2,
					),
				)
			)
		);

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_duplicate_op', $result->get_error_code() );
	}

	/**
	 * An op sitting at its default is dropped so stored recipes stay minimal.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_drops_no_op_adjustments() {
		$result = lienzo_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'exposure',
						'v'    => 0,
					),
					array(
						'type' => 'contrast',
						'v'    => 0.3,
					),
				)
			)
		);

		$this->assertNotWPError( $result );
		$this->assertCount( 1, $result['ops'] );
		$this->assertSame( 'contrast', $result['ops'][0]['type'] );
	}

	/**
	 * A non-numeric value is rejected rather than coerced to zero.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_non_numeric_value() {
		$result = lienzo_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'exposure',
						'v'    => 'bright',
					),
				)
			)
		);

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_bad_value', $result->get_error_code() );
	}

	/**
	 * An output format the browser cannot encode is rejected.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_unsupported_output_format() {
		$recipe                     = $this->recipe();
		$recipe['output']['format'] = 'image/gif';

		$result = lienzo_validate_recipe( $recipe );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_bad_format', $result->get_error_code() );
	}

	/**
	 * Quality outside 0.1..1.0 is rejected.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_bad_quality() {
		$recipe                      = $this->recipe();
		$recipe['output']['quality'] = 2.5;

		$result = lienzo_validate_recipe( $recipe );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_bad_quality', $result->get_error_code() );
	}

	/**
	 * A recipe with no source attachment is rejected.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_rejects_missing_source() {
		$recipe           = $this->recipe();
		$recipe['source'] = 0;

		$result = lienzo_validate_recipe( $recipe );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_recipe_bad_source', $result->get_error_code() );
	}

	/**
	 * Every op in the schema declares a range that contains its default.
	 *
	 * Cheap guard against a typo in the table that would make an op impossible to
	 * leave at rest.
	 *
	 * @covers ::lienzo_op_schema
	 */
	public function test_schema_defaults_are_in_range() {
		foreach ( lienzo_op_schema() as $type => $spec ) {
			$this->assertGreaterThanOrEqual( $spec['min'], $spec['default'], $type );
			$this->assertLessThanOrEqual( $spec['max'], $spec['default'], $type );
		}
	}

	/**
	 * A stored recipe that no longer validates reads back as absent, not fatal.
	 *
	 * @covers ::lienzo_get_recipe
	 */
	public function test_get_recipe_ignores_corrupt_meta() {
		$post_id = self::factory()->post->create();
		update_post_meta( $post_id, LIENZO_RECIPE_META, '{ broken' );

		$this->assertNull( lienzo_get_recipe( $post_id ) );
	}

	/**
	 * A current-version recipe with a layer stack survives validation intact.
	 *
	 * The PHP validator and `src/model/recipe.ts` are twins and have to agree on the
	 * version. They did not: the editor was writing v5 while this side capped at v4, so
	 * every save was rejected with "unsupported recipe version" -- the one failure mode
	 * a contract split across two languages exists to have.
	 *
	 * @covers ::lienzo_validate_recipe
	 * @covers ::lienzo_validate_layers
	 */
	public function test_layer_stack_round_trips() {
		$recipe = lienzo_validate_recipe(
			wp_json_encode(
				array(
					'version'       => LIENZO_RECIPE_VERSION,
					'source'        => 12,
					'ops'           => array(),
					'layers'        => array(
						array(
							'id'        => 'base',
							'name'      => 'Image',
							'kind'      => 'image',
							'transform' => array(
								'x' => 0.5,
								'y' => 0.5,
							),
						),
						array(
							'id'        => 'layer-abc',
							'name'      => 'Pasted',
							'kind'      => 'raster',
							'transform' => array(
								'x'      => 0.25,
								'scaleX' => 2.0,
							),
							'opacity'   => 0.5,
							'visible'   => false,
						),
					),
					'activeLayerId' => 'layer-abc',
				)
			)
		);

		$this->assertNotWPError( $recipe );
		$this->assertCount( 2, $recipe['layers'] );
		$this->assertSame( 'layer-abc', $recipe['activeLayerId'] );
		$this->assertSame( 'raster', $recipe['layers'][1]['kind'] );
		$this->assertSame( 2.0, $recipe['layers'][1]['transform']['scaleX'] );
		$this->assertSame( 0.5, $recipe['layers'][1]['opacity'] );
		$this->assertFalse( $recipe['layers'][1]['visible'] );
	}

	/**
	 * An active layer id naming a layer that is not there falls back to the base.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_active_layer_must_exist() {
		$recipe = lienzo_validate_recipe(
			wp_json_encode(
				array(
					'version'       => LIENZO_RECIPE_VERSION,
					'source'        => 12,
					'ops'           => array(),
					'activeLayerId' => 'layer-that-was-deleted',
				)
			)
		);

		$this->assertSame( 'base', $recipe['activeLayerId'] );
	}

	/**
	 * A pre-stack recipe's single transform becomes the base layer's.
	 *
	 * @covers ::lienzo_migrate_recipe
	 */
	public function test_v4_transform_becomes_the_base_layer() {
		$recipe = lienzo_validate_recipe(
			wp_json_encode(
				array(
					'version' => 4,
					'source'  => 12,
					'ops'     => array(),
					'layer'   => array(
						'x'        => 0.3,
						'rotation' => 45.0,
					),
				)
			)
		);

		$this->assertSame( LIENZO_RECIPE_VERSION, $recipe['version'] );
		$this->assertCount( 1, $recipe['layers'] );
		$this->assertSame( 0.3, $recipe['layers'][0]['transform']['x'] );
		$this->assertSame( 45.0, $recipe['layers'][0]['transform']['rotation'] );
		$this->assertArrayNotHasKey( 'layer', $recipe );
	}

	/**
	 * The oldest recipes still carry their geometry all the way to a layer stack.
	 *
	 * @covers ::lienzo_migrate_recipe
	 */
	public function test_v2_geometry_survives_to_the_stack() {
		$recipe = lienzo_validate_recipe(
			wp_json_encode(
				array(
					'version'  => 2,
					'source'   => 12,
					'ops'      => array(),
					'geometry' => array(
						'rotate'     => 90.0,
						'straighten' => 1.5,
						'flipH'      => true,
					),
				)
			)
		);

		$this->assertCount( 1, $recipe['layers'] );
		// Rotation and straightening were separate fields and are one angle now.
		$this->assertSame( 91.5, $recipe['layers'][0]['transform']['rotation'] );
		$this->assertTrue( $recipe['layers'][0]['transform']['flipH'] );
	}

	/**
	 * A recipe from a future version is refused rather than half-understood.
	 *
	 * @covers ::lienzo_validate_recipe
	 */
	public function test_future_version_is_refused() {
		$recipe = lienzo_validate_recipe(
			wp_json_encode(
				array(
					'version' => LIENZO_RECIPE_VERSION + 1,
					'source'  => 12,
					'ops'     => array(),
				)
			)
		);

		$this->assertWPError( $recipe );
		$this->assertSame( 'lienzo_recipe_bad_version', $recipe->get_error_code() );
	}

	/**
	 * A text layer keeps the words it was typed as, so it can be drawn -- and retyped --
	 * again.
	 *
	 * @covers ::lienzo_validate_layers
	 * @covers ::lienzo_validate_text_source
	 */
	public function test_text_layer_keeps_its_words() {
		$recipe = lienzo_validate_recipe(
			array(
				'version'       => LIENZO_RECIPE_VERSION,
				'source'        => 1,
				'layers'        => array(
					array(
						'id'   => 'base',
						'kind' => 'image',
					),
					array(
						'id'   => 'layer-abc123',
						'name' => 'I <3 you',
						'kind' => 'text',
						'text' => array(
							'text'        => "I <3 you\nsecond line",
							'size'        => 48,
							'family'      => 'Georgia, serif',
							'colour'      => '#00FF00',
							'bold'        => true,
							'italic'      => false,
							'strokeWidth' => 2,
						),
					),
				),
				'activeLayerId' => 'layer-abc123',
			)
		);

		$this->assertNotWPError( $recipe );
		$this->assertSame( 'text', $recipe['layers'][1]['kind'] );
		$this->assertSame( "I <3 you\nsecond line", $recipe['layers'][1]['text']['text'] );
		$this->assertSame( 48.0, $recipe['layers'][1]['text']['size'] );
		$this->assertSame( 'Georgia, serif', $recipe['layers'][1]['text']['family'] );
		$this->assertSame( '#00FF00', $recipe['layers'][1]['text']['colour'] );
		$this->assertTrue( $recipe['layers'][1]['text']['bold'] );
		$this->assertFalse( $recipe['layers'][1]['text']['italic'] );
		$this->assertSame( 2.0, $recipe['layers'][1]['text']['strokeWidth'] );
		$this->assertArrayNotHasKey( 'text', $recipe['layers'][0] );
	}

	/**
	 * A text layer with nothing to say is kept as a raster layer, so whatever pixels it
	 * has are still shown.
	 *
	 * @covers ::lienzo_validate_layers
	 */
	public function test_text_layer_without_words_becomes_raster() {
		$recipe = lienzo_validate_recipe(
			array(
				'version' => LIENZO_RECIPE_VERSION,
				'source'  => 1,
				'layers'  => array(
					array(
						'id'   => 'base',
						'kind' => 'image',
					),
					array(
						'id'   => 'layer-empty',
						'kind' => 'text',
						'text' => array( 'text' => "   \n " ),
					),
				),
			)
		);

		$this->assertSame( 'raster', $recipe['layers'][1]['kind'] );
		$this->assertArrayNotHasKey( 'text', $recipe['layers'][1] );
	}

	/**
	 * A malformed source falls back field by field rather than being refused.
	 *
	 * @covers ::lienzo_validate_text_source
	 */
	public function test_text_source_falls_back_on_bad_fields() {
		$source = lienzo_validate_text_source(
			array(
				'text'   => "ab\x07c",
				'size'   => 'huge',
				'colour' => 'red',
			)
		);

		$this->assertSame( 'abc', $source['text'] );
		$this->assertSame( 72.0, $source['size'] );
		$this->assertSame( '#000000', $source['colour'] );
		$this->assertSame( 'sans-serif', $source['family'] );
		$this->assertFalse( $source['bold'] );
		$this->assertSame( 0.0, $source['strokeWidth'] );

		$this->assertNull( lienzo_validate_text_source( 'not an array' ) );
		$this->assertNull( lienzo_validate_text_source( array( 'size' => 12 ) ) );
	}
}
