=== AllTerrain Photo Editor for OpenStation ===
Contributors: allterraindeveloper
Tags: image editor, media, photo, layers, filters
Requires at least: 6.0
Requires Plugins: desktop-mode
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A small painting studio inside WordPress. Brushes, layers and filters, straight in the Media Library.

== Description ==

WordPress has shipped the same image editor since 2008: rotate, flip, crop, scale. AllTerrain Photo Editor adds everything that was missing.

It is a real editor. You can adjust exposure and colour while watching a live histogram, paint with brushes that have shape and softness, select an area and paint only inside it, stack layers, drag a photo in from the Media Library, and type text directly onto the canvas.

= Adjust =

* Exposure, contrast, temperature, tint, saturation, vibrance and hue
* Curves, on RGB and on each channel separately
* Levels, with black point, white point and gamma
* Sharpen, blur, vignette and grain
* A live histogram that follows the slider as you drag it
* Presets, so a look you like can be reused on the next photo

= Paint =

Eighteen tools on a two column rail, grouped the way you would expect:

* Move and transform, with handles that scale, rotate and snap
* Select as a rectangle, an ellipse, a freeform lasso or a polygon
* A magnetic lasso that snaps to the edge you are tracing, so trace roughly round a subject and the outline finds its boundary for you
* Build a selection up: add to it, subtract from it, or keep only the overlap, from the options bar or by holding Shift, Alt or both
* Step a selection back when an addition went the wrong way, with Cmd/Ctrl+Shift+D or the Step back button — which also brings back a selection you dropped
* Magic wand, which selects the region around the colour you click
* Crop, with aspect presets
* Eyedropper, brush, eraser, paint bucket and gradient
* Retouch: blur, sharpen, smudge and heal
* Clone stamp, with an Alt click to set the sample point
* Dodge, burn, desaturate and saturate
* History brush, which paints the original image back
* Shapes, paths and text
* Hand and zoom, plus a quick mask and a full screen mode

Brushes have a size, a shape and a hardness, and the cursor is a ring the real size of the brush against the image, so you are never guessing at how much a stroke will cover.

= Layers =

Text, pasted pixels and dropped photos each arrive as their own layer, so you can move one without disturbing the others, reorder them, hide them or throw one away. Undo reaches painted pixels too, not only settings.

= Drag a photo in =

Drag an image from the Media Library, from the desktop, or from your computer straight onto the canvas. It lands as a new layer, where you dropped it, scaled to fit.

= Open a product photo without hunting for it =

Drag a WooCommerce product onto the AllTerrain Photo Editor icon and its photo opens straight away, skipping the picker. Any post with a picture works the same way, and so does dropping a photo itself.

When you save, AllTerrain Photo Editor asks whether the product should start using the edit. Either answer leaves your original where it is: choosing to update writes a new copy and points the product at it, so going back is a matter of pointing it at the old one again.

= Your originals are never touched =

Saving always writes a new attachment and records the edit as a recipe: the list of adjustments, not the pixels. Re-opening a photo restores every slider exactly where you left it and renders again from the original. Editing the same image ten times costs nothing in quality, because every render is a first generation one.

= Fast, because of how it renders =

Adjustments are composed into a single GPU pass rather than chained one after another. That is not only quicker. It also means the image is quantised once instead of once per adjustment, which is the difference between a clean gradient and visible banding in a sky.

== Requires OpenStation ==

AllTerrain Photo Editor runs inside the OpenStation plugin (previously called Desktop Mode), which turns wp-admin into a desktop, and needs it installed. That is not decoration: the rendering engine is OpenStation's. AllTerrain Photo Editor ships none of its own and borrows the desktop's, which is why this plugin is a few tens of kilobytes rather than the best part of a megabyte, and why your browser only ever downloads one copy.

Install and activate OpenStation first. Without it, AllTerrain Photo Editor tells you what it needs and otherwise stays out of the way.

= Where it opens =

With the desktop switched on, AllTerrain Photo Editor is a real window: chrome you can move and resize, an icon on the wallpaper, and drag and drop between windows.

The desktop is a per-user preference, and with it switched off AllTerrain Photo Editor still opens — under Media → Edit Photos, and over the top of whatever you were doing when you choose "Edit with AllTerrain Photo Editor" in the Media Library, in the media picker or on an image block. Every tool is the same one. What you do not get is the window, the wallpaper icon and dragging photos between windows.

== Installation ==

1. Install and activate the OpenStation plugin.
2. Upload the `allterrain-photo-editor` folder to `/wp-content/plugins/`, or install it from the Plugins screen.
3. Activate AllTerrain Photo Editor through the Plugins menu.
4. Open AllTerrain Photo Editor from the dock or the desktop, or choose "Edit with AllTerrain Photo Editor" on any image in the Media Library. With the desktop switched off, use Media → Edit Photos.

== Frequently Asked Questions ==

= Does this change my original images? =

No. Every save creates a new attachment and links it back to the original. Your original file is never rewritten.

= Do I need ImageMagick or GD? =

Not for the editing. All of it happens in your browser using WebGL. WordPress still uses its normal image library to generate the thumbnail sizes of whatever you save.

= Which browsers are supported? =

Any browser with WebGL 2, which is every current version of Chrome, Firefox, Safari and Edge.

= My images are served from a CDN. Will it work? =

Yes. When a CDN does not send the CORS headers a GPU canvas requires, AllTerrain Photo Editor streams the original through your own site instead.

= Why is GIF not supported? =

Rendering an animated GIF through a canvas silently flattens it to a single frame. Rather than quietly destroy the animation, AllTerrain Photo Editor does not offer to edit them. The photo picker leaves them out for the same reason, and tells you how many it left out, so a library of GIFs does not read as an empty one.

= Are brush strokes stored in the recipe? =

No, and the difference decides what re-opening does. Adjustments, crops and transforms are instructions: they are stored in the recipe, replayed over your original, and come back as sliders you can still move. Painted, pasted and dropped pixels are not instructions, so they are baked into the file you save.

That makes a painted save its own original. Re-open it and you see exactly the pixels you saved, with the sliders back at zero, ready to be edited again from there. The editor says so when you save, rather than letting you find out later.

= Can I use it with the desktop switched off? =

Yes. It opens under Media → Edit Photos, and as an overlay when you choose "Edit with AllTerrain Photo Editor" from the Media Library, the media picker or an image block. Every tool is the same one; what you do not get is the movable window, the wallpaper icon and dragging photos between windows. OpenStation still has to be installed, because the rendering engine comes from it.

= Does it edit in real colour? =

There is a Light switch at the top of the Adjustments panel. Left on sRGB it behaves like WordPress and like most browser editors: the maths is done on the stored values. Switched to Linear, exposure is applied to *light* instead, so a stop up or down lands where a camera would have put it rather than where the file's encoding does. Existing edits are unaffected; the setting is saved with each one.

== Screenshots ==

1. The editor as a desktop window: the tool rail on the left, the layer stack, a live histogram and every adjustment on the right, and the magnetic lasso following the edge of a plate.
2. Text typed straight onto the canvas, as a layer of its own, with a transform box to move, scale and rotate it.
3. Curves, on RGB or on one channel at a time, against the photo being graded — the editor in its own window on the OpenStation desktop.
4. A soft round brush, its size, hardness and opacity on the options bar, over levels, sharpening, vignette and grain.

== Third-party libraries ==

This plugin bundles no third-party libraries and makes no external or CDN requests.

Rendering uses PixiJS (MIT), which is bundled by the OpenStation plugin and served from your own server. AllTerrain Photo Editor asks OpenStation for it rather than shipping a second copy: that keeps this plugin small, and two instances of the same rendering library on one page share GPU resources through globals, where tearing one down can break the other.

== Changelog ==

= 1.1.0 =
* With thanks to WP103 (https://www.youtube.com/@wordpress103) for the feedback that drove this release: the text that could not be edited again, the eraser that ignored its opacity, and the saved copy that could not be reopened for editing.
* Text can be edited after it is placed. Click it with the Text tool, double-click it with Transform, or press the T beside it in the Layers panel; the caret comes back over the words with the font and colour they were set in. Emptying the text removes the layer.
* Brush and eraser opacity now applies to the whole stroke, not to every dab. An eraser at 20% takes 20% of what is under it however slowly you drag; it used to reach 100% within a second because overlapping dabs compounded.
* Saved copies open again with their layers. Painted, pasted and dropped layers travel with the save as files of their own, and text layers are drawn again from their words, so re-opening a copy shows the layer stack you left rather than a flattened image. Only a layer too large for the site to accept still bakes in, and the editor says so.
* Layers have an Opacity slider in the Layers panel, for the layer you are working on; a faded layer shows its percentage beside its name.
* Changing the colour, font or weight while typing no longer finishes the text: the options bar restyles the caret live.
* The Brush panel's Retouching and Fill headings are panel subheadings again, holding their controls, instead of full-size shell sections over an empty box.
* Runs as an OpenStation App Framework app on a shell that has the framework, and registers its window directly on one that does not.

= 1.0.1
* Clone Stamp: the sample source is now marked on the canvas and follows your brush while painting; holding Alt shows a source-picker cursor.

= 1.0.0 =
* First release.
* The photo picker loads as you scroll, instead of waiting for a Load more button.
* The picker says how many images it cannot open, so a library of animated GIFs no longer reads as an empty one.
* Editing from the media picker and pressing Insert now inserts the copy you just saved, not the photograph you started with.
* The photo picker's captions, counts and placeholders follow the editor's theme instead of WordPress's light-page greys, which were close to unreadable on the dark panel.
* Selections can be stepped back — Cmd/Ctrl+Shift+D, or the Step back button — which takes back an addition made in the wrong mode and brings back a selection you dropped.
* Opens with the desktop switched off as well as in a window: an editor page under Media, and an overlay from the Media Library, the media picker and the image block.
* Magic wand and paint bucket rewritten to walk runs rather than pixels — a twenty-megapixel photo answers in a fifth of a second instead of a few seconds.
* The wand traces the holes in a region instead of selecting through them.
* Optional linear-light exposure, where a stop is a doubling of light rather than of a stored value.
* Sixteen bits per channel through the layer composite where the browser allows it.
* Renders on WebGPU where a site asks for it, as well as WebGL.
* Exposure, contrast, temperature, tint, saturation, vibrance and hue, composed into a single GPU pass.
* Curves and levels, baked into one lookup table.
* Sharpen, blur, vignette and grain.
* Live RGB and luma histogram.
* Crop, straighten, rotate and flip, with the canvas independent of the image sitting on it.
* Layers, with reorder, hide and delete.
* Selections as a rectangle, an ellipse, a lasso, a polygon or a magnetic lasso, plus a magic wand.
* The magnetic lasso finds the shortest path along the edges of the photograph itself, taking the gradient on each colour channel rather than on brightness, so it snaps to a boundary between two colours of the same lightness as readily as to a light one against a dark.
* Its anchor points are marked as you trace, hollow where the tool placed one for you and solid where you clicked, so it is always clear how much of the outline has stopped moving.
* Selection modes: new, add, subtract and intersect, from the options bar or with Shift, Alt and Shift+Alt.
* One top bar instead of two, and a third the height: 31 pixels where the chrome used to take about 90.
* The picture no longer flickers while a window is being resized.
* The tool rail and the sidebar meet the top bar, instead of sitting below a strip of background.
* The top bar is the same height for every tool, so switching tools no longer shifts the picture.
* The fields in the top bar sit inside it, instead of hanging out of the bottom and being clipped by its edge.
* The colour palette's swatches are round again, and all six of a row fit the popover rather than the last falling off its edge.
* Dragging a curve point and letting go outside the graph now drops it, instead of leaving it stuck to the pointer.
* Fixed "Edit with AllTerrain Photo Editor" in the media modal doing nothing inside the desktop: the shell was not listening for the request.
* Media → Edit Photos is no longer offered while the desktop is running, where it could only ever lead to a page saying the editor is elsewhere. Open AllTerrain Photo Editor from the dock or its desktop icon.
* Brushes, eraser, paint bucket, gradient, shapes, paths and text typed on the canvas.
* Retouching: blur, sharpen, smudge, heal and clone stamp.
* Dodge, burn, desaturate and saturate.
* History brush, quick mask and full screen.
* Copy and paste that respects the shape you selected rather than its bounding box.
* Drag and drop from the Media Library, the desktop or your computer.
* Undo and redo that reach painted pixels, not only settings.
* Presets.
* Non-destructive saving, with the edit stored as a re-openable recipe.
