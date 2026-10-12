/**
 * Dropping something onto the AllTerrain Photo Editor icon.
 *
 * Drag a photo -- or a product, or any post with a picture -- onto the wallpaper icon
 * and it opens straight in the editor. That is the whole point: someone who already
 * knows which image they want should not have to open an empty editor and then find
 * it again in a grid of four thousand.
 *
 * The shell owns the actual drop target on every tile, because a tile has to reject
 * foreign payloads rather than let them fall through to the wallpaper underneath.
 * Registering a target on the icon directly is silently displaced. Instead the shell
 * consults a handler registry for its accept predicate, its hover chip and its drop --
 * which is what this registers into.
 */

import { __ } from '../../i18n';
import { toast } from '../../platform';
import { desktop, state, WINDOW_ID } from './desktop-api';
import type { TilePayloadContext, TilePayloadHandler } from './desktop-api';
import {
	canResolveDesktopImage,
	readDesktopImage,
	resolveDesktopImage,
} from './image-payload';
import type { DesktopImage } from './image-payload';
import { openInDesktop, openPostInDesktop } from './open-window';

/**
 * Payload types worth accepting. Anything else keeps the shell's rejection.
 *
 * `desktop-file` is a tile dragged off the wallpaper itself -- a photo saved to the
 * desktop, a Media Library item pinned there, a product placed there. It is the drag
 * people try first, and the one the icon used to refuse.
 */
const ACCEPTED = [ 'attachment', 'shortcut', 'desktop-file' ];

/**
 * Whether a tile is ours.
 *
 * Deliberately narrow. Handlers sharing a payload type resolve first-applies-wins, so
 * one that matched every placement would shadow every handler registered after it --
 * including other plugins' icons.
 *
 * @param ctx The tile under the cursor.
 */
function isLienzoIcon( ctx: TilePayloadContext ): boolean {
	return WINDOW_ID === ctx.placement?.file?.ref;
}

/**
 * An attachment id out of a drag payload, when it carries one.
 *
 * Media tiles drag as `attachment` with the id in `ref`; a media entity dragged from
 * the site window arrives as a `shortcut` whose `kind` says what the `ref` means. Both
 * spellings are read rather than assumed, because the shape depends on the source and
 * guessing wrong is a drop that silently does nothing.
 *
 * @param data Payload data.
 */
export function attachmentFrom( data: Record< string, unknown > ): number {
	const kind = String( data.kind ?? '' );

	if ( '' !== kind && 'attachment' !== kind && 'media' !== kind ) {
		return 0;
	}

	return Number( data.ref ?? data.id ?? data.mediaId ?? 0 ) || 0;
}

/**
 * A post id out of a drag payload, when it carries one.
 *
 * Every post type drags as `kind: 'post'` -- a product, a page and a post are one
 * file type as far as the desktop is concerned -- so which one it is does not matter
 * here. The server decides whether that post has an image worth opening.
 *
 * @param data Payload data.
 */
export function postFrom( data: Record< string, unknown > ): number {
	if ( 'post' !== String( data.kind ?? '' ) ) {
		return 0;
	}

	return Number( data.ref ?? data.id ?? 0 ) || 0;
}

/**
 * The image a payload carries, when it carries one.
 *
 * A wallpaper tile is read the way the editor window reads it, so a photo that opens
 * when dropped on the window opens when dropped on the icon. The other two types keep
 * their lenient reading: a site-window shortcut may name its id without a `kind`.
 *
 * @param type Payload type.
 * @param data Payload data.
 */
export function imageFrom(
	type: string,
	data: Record< string, unknown >
): DesktopImage | null {
	if ( 'desktop-file' === type ) {
		return readDesktopImage( { type, data } );
	}

	const id = attachmentFrom( data );

	return id ? { kind: 'attachment', id } : null;
}

/**
 * A post id out of a payload, when it carries one.
 *
 * A post placed on the wallpaper drags as a `desktop-file` whose placement says
 * `post`; one dragged out of the site window is a `shortcut` saying the same thing.
 *
 * @param type Payload type.
 * @param data Payload data.
 */
export function droppedPostFrom( type: string, data: Record< string, unknown > ): number {
	if ( 'desktop-file' !== type ) {
		return postFrom( data );
	}

	const file = ( data.placement as { file?: Record< string, unknown > } | undefined )?.file;

	return file ? postFrom( { kind: file.type, ref: file.ref } ) : 0;
}

/**
 * Whether the icon should light up for a payload.
 *
 * @param type Payload type.
 * @param data Payload data.
 */
export function acceptsDrop( type: string, data: Record< string, unknown > ): boolean {
	const image = imageFrom( type, data );

	if ( image ) {
		return canResolveDesktopImage( image );
	}

	return !! droppedPostFrom( type, data );
}

/**
 * Opens whatever was dropped.
 *
 * @param type Payload type.
 * @param data Payload data.
 */
async function openDropped( type: string, data: Record< string, unknown > ): Promise< void > {
	const image = imageFrom( type, data );

	if ( image ) {
		try {
			const { attachmentId } = await resolveDesktopImage( image );

			openInDesktop( attachmentId );
		} catch ( error ) {
			toast(
				error instanceof Error ? error.message : __( 'That image could not be opened.' ),
				'error'
			);
		}

		return;
	}

	const post = droppedPostFrom( type, data );

	if ( post ) {
		await openPostInDesktop( post );
	}
}

/**
 * The handler for one payload type.
 *
 * One per type because the shell asks `accept()` about the data alone, and the same
 * data means different things under different types.
 *
 * @param type Payload type.
 */
function handlerFor( type: string ): TilePayloadHandler {
	return {
		appliesTo: isLienzoIcon,
		accept: ( data ) => acceptsDrop( type, data ),
		acceptLabel: __( 'Open in AllTerrain Photo Editor' ),
		onDrop: ( session ) => void openDropped( type, session.payload.data ?? {} ),
	};
}

/**
 * Lets the AllTerrain Photo Editor icon accept photos and posts.
 *
 * Idempotent: registering twice would put two handlers on the same tile for the same
 * payload type, and the first would win every time while the second leaked.
 */
export function registerIconDrop(): void {
	const files = desktop()?.files;
	const shared = state();

	if ( ! files?.registerTilePayloadHandler || shared.iconDropRegistered ) {
		return;
	}

	shared.iconDropRegistered = true;

	for ( const type of ACCEPTED ) {
		files.registerTilePayloadHandler( type, handlerFor( type ) );
	}
}
