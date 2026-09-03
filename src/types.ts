/**
 * Shared types for the configuration and REST payloads PHP hands the browser.
 */

/** Bounds and rest position of a single adjustment, mirrored from `lienzo_op_schema()`. */
export interface OpSpec {
	min: number;
	max: number;
	default: number;
}

/** The adjustment table, keyed by op type. */
export type OpSchema = Record< string, OpSpec >;

/**
 * Which rendering backend to ask Pixi for.
 *
 * Declared here rather than imported from the engine so the config type stays free of
 * engine imports -- this file is the contract with PHP and nothing else.
 */
export type RendererBackend = 'auto' | 'webgl' | 'webgpu';

/** `window.lienzoConfig`, localized by `lienzo_get_config()`. */
export interface LienzoConfig {
	version: string;
	restUrl: string;
	restNonce: string;
	pluginUrl: string;
	mediaUrl: string;
	supportedMimes: string[];
	maxRenderPixels: number;
	/**
	 * The raster a boolean selection is worked out on, in pixels.
	 *
	 * Adding, subtracting and intersecting go through a mask round trip, and this is
	 * how precise the combined outline is on a document larger than it. Filterable in
	 * PHP through `lienzo_max_selection_pixels`.
	 */
	maxSelectionPixels: number;
	/**
	 * The magnetic lasso's edge field, in pixels.
	 *
	 * Past this the field is built at a stride, which is what keeps the pause before a
	 * trace on a fifty-megapixel scan from being a whole second. Filterable in PHP
	 * through `lienzo_max_edge_pixels`.
	 */
	maxEdgePixels: number;
	canUpload: boolean;
	/**
	 * The largest file, in bytes, the render endpoint accepts.
	 *
	 * A saved layer larger than this would be refused, so the editor leaves every
	 * layer out of that save and lets it flatten rather than fail. Filterable in PHP
	 * through `lienzo_max_upload_bytes`.
	 */
	maxUploadBytes: number;
	/**
	 * Whether OpenStation is active *for this user*, not merely installed.
	 *
	 * OpenStation is a per-user preference, so the plugin being active says nothing
	 * about whether this person is looking at a desktop. The controls use it to decide
	 * which house style to fall back to when a component is unavailable.
	 */
	desktopMode: boolean;
	/**
	 * Which rendering backend to ask for.
	 *
	 * `webgl` by default. The adjustment shader ships both a GLSL and a WGSL program,
	 * so `auto` -- WebGPU where the browser has it -- is a supported configuration
	 * rather than a way of quietly losing every adjustment. Filterable in PHP through
	 * `lienzo_renderer_backend`.
	 */
	renderer: RendererBackend;
	/**
	 * The classic-admin editor page.
	 *
	 * Where an "Edit with AllTerrain Photo Editor" control goes when there is no shell on the page to
	 * open a window in.
	 */
	editorUrl: string;
	/**
	 * Where OpenStation's PixiJS lives.
	 *
	 * AllTerrain Photo Editor ships none of its own. Inside the shell the module registry answers first
	 * and this is never used; on a classic admin screen there is no registry, and this
	 * is OpenStation's own file. Empty when it could not be resolved.
	 */
	pixiUrl: string;
	schema: OpSchema;
}

/** Response body of `GET lienzo/v1/media/<id>`. */
export interface MediaPayload {
	id: number;
	sourceId: number;
	mime: string;
	url: string;
	sourceUrl: string;
	width: number;
	height: number;
	title: string;
	alt: string;
	recipe: import('./model/recipe').Recipe;
	/**
	 * Where each saved raster layer's pixels can be fetched, keyed by layer id.
	 *
	 * Present when this attachment was saved with its layers. The URLs are this
	 * plugin's own routes and need the REST nonce.
	 */
	layers?: Record< string, string >;
	canSave: boolean;
	schema: OpSchema;
}

/**
 * Response body of `POST lienzo/v1/media/<id>/render`.
 *
 * `width` and `height` are what the site actually stored, which is not necessarily
 * what was uploaded: WordPress applies `big_image_size_threshold` to every upload
 * and silently downscales past it.
 */
export interface SaveResult {
	/**
	 * Whether painted, pasted or dropped layers were baked into the saved file.
	 *
	 * Ordinarily they travel with the save as files of their own, and the copy opens
	 * again with every layer in place. When they could not -- too large for this site
	 * to accept -- the save becomes its own origin: re-opening it shows the pixels that
	 * were saved, with the adjustments already in them and the sliders back at zero.
	 */
	flattened: boolean;
	id: number;
	sourceId: number;
	url: string;
	width: number;
	height: number;
	mime: string;
	recipe: import('./model/recipe').Recipe;
}

/**
 * A saved look.
 *
 * Deliberately not a whole recipe: geometry and the source attachment are stripped
 * server-side, because a crop is a statement about one particular frame and would
 * be nonsense applied to another.
 */
export interface Preset {
	id: string;
	name: string;
	recipe: {
		version: number;
		ops: import('./model/recipe').Op[];
		curves: import('./engine/lut').Curves;
		levels: import('./engine/lut').Levels;
		/**
		 * The space the look was made in.
		 *
		 * Part of the look, not of the document: it decides what an exposure op means,
		 * so a preset saved in linear light and replayed in sRGB is a different look.
		 * Absent on presets saved before the field existed, which were all sRGB.
		 */
		space?: import('./model/recipe').WorkingSpace;
	};
}

/**
 * The post an image was opened from, when it was opened from one.
 *
 * Carried so the save step can offer to put the edit back where it came from. A
 * product's featured image and the third image of its gallery are both "the
 * product's image", and updating them is not the same operation -- which is why the
 * slot travels with the id.
 */
export interface PostOrigin {
	postId: number;
	postTitle: string;
	postType: string;
	/** Singular label, so the editor can name the thing rather than its slug. */
	postTypeLabel: string;
	/** Where the image sits on the post: 'thumbnail', 'gallery', or '' for neither. */
	slot: string;
	/** Whether this user may actually write the change back. */
	canAttach: boolean;
}

/** What the post-image lookup answers. */
export interface PostImage extends PostOrigin {
	attachmentId: number;
}
