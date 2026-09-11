https://github.com/user-attachments/assets/ed057f67-54c8-495e-a8f1-88437d278800

# AllTerrain Photo Editor.

A non-destructive, GPU-accelerated image editor for the WordPress media library.

WordPress has shipped the same image editor since 2008 — rotate, flip, crop, scale — and
`wp-admin/includes/image-edit.php` renders its toolbar as hardcoded `onclick=` markup with no
action hooks inside, so it cannot be extended, only replaced. AllTerrain Photo Editor replaces it.

## What it does

Colour and tone with a live per-frame histogram; crop, straighten, rotate and flip; curves and
levels; sharpen, blur, vignette and grain; saved presets. Then a layer stack, five selection shapes
that add, subtract and intersect — including a **magnetic lasso** that snaps to the boundary you are
tracing — brushes, a magic wand, retouching and toning brushes, a clone stamp, gradients, shapes,
paths, and text typed directly on the canvas. Undo and redo reach painted pixels, not only settings.

Adjustments stay non-destructive: a save always writes a *new* attachment and stores the edit as a
re-openable recipe, so the original file is never rewritten and repeated edits never compound.

AllTerrain Photo Editor is an **OpenStation application** and requires it: the rendering library is OpenStation's, and
AllTerrain Photo Editor ships none. At its best it runs as a **native window** in the shell — the dock, a desktop
icon, a double-clicked image, the Media Library row action, the attachment screen, the media modal
and the `core/image` block toolbar all open that same window. For a user who has switched desktop
mode *off*, it opens as an **admin page under Media** and as an **overlay** instead.

## Design in one page

**JavaScript does the pixels; PHP only stores them.** There is no Imagick or GD dependency for
adjustments. The browser renders via WebGL, and the server's only job is to accept the result and
create an attachment.

**One editor, one surface.** The editor is a single mountable component:

```js
const editor = window.lienzo.mount( element, {
    attachmentId: 123,
    host: 'page',            // 'page' | 'modal' | 'window' — affects chrome only
    onClose: () => {},
} );
// editor.getRecipe() / editor.setRecipe() / editor.destroy()
```

Three things call it and no more: the OpenStation native window, the admin page, and the overlay.
The row action, the media modal button and the block editor button call `openEditor()`, which picks
between them — the window when the shell is on the page to host one, the overlay when desktop mode
is switched off — rather than each having its own idea of where an editor should appear. Nothing
outside `src/api.ts` touches Pixi, the recipe model, or REST.

**One GPU pass, not six.** Exposure, contrast, temperature, tint, saturation and hue are all affine
transforms of RGB, so they are multiplied into a single colour matrix and applied in one shader
pass. Chaining six Pixi filters would write six 8-bit render targets and quantise six times, which
shows up as banding in a sky. Vibrance is the exception — it scales saturation by how saturated a
pixel already is, which is not linear — so it travels as a separate uniform and the same shader
applies it immediately after.

**Non-destructive, where non-destructive means something.** A save writes a *new* attachment and
records the edit as a recipe: the list of adjustments, not the pixels. Re-opening loads the
*original's* pixels plus the recipe, so every render is first-generation and repeated edits never
compound quantisation loss.

That only holds while the recipe describes the whole image. A text layer does: it carries the words
it was typed as and the style they were set in, and is drawn again from those on open — which is also
what makes it retypeable. A painted, pasted or dropped layer is pixels, and no replay of a recipe over
the original brings them back, so **a save carries them along**: each raster layer is encoded as a PNG
of its own and stored beside the copy under `uploads/allterrain-photo-editor/layers/<id>/`, the recipe
names it, and re-opening fetches the pixels back through the plugin's own route. Only when a layer
cannot come — too large for the site to accept — does the save become **its own origin**: no source
pointer, no stored recipe, and re-opening shows the flattened pixels with the sliders at zero.
Getting this wrong is subtle and was: an earlier save pointed back at the original and stored a
recipe naming a raster layer whose pixels lived nowhere, so the file in the library was correct and
re-opening it showed the original with an empty layer where the painting had been.
`lienzo_recipe_is_reproducible()` is the one place that decides, and it is told which layers made it.

**Resolution independence is what makes the preview honest.** The on-screen sprite is scaled to fit
the viewport and Pixi runs filters at rendered size, so dragging a slider on a 6000px photo costs
what a thumbnail costs. Saving re-runs the identical filter against the unscaled texture. The two
agree because every colour op is per-pixel maths with no spatial radius. *An op with a pixel
radius — blur, sharpen, grain — breaks that and must scale its radius with the render size.*

## The sidebar is a panel registry

Every tool in the sidebar — histogram, adjustments, output, image info — is a *registered panel*,
not markup baked into the editor. Each collapses independently and remembers that; the `⋯` picker
chooses which are on screen at all.

```js
window.lienzo.registerPanel( {
    id: 'layers',
    title: 'Layers',
    order: 15,
    defaultCollapsed: false,
    render( host, ctx ) {
        // ctx.payload, ctx.getRecipe(), ctx.setOp(), ctx.setOutput(),
        // ctx.onHistogram(), ctx.onRecipeChange()
        return () => {/* teardown */};
    },
} );
```

Panels appear immediately in an already-open editor, so registration can happen at any time.
Registering an existing `id` replaces it — that is how a plugin overrides a built-in rather than
only adding beside it.

The built-ins in `src/ui/built-in-panels.ts` use exactly this API; there is no privileged path. That
is the point: **if Layers or Curves cannot be built against `PanelContext`, the context is wrong and
should be widened rather than bypassed.**

Accordion rather than tabs, deliberately: a histogram is something you watch *while* dragging a
slider, so putting it behind a tab switch would break the one workflow it exists for. Anything you
would rather not see gets switched off in the picker instead.

## One bar across the top

The name of the file, the options for the current tool and the document's actions used to be a
labelled toolbar stacked on top of a labelled options bar: two rows, about ninety pixels, spent above
a photograph on saying what the photograph is called and then, underneath, what the current tool
does. It is **one 31-pixel row** now.

Half of that came from merging the rows; the other half came from the row admitting it was mostly
air. Every control in the bar is exactly `--lz-bar-control` tall — one custom property, declared on
`.lz-topbar` and applied to buttons, glyphs, segments and form controls alike — because a 29px button
beside a 26px glyph beside a 27px segment is how a row needs forty-seven pixels to hold twenty-four
pixels of content.

The height is **fixed, not a minimum**. The bar's contents change with the active tool, and letting
the tallest of them decide meant one height for the marquee and another for the brush — so every tool
change nudged the canvas and the picture jumped under the pointer. Three declarations make that
stick, and all three are load-bearing: `box-sizing: border-box`, because WordPress's admin sets it
globally and a page outside the admin does not, so anything counting the padding is a different
number in the two places; `block-size` rather than `min-block-size`; and `min-block-size: 0`, because
a flex item's minimum defaults to its content and a stated height is otherwise only ever a floor.
Capping the controls is what keeps the fixed height from clipping anything, and `overflow-y: hidden`
on the options is the backstop for a control nobody anticipated.

The labels went too, where the control already said what it was. "Selection mode" in front of four
symbols and "Shape" in front of the word "Rectangle" are a hundred pixels each of a one-row bar spent
naming the obvious; both are clipped rather than removed, so the group keeps its `aria-label` and a
screen reader loses nothing.

Four actions are glyphs now (recentre, undo, redo, compare), the two used rarely are behind a `⋯`
overflow (export, reset, and close where the host wants one), and only **Save a copy** keeps its
words. The overflow's items are built on every open rather than captured once, and a command that
would do nothing is left out rather than greyed — a disabled control in a row is a placeholder
holding its position, but a disabled row in a menu of three is a shorter menu with a gap in it.

The row never wraps. Wrapping is what a flex bar does instead of overflowing, and it would silently
undo the whole point the first time a tool had one control too many for the window; the options
scroll sideways within their own slot instead, the hint truncates first with the whole of it in its
tooltip, and the title drops out entirely below a `@container` width of 620px. A container query
rather than a media query because the editor is as often an OpenStation window as a whole page, so
how much room the bar has is a fact about the window and not about the screen it is on.

## Eighteen tools, five mechanisms

The rail on the leading edge holds the tools, two columns wide and grouped by what they do to the
image. Exactly one owns the stage at a time, because they all want the same pointer events on the
same surface — `StageTools` routes every gesture through one `toCanvas()`, so a brush stroke and a
selection rectangle cannot disagree about where the pointer is.

| Group | Tools | Keys |
|---|---|---|
| Select | Move & transform, Select (rectangle / ellipse / freeform / polygon / magnetic, in new / add / subtract / intersect), Magic wand, Crop | `V` `M` `W` `C` |
| Retouch | Eyedropper, Retouch (blur / sharpen / smudge / heal), Clone stamp, Dodge & burn (dodge / burn / desaturate / saturate) | `I` `R` `S` `O` |
| Paint | Brush, History brush, Eraser, Fill | `B` `Y` `E` `G` |
| Draw | Gradient, Shape (rectangle / rounded / ellipse / line / triangle / star), Path, Text | `N` `U` `P` `T` |
| View | Hand, Zoom | `H` `Z` |

`X` swaps the foreground and background swatches, `D` restores black on white — the swatches sit at
the foot of the rail because almost every tool reads one of them. `Q` toggles the quick mask, which
fills the selection in translucent red instead of outlining it: marching ants say where an edge is,
a mask says how soft it is, which an outline cannot show at all. `F` fills the screen — via the
Fullscreen API when it is allowed, and a CSS class when it is not, because inside an OpenStation
window the request is usually refused and an editor that silently ignores a keypress is worse than
one that just grows. `⋯` lists every tool by name with its shortcut, since eighteen glyphs are quick
to click and slow to learn.

Two Photoshop slots are deliberately absent: the frame tool, which places an empty image
placeholder and has nothing to do in a library editor, and the separate lasso slot — freeform,
polygon and magnetic are shapes of the one Select tool, chosen in its options bar, which is where
every other selection setting already lives. Photoshop splits those three across a flyout you have
to hold the mouse down on; they differ by one setting each and belong in the row that already holds
every other selection setting.

### A selection is built, not drawn

The shapes anyone actually wants are almost never one rectangle. A subject is a wand click plus two
lasso corrections; a vignette mask is an ellipse minus a smaller one. So both selection tools lead
with the same four-way picker — **New**, **Add**, **Subtract**, **Intersect** — and both read the
modifiers everyone already has in their fingers: **Shift** adds, **Alt** subtracts, **Shift+Alt**
intersects, for one gesture, without disturbing what the picker says.

The mode is fixed when the gesture *starts*, not when it ends. Modifier keys are usually let go of
before the mouse button is, and a subtraction that turned into a replacement on release would be the
most destructive bug this tool could have.

Adding, subtracting and intersecting are set operations on regions, and the editor stores regions as
closed paths — so the honest implementation is a path clipper, several hundred lines of numerically
delicate geometry that has to agree with the rasteriser about every edge case it gets wrong. There is
already a round trip that does not: `buildSelectionMask()` turns a path into pixels and `traceMask()`
turns pixels back into paths, exactly, because the tracer walks pixel *corners*. Compositing two
masks is then the whole of the boolean algebra — `source-over`, `destination-out`, `source-in`, three
keywords the browser has implemented for twenty years — and the result arrives in the one format the
outline renderer, the mask rasteriser and the brush clipper already speak.

It runs once per completed gesture, never per pointer move, and the working raster is capped at four
megapixels: nobody can see a boundary at a finer resolution than the six hundred vertices the tracer
keeps anyway, and uncapped, one intersection on a fifty-megapixel scan would allocate two hundred
megabytes to answer a question four hundred points long. A default rather than a rule —
`lienzo_max_selection_pixels` moves it, and the number travels to the browser in the config blob
rather than being written into the module, because everything under `model/` and `engine/` is pure
and a pure function that reads a global is neither testable nor honest.

**And the marquee can be stepped back.** A selection is deliberately not on the undo stack: it
describes how someone is working rather than what the picture should look like, and an undo that went
through six marquees before reaching the brush stroke you meant would be worse than no undo at all.
But an addition made in the wrong mode is a real and common mistake, and "draw it again" is a poor
answer to it — so the marquee keeps its own history, twenty deep, reached by its own key.
Cmd/Ctrl+Shift+D, or the **Step back** button beside the modes whose mistakes it undoes. It doubles
as Photoshop's Reselect, because dropping a selection is a change like any other and stepping back
from nothing restores what was there. A step back is not itself recorded — two presses go two back,
where a step that recorded itself would ping-pong between the last two states forever.

That split is also why the marquee got cheaper rather than dearer. A drag now paints a **pending
outline** — a path attribute, in the accent colour, beside the ants of the selection it is about to
change — where it used to replace the selection on every pointer move, rasterising a canvas-sized
mask and handing it to the GPU sixty times a second. Seeing both outlines at once is the only way to
aim a subtraction, and it costs less than not seeing them did.

Two consequences worth knowing. A boolean result is always a path, whatever went in: the union of two
rectangles is not a rectangle, and storing it as one would put its corners back. And disjoint results
survive — `traceMask` calls every contour after the first a hole, but both rasterisers fill
**even-odd**, so a loop lying outside the first is filled rather than punched, which is exactly right
for two regions added without touching. `selectionBounds()` measures every contour for the same
reason: measuring only the first would crop a copy to whichever region the tracer reached first.

### The magnetic lasso follows the picture, not the pointer

![The magnetic lasso tracing the scalloped gold rim of a porcelain dish, the marching ants sitting
exactly on the boundary through every curve of it](.github/media/magnetic-lasso.png)

*Traced in one pass, roughly, at Width 20 and Frequency 40. The ants are on the gilding — through
sixteen scallops, four corners and a rim that is two pixels of gold against a pink backdrop.*

Every other selection shape records where the pointer went. The magnetic one does not: it records
where the *boundary* went, and treats the pointer as a hint about which boundary is meant. Trace
roughly round a subject and the outline snaps onto its edge as you go — six pixels of slop in the
hand, half a pixel of error in the result.

**It is a live wire, in the Mortensen–Barrett sense.** The document is convolved once into an *edge
field*: for every pixel, how much of a boundary it is and which way that boundary runs. Following an
edge is then made cheap and cutting across a flat area dear, and the outline between the last anchor
and the pointer is simply the shortest path — Dijkstra, over a graph whose weights are the
photograph.

Three decisions in the field are about photographs rather than about gradient operators:

- **The gradient is taken per channel and the strongest wins.** A red poppy against green leaves is
  a boundary anyone can see and almost none at all in luminance; a detector working on brightness
  slides straight through the flower. Three Sobels instead of one is the entire reason this snaps to
  *colour*.
- **Strength is normalised against the 99th percentile of the gradients actually present**, so "a
  strong edge" means strong *in this photograph*. A fixed divisor reads a soft-focus portrait as
  having no edges, and the wire then walks through it in straight lines. A percentile rather than the
  maximum, because one specular highlight on a chrome bumper is several times stronger than anything
  that matters and would push the whole picture into the noise.
- **Past two megapixels the field is sampled at a stride.** A fifty-megapixel scan would otherwise
  spend a second and 150MB before the first anchor, to place a boundary more precisely than the six
  hundred vertices a `Selection` keeps could record. A 20-megapixel photograph builds in 34ms. The
  ceiling is `lienzo_max_edge_pixels`, for a site that would rather pay the pause.

**The search is never restarted.** Dijkstra settles nodes in cost order, so a node settled for one
pointer position stays settled for every later one — moving the pointer expands the frontier a
little or, far more often, walks the back-pointers home for free. Only an anchor reseeds. The queue
is an array of buckets rather than a heap, because link costs are quantised to small integers and
Dial's algorithm then applies: push is an array push, pop is a pop, and nothing is ever compared. A
full reseed at the widest setting is 3ms; the frames in between are nothing.

**Anchors land on the edge, never under the pointer.** The last stretch of any wire is the hop out
to wherever the hand actually is. Pinning there is the single most visible way this tool can go
wrong — the slop is baked in permanently, and because the next wire starts from the anchor and has
to climb back onto the boundary, what you get is a *spike* out to where your hand was and straight
back. So each anchor goes to the last point genuinely on an edge, measured against the strongest
edge that particular wire found rather than a fixed number.

**Width and Frequency are read in screen pixels, not image pixels.** Both describe how precisely
someone is pointing, and that is a fact about the picture on the monitor rather than the file behind
it. Photoshop measures them in image pixels, which is why its magnetic lasso is unusable at fit zoom
on a 50-megapixel scan and twitchy at 400% on a thumbnail: one setting, two different gestures. The
conversion happens once, when the trace begins, so a zoom mid-gesture cannot change the tool under
your hand. The search box is sized to the Width *plus* the anchor spacing, because those are the two
ways the pointer gets away from the anchor and the box has to hold both — sizing it to the width
alone looks fine until a hand wobbles by most of it, and then every other frame is out of reach,
visible as a chain of straight jogs across an outline it was otherwise tracing perfectly.

**It is placed, not dragged.** Press to start; move — button held or not — to extend; press again to
pin an anchor where you want one; **Backspace** takes the last one back; **Enter**, a double-click,
or a press back on the first anchor closes it. Releasing the button does nothing at all, which is
what lets you trace a whole subject in one pass, let go halfway to reposition your hand, and carry
on. Closing on release would make a slipped finger destroy a minute of careful work.

**And the anchors are on screen, marked by how they got there.** An anchor is the only irreversible
thing the tool does while it is running: everything behind the last one is fixed until Backspace
takes it back, and only the stretch in front of it still moves with your hand. That is not something
anyone should have to infer. Small hollow squares are the ones Frequency placed; larger solid ones
in the accent colour are the ones you clicked. Two *sizes* rather than two colours, because hue is
the one channel the photograph underneath is already using — a green marker and a red one are the
same marker over the wrong picture, where a big solid square and a small hollow one stay apart over
anything.

And if there are no pixels to read — nothing loaded yet — the tool does not refuse the press. It
falls back to an ordinary freeform drag, because a tool that briefly behaves like a plainer tool is
better than a tool that does nothing.

The result is a `lasso` selection like any other, so add, subtract, intersect, the mask, the quick
mask and the clipboard all work on it unchanged. Three settings: **Width** (how far to look),
**Contrast** (how strong an edge has to be before it counts — turn it up to stop the wire being
distracted by texture), **Frequency** (how often anchors pin themselves).

Eighteen tools, but only five gestures, and each one is a single method:

- **Stroking** — brush, eraser and the retouching brushes. A stroke is interpolated into evenly
  spaced dabs, so how fast you drag does not change the result.
- **Dragging a region** — select, gradient, shape. A dashed screen-space outline follows the drag and
  the pixels are only committed on release: allocating and uploading a canvas-sized bitmap on every
  pointer move would stall a 20-megapixel document to show what an outline conveys perfectly.
- **Clicking a point** — fill, wand, eyedropper, zoom.
- **Placing a shape** — the polygon marquee, the pen path, and the magnetic lasso. No release
  finishes any of them: they are built click by click and closed with Enter, a double-click, or a
  press back on the first vertex. That is why they alone outlive the drag lifecycle, and why the
  magnetic lasso follows the pointer with no button held at all.
- **Typing on the canvas** — text, which lands as an *object* rather than as paint: each commit
  becomes its own layer, named after its words, with a texture the size of the glyphs and a transform
  that puts it where it was typed. That is what makes it movable, scalable and deletable on its own —
  none of which survives being flattened into a canvas-sized sheet alongside every brush stroke.
  Pasted pixels take the same path. Strokes go to a full-canvas sheet instead, because painting into
  an object would promote its texture to canvas size with the content re-centred, and the object
  would jump the moment a brush touched it.

  Clicking opens a caret where the glyphs will land,
  styled with the same font, size and colour the render will use and scaled to the current zoom, so
  what you type is what appears. It rasterises through the same `textCanvas()` the caret is styled
  from, which is what stops the editing surface and the output drifting apart. A `<textarea>` rather
  than a contenteditable div, for a native caret, native selection and plain text on paste.
- **Panning** — hand, which moves the view rather than the pixels.

Three shared engines do the actual work, and each is reused by several tools rather than owned by
one:

`engine/pixel-tools.ts` is the retouching engine. Blur, sharpen, smudge, heal, dodge, burn, sponge
and clone all read the pixels under a round dab, compute new ones, and blend the result back with a
soft falloff — only the middle step differs, so there is one dab routine and eight small kernels. It
is CPU code on purpose: eight GLSL programs would be eight more shaders to compile, against the
whole point of the single-pass adjustment shader. Two decisions make it fast enough to be usable:
each dab snapshots only its own *neighbourhood* (a full-document copy per dab was 67 MB twenty-five
times in one stroke — ten seconds for a single blur), and the blur is a separable running-sum pass,
so a 64-pixel kernel costs the same per pixel as a 2-pixel one. Only the dab's dirty rectangle is
uploaded back to the GPU, so the cost tracks the brush rather than the image.

`engine/paint-shapes.ts` draws gradients, shapes and text — all three as one canvas-sized bitmap
composited through the selection mask, which is what makes them three `<canvas>` draw calls instead
of three features.

Undo reaches painted pixels, and does it in one press. A recipe is a few hundred bytes, so history
snapshots it whole; a layer is 67MB, so it cannot work the same way. `model/pixel-history.ts`
therefore remembers only the 256-pixel *tiles* a stroke touched, and only the version of them that
existed beforehand — a stroke across a photo costs a few hundred kilobytes rather than the document.
Redo needs the pixels the stroke *produced*, which only exist once it has happened, so the patch is
exchanged for its opposite as it is applied: the cost is paid when someone actually undoes something
rather than on every stroke. A flood fill can legitimately touch everything, so past a cap the action
records no patch and says so, instead of restoring half a change and claiming success.

Copying respects the shape you drew. A texture can only be read as a rectangle, so the
lifted block is clipped back through the selection mask with `destination-in` — without
that, copying an ellipse or a lasso gave you its bounding box, corners and all.

`engine/brush/flood-fill.ts` is the search behind both the paint bucket and the wand, and on a
twenty-megapixel photograph the search *is* the tool. Three things keep it instant. The stack
carries **runs**, one entry per row a run spreads into, rather than one entry per pixel — the
earlier version pushed both vertical neighbours of every filled pixel, so filling a whole photo
queued forty million coordinates through a JavaScript array; the same fill now peaks at a hundred
entries and takes 41ms instead of 355ms. Matching is **memoised as it is discovered** rather than
precomputed, so a ten-pixel fill costs ten comparisons and not twenty million. And the **bounding
box travels with the region**, so the mask is rasterised at the size the fill actually reached, the
texture uploaded to the GPU is that size, and undo records that rectangle instead of offering the
whole document to a collector that would only refuse it.

`engine/magnetic/` is the edge field and the live wire above — a Sobel pass and a Dijkstra search,
with no idea that pointers, selections or an editor exist. It is handed pixels and asked for a route.

`model/selection.ts` gained `traceMask()`, and that is why the magic wand was cheap: it reuses the
paint bucket's flood fill, then traces the region into closed paths. The rest of the editor speaks
in paths, so converting once here means the outline renderer, the mask rasteriser and the brush
clipper all work unchanged.

*Every* boundary is traced, not only the outer one — a wand over a leaf selects the leaf and not the
sky showing through the holes in it. That did not cost a second selection model: a `Selection` grew
an optional `holes`, the contours are closed paths in the format the editor already speaks, and both
rasterisers fill them **even-odd**, so an inner loop punches a hole and a loop inside *that* fills
again, to any depth.

The walk is on the lattice of pixel *corners* rather than on the pixels themselves, which is what
makes it exact: the path encloses the pixels that are set instead of a version of the region eroded
by half a pixel, so rasterising the outline back reproduces the flood fill. Where two filled pixels
meet only at a corner it turns rather than crossing, because the flood fill spreads through edges
and not through corners, and an outline that disagreed would claim a pixel the fill itself refused.
Holes below four pixels are dropped and the largest sixty-three kept: a wand over foliage finds
thousands of one-pixel gaps, and past a point each is a vertex spent on something nobody can see.

Retouching reads the *composed document* rather than the layer, because the base image layer is not
canvas-aligned: reading it directly would blur the wrong pixels the moment the image had been moved.
Results land on a raster layer above the image, exactly like a brush stroke, so the original pixels
are never touched. Their extent is in canvas pixels, so a wide blur on a 5000-pixel photo is
invisible at fit zoom and obvious at 100% — that is arithmetic, not a bug.

## An OpenStation application

AllTerrain Photo Editor requires OpenStation — previously called Desktop Mode — and the requirement is load-bearing
rather than ceremonial: **the rendering library is OpenStation's**. AllTerrain Photo Editor ships no PixiJS at all,
which keeps it a few tens of kilobytes instead of eight hundred and keeps exactly one Pixi on the
page. Two Pixi 8 instances share GPU resource registries through globals, so one copy is not merely
smaller but safer. With OpenStation absent there is nothing to render with, on any screen, so
nothing registers but a notice on the plugins screen saying so.

Inside the shell, AllTerrain Photo Editor runs as a **native window**, rendering into the shell's own DOM. That is not
a preference either: the components, the drag bridge and the Pixi all live in the parent frame, and a
chromeless iframe can reach none of them, because no component is registered there at all. So inside
the shell there is exactly one editing surface, and the row action, the media modal button and the
block editor button are ways of asking for it.

But desktop mode is a **per-user preference**, and a user who has switched it off has no shell on the
page to render into — which until recently left them with an editor they had installed and could not
open. Everything the editor itself needs survives that: `src/platform.ts` already resolves every
control to a plain-DOM equivalent *per component*, and the Pixi loader reads OpenStation's own file
straight from its directory when the module registry is not on the page. So there are three surfaces:

| Surface | When | Why that one |
|---|---|---|
| Native window | Desktop mode on | Components, drag bridge, shared Pixi |
| Admin page | Desktop mode off | Somewhere to land, bookmark and link to |
| Overlay | Desktop mode off | Editing a photo from a half-written post must not navigate away from it |

`openEditor()` is the single place that chooses. It asks the window first and reads back whether it
took the request, rather than second-guessing whether the shell is on the page — and the entry points
are **links** to the admin page that the bundle upgrades in place, so a control that JavaScript never
reached still goes somewhere sensible instead of doing nothing.

The requirement is checked by **capability, not by plugin slug** — do the functions being called
exist — so a fork, a rename or a bundled copy all work. It is checked on `plugins_loaded`, and that
detail is load-bearing: plugins load alphabetically, so `allterrain-photo-editor` runs *before* `desktop-mode` and
none of its functions exist yet at file scope. Checking there would fail on every site, every time,
and the plugin would silently never load. `Requires Plugins:` governs activation, not load order.

What a user loses by switching desktop mode off is the window, the wallpaper icon, the file opener
and the drag bridge. Not the editor.

### One name, two spellings

OpenStation renamed its whole surface: `wp.desktop` became `wp.os`, `<wpd-*>` became `<os-*>` along
with every event, `--wpd-*` became `--os-ui-*`, `--desktop-mode-*` became `--os-*`, and
`desktop_mode_*()` became `openstation_*()`. AllTerrain Photo Editor ships to sites running either version and cannot
know which, so nothing outside `src/platform.ts` and `includes/shell-api.php` writes a prefix at
all — code asks by bare name and those two files resolve the spelling:

```ts
componentTag( 'range-field' )        // 'os-range-field' | 'wpd-range-field' | null
onShellEvent( el, 'range-change', … )  // binds both spellings
```

```php
lienzo_shell_call( 'register_window', 'lienzo', $args );
```

A hardcoded `os-button` is exactly the same bug as a hardcoded `wpd-button`, pointed the other way.
Events are bound under *both* names rather than the one matching the resolved component, because the
two are not reliably in step — a shell mid-upgrade can define `os-range-field` while a cached bundle
still emits `wpd-range-change`, and a control listening for one would render perfectly and do nothing.

### The controls come from the shell

Per component, never per plugin:

```ts
hasComponent( 'range-field' ) ? createShellSlider( … ) : createNativeSlider( … )
```

The shell registers a core subset eagerly and the rest only when a bundle importing them loads, so
"is the shell running" is the wrong question — the only trustworthy one is whether *this* component
is in the registry right now. An unregistered tag renders as inert markup with no error, which is
why this is a hard gate, and it is a *layered* one: `createNumberField()` asks for `number-field`
first, then `text-field` in numeric mode, then a bare input. That middle tier is what actually runs
most of the time, because the shell does not register the number field until some bundle imports it.

Adapters do the same for behaviour. `src/platform.ts` funnels `request()`, `toast()` and
`confirmAction()` through feature detection, so no other module branches on the shell.

### Drag an image in, get a layer

Dropping a photo on the editor **adds it as a layer** where it was released, scaled to
sit inside the canvas. Deliberately not "open this instead": a drop onto a document
already in progress means *combine them*, and replacing it would throw away the work.
An empty window has nothing to combine with, so there a drop opens.

These sources arrive at the same layer importer:

- **An attachment**, from a My WordPress media tile or a desktop icon, through the
  shell's drag manager. Its pixels load via the same CORS-safe path the document uses, so
  a CDN-served file falls back to the byte proxy instead of tainting the canvas.
- **A stored desktop image** (`upload`), from the wallpaper or a folder. On drop,
  `wp.os.files.rest.addUploadToMediaLibrary()` resolves it to an attachment, reusing
  an existing Media Library copy. Hovering creates nothing. Storage ids are never
  treated as attachment ids. This path requires that shell API and permission to
  add the stored file to the Media Library; server errors appear as a toast.
- **A media record**, which is what dragging a thumbnail out of the **Media Library**
  carries: the shell's enhancement makes every `.attachment` draggable and writes the
  whole record as JSON on `application/x-wp-media-attachment`. That is the canonical
  contract for a WordPress media drag, and reading it beats inferring an id from markup.
  When the browser strips cross-frame drag data, the active
  `wp.os.dragBridge.getPayload()` attachment supplies the original image identity.
- **A URL**, from `text/uri-list`, `text/plain` or an `<img src>` in `text/html`, for
  drags carrying no record. A generated size (`photo-150x150.jpg`) is stripped to load
  the original, falling back to the URL as dragged — a file legitimately named
  `poster-1920x1080.jpg` looks exactly like a generated size.
- **A file**, from Finder or Explorer. No upload needed: blob URL straight into a
  texture, like a paste.

Browser drops are listened for on the **document** in capture phase. Both the bounds
and the element under the pointer must belong to the editor: a covered or hidden window
cannot steal a drop from another window. Accepted drops cancel browser navigation and
stop propagation to ancestor handlers. File and browser-image drops also work on the
standalone admin editor and the modal canvas.

The shell target understands `desktop-file.data.placement.file`, `shortcut` and
`attachment` records as well as the older `data.bridgePayload` wrapper. Every window
gets its own registration, released on teardown; closing a window during an asynchronous
storage lookup prevents a late import into that closed editor.

A drop that lands on the editor and cannot be read now says so, listing the types it
found. Silence is indistinguishable from a broken feature — which is precisely how the
Media Library case went unnoticed twice.

Layer textures are retained for **every state on the undo stack**, not just the current
one. That is what makes redo work: a dropped, pasted or typed layer keeps its pixels in a
GPU texture and nowhere else, so freeing them the moment the layer left the current
document meant undo destroyed what redo needed — the layer came back as an empty frame
with handles around nothing.

### Theming

The editor **defines** the shell's component palette on its own root, and this is not optional
polish: nothing in either plugin declares the foreground, muted-foreground or border tokens, so
every component was falling back to its light-theme literals and painting `#646970` labels and white
input backgrounds onto a dark panel. Labels measured about 2:1. One block of variables on
`.lz-editor` themes every shell control the editor will ever mount, including ones added later, and
takes those labels to 5.5:1. The block is declared under both spellings (`--wpd-*` and `--os-ui-*`,
`--desktop-mode-*` and `--os-*`) for the same reason the components are resolved by bare name.

**AllTerrain Photo Editor's own markup has to read the same tokens, and forgetting is silent.** A shell control that
cannot find a variable falls back to a light-theme literal; a rule of ours that hardcodes one *is*
that literal, with no fallback to notice. The picker was written before the block existed and kept
WordPress's `#50575e` for a photo's name and `#f0f0f1` behind a thumbnail — about 2:1 on a dark panel,
and sixty white slabs flashing over it while the grid decoded. The save-choice dialog asked for
`--lz-text` and `--lz-text-muted`, which are not tokens this stylesheet has ever declared, so both
fell through to their light-theme defaults every time. **The rule is `var( --lz-fg )` /
`var( --lz-fg-muted )` / `var( --lz-danger )`, never the hex, and never a `var()` fallback naming a
colour** — a fallback that fires is a token whose name is wrong, and the whole point of the block is
that it cannot be quietly bypassed.

The surround stays dark in every host, deliberately: judging an exposure against a white panel is
judging the panel. So the editor does *not* adopt the shell's window palette, which is light because
it dresses the frame rather than the content. What it does adopt is the accent and the corner
radius — `--os-window-link-accent`, falling back through the older name to `--wp-admin-theme-color` —
so the editor follows the user's desktop theme and their admin colour scheme. An earlier version of
that chain read `--wpd-accent`, which nothing defines; it fell through to a hardcoded blue every time.

### The bundle is evaluated twice

WordPress enqueues the script, and the shell's lazy-load payload injects the same URL again when a
native window first opens. Two IIFE evaluations, two module scopes — so `window.lienzo` belongs to
one copy and the live window's loader to the other, and a request to open an image reached a set of
window loaders the live window had never been added to. It reported success and did nothing.

Mutable desktop state therefore lives on a single `window.__lienzoDesktop` singleton, and the
one-time registrations are guarded. **Anything in `src/hosts/desktop-mode.ts` that must be singular
has to live there**, not in a module-level variable.

## PixiJS comes from OpenStation

AllTerrain Photo Editor ships no rendering library. OpenStation vendors PixiJS v8 (MIT), and
`src/engine/pixi-loader.ts` reaches for that one copy three ways, in this order:

1. **`window.PIXI`**, if anything has already put it there.
2. **The module registry** — `loadModules( [ 'pixijs' ] )`, which is idempotent and de-duplicates
   concurrent callers, so several windows opening at once still load one script.
3. **OpenStation's own file**, by URL. The registry lives in the shell's desktop bundle, so on a
   *classic* admin screen there is none to ask — but OpenStation is installed, and its file is right
   there.

The order is the whole design. Reusing an existing instance is smaller and safer than loading a
second: two Pixi 8 instances on a page share GPU resource registries through globals, and tearing one
down can invalidate textures belonging to the other. For the same reason the renderer never calls
`app.destroy( true )`, which would release those registries out from under unrelated Pixi apps on the
page. Step three is therefore never reached on a desktop page; it exists so the classic-admin editor
can open without this plugin carrying a second copy of Pixi to do it.

That URL is built from OpenStation's *own constant* — `OPENSTATION_URL`, falling back to the older
spelling, exactly as the functions and hooks are resolved — rather than from a hardcoded slug, and
`file_exists()` is checked before it is advertised. One plugin reaching into another's directory
should fail loudly and early or not at all: an unresolvable constant or a missing file yields an
empty string, and the editor then says it cannot find PixiJS instead of loading a 404 and failing
somewhere stranger. `lienzo_pixi_url` filters the answer.

`pixi.js` stays in `devDependencies` for its TypeScript types only, and is never bundled. No external
requests are made: OpenStation serves the file from your own site.

## Layout

Almost every part of this is a directory with a barrel rather than one long file. Where a name
below has no extension, `index.ts` is the public surface and the modules beside it are private to
it — so `src/editor` is imported as `../editor`, never as `../editor/recipe-store`.

```
allterrain-photo-editor.php               plugin bootstrap, constants
includes/
  shell-api.php            resolves the shell's renamed functions and hooks
  requirements.php         the shell capability gate
  admin-page.php           the classic-admin editor page, under Media
                             (registered always, in the menu only without the desktop)
  helpers/                 capabilities, source resolution, MIME, render ceilings
  recipe/                  op schema, defaults, migration, validation
                             (contract twin of src/model/recipe)
  post-image.php           which image a post is "about" — featured, gallery, attached
  post-attach.php          points a post at an edited copy, never overwriting
  render/                  blob -> sideload -> attachment -> recipe meta
  rest/                    lienzo/v1 routes, permissions, handlers
  assets.php               script/style registration + the config blob
  presets.php              per-user saved looks
  media-actions.php        row action + attachment-screen button
  desktop-mode.php         every shell touchpoint, behind a capability check
src/
  api.ts                   re-exports mount(); the implementation is src/editor
  editor/                  the editor: shell, toolbar, document store, save path
    recipe-store.ts          the document + its undo stack, with no DOM in it
    undoable-store.ts        the generic history mechanics underneath it
  platform.ts              host adapters, and the naming layer that resolves
                             `os-*` / `wpd-*` components and events
  model/recipe/            types, schema, mutations, migration, validation
  model/document/          canvas, layer transforms, the layer stack
  model/selection/         marquee geometry, mask rasterising, contour tracing,
                             path simplification, and the booleans built on the
                             round trip between rasterising and tracing
  model/history.ts         undo stack with drag coalescing
  model/pixel-history/     the tiles a paint stroke overwrote, for undo
  engine/color-matrix/     PURE: ops -> one 4x5 matrix
  engine/histogram.ts      PURE: pixels -> bucket counts
  engine/lut/              PURE: curves + levels -> one 256x1 table
  engine/brush/            PURE: stamps, stroke interpolation, flood fill
  engine/magnetic/         PURE: the edge field, and the live wire over it
  engine/pixel-tools/      PURE: one dab routine, eight retouching kernels
  engine/paint-shapes/     gradients, shapes and text -> one bitmap each
  engine/renderer/         Pixi context, layer textures, compositor, camera,
                             adjustment pipeline, histogram probe
  engine/shaders/          the one shader, twice: GLSL and WGSL
  net/                     REST client, image loading with CORS fallback
  ui/panels/               panel registry, host, and every shipped panel
  ui/controls/             the adaptive control kit, one factory per control
  ui/tool-rail/            the eighteen tools, two columns, keyboard shortcuts
  ui/stage-tools/          every canvas gesture, through one coordinate conversion
  ui/options-bar/          the contextual strip; a second view of one model
  ui/picker/               the image grid, read a page at a time as you scroll
  ui/transform-overlay/    the handles; drag maths separated from the DOM
  ui/crop-overlay/         the draggable crop rectangle
  ui/rulers/, ui/swatches.ts, ui/curve-editor.ts, ui/histogram-view.ts, …
  hosts/                   one adapter per surface
  hosts/open.ts            the one place that picks between window and overlay
  hosts/admin-page.ts      the classic-admin page, and its picker
  hosts/overlay.ts         the full-screen overlay, with its focus trap
  hosts/desktop-mode/      the shell integration: window, icon drop, file drop
```

The pure modules carry no Pixi import on purpose: the maths is where the bugs would be, and it is
all unit-testable in jsdom without a GPU.

## Development

```bash
npm install
npm run build          # builds the bundles and syncs them to the local QA site
npm run dev            # watch build
npm run deploy         # sync only, without rebuilding
npm run typecheck      # tsc --noEmit
npm run test           # vitest — the pure modules
npm run env:start      # wp-env at http://localhost:8894 (admin / password)
npm run test:php:install
npm run test:php       # phpunit, @group lienzo
```

### Releasing

```bash
npm run plugin:build    # typecheck, tests, then both bundles. No deploy, no QA site needed.
npm run plugin:check    # WordPress's own Plugin Check, the tool the review queue runs
npm run plugin:package  # dist/allterrain-photo-editor.zip, plus dist/assets/ for the directory art
npm run plugin:release  # build, then check, then package — the gate. Needs wp-env running.
```

`plugin:release` is the one to run before shipping anything: it refuses to produce a
zip that Plugin Check rejects. `plugin:package` deliberately skips the check so it stays
usable without Docker, which is also why the two are separate scripts rather than one.

Plugin Check needs a running site, so `npm run env:start` first.

`bin/ships.mjs` is the single list of what belongs in a distributed copy, imported by
both the local deploy and the packager, because the two answering differently is how a
zip ends up carrying `node_modules` or missing a file the QA site has been running for
weeks. The zip contains one `allterrain-photo-editor/` folder so it unpacks to the right slug however it
is installed, and it is staged into `dist/allterrain-photo-editor/` first so you can list and diff the
exact tree a reviewer will see.

Nothing whose name begins with a dot ever ships, and that rule is blind on purpose. A
list of known offenders only excludes the ones somebody remembered to add: `.claude/`
appeared in the repository and went straight into the release zip, which is exactly what
Plugin Check's `ai_instruction_directory` rule exists to catch. Editor and agent
directories keep arriving over a project's life, so the packager refuses the whole
class rather than chasing each one.

The banner and icon art lives in `.wordpress-org/` and is deliberately **not** in the
zip: the plugin directory serves it from its own `assets/` path in SVN, and shipping it
would add half a megabyte to every download. `plugin:package` copies it to
`dist/assets/` so both halves of an SVN commit are ready side by side.

`plugin:check` runs against the repository as wp-env maps it, not the package, so it
tells Plugin Check to skip everything that does not ship. That list is *derived* from
`bin/ships.mjs` at run time rather than written out a second time — ask the packager
what ships and the two can never disagree. Unzip the package if you want to see the
real tree. (Checking the packaged tree directly would need `wp-env --config`, which
arrived in `@wordpress/env` 11; this repo is on 10.)

One thing worth knowing if you ever call Plugin Check yourself: **`wp plugin check`
exits 0 even when it reports errors.** A deliberate `stable_tag_mismatch` — on its own
enough to have a submission rejected — prints in full and still exits successfully. So
`bin/plugin-check.mjs` reads the JSON report and counts findings instead of trusting the
exit code. A gate wired to that exit code passes every time and catches nothing.

### CI

`.github/workflows/ci.yml` runs on every push and PR to `main`:

| Job | What it guards |
|---|---|
| `js` | Types, Vitest, and that the committed `assets/` bundles match their source |
| `php` | PHPUnit and PHPCS, via wp-env |
| `plugin-check` | The same `npm run plugin:check` that runs locally |

`.wp-env.json` mounts the sibling `../alcazaba-plugin` checkout so the QA site has a
desktop shell to open AllTerrain Photo Editor as a window in. That path does not exist on a runner and
wp-env treats a missing mapping as fatal, so the wp-env jobs write a
`.wp-env.override.json` that replaces `mappings` with AllTerrain Photo Editor alone. Nothing is lost —
the PHPUnit bootstrap stubs the two shell functions the desktop integration is gated on,
and everything else works without one anyway.

`.github/workflows/release.yml` fires on a `vX.Y.Z` tag: it verifies the tag against all
four places the version is written, builds, **runs Plugin Check as a hard gate**, creates
a GitHub Release with the zip attached, and then deploys to WordPress.org. The last step
needs `SVN_USERNAME` and `SVN_PASSWORD` repository secrets.

### Releasing

The plugin was approved for the directory on 19 August 2026 and its SVN repository is
<https://plugins.svn.wordpress.org/allterrain-photo-editor>. Nothing is uploaded by hand any
more — `svn` is never run from here. A tag is the whole release, and `bin/release.sh`
is what produces one:

```bash
./bin/release.sh 1.0.1
```

It is the same script the OpenStation plugin releases with, minus the parts this
repository has no use for. In order it: refuses to run off `main`, off a dirty tree, or
out of sync with `origin`; refuses a tag that already exists; writes the new version to
all four places via `bin/bump-version.sh`; drafts a `readme.txt` changelog block from
GitHub's generated release notes and **stops for you to confirm it** — the one
interactive gate, and the last point at which stopping is free; commits and pushes the
bump; waits for CI to go green; and only then tags and pushes the tag, which is what
sets `release.yml` running.

It is idempotent. A run that dies halfway — or that you stop at the changelog prompt —
is resumed by running the same command again; it works out how far it got from the four
version strings and whether the bump was committed, rather than from anything it wrote
down.

Two flags: `--dry-run-changelog` prints the draft it would insert and exits without
touching a file, and `--skip-changelog` leaves a hand-written block alone. The
confirmation gate runs either way.

```bash
./bin/bump-version.sh 1.0.1   # just the four version strings, no commit, no tag
```

Prereleases are understood: `./bin/release.sh 1.1.0-rc1` produces a GitHub Release
marked as a prerelease and stops there. WordPress.org has no concept of one, and
pushing it would make it the live download.

### Two sites, and why builds deploy themselves

| Site | What it is | How code gets there |
|---|---|---|
| `localhost:8894` | wp-env, spun up by this repo | Bind-mounted — the repo *is* the plugin directory |
| `localhost:8889` | The `wordpress-alcazaba` compose project | `bin/deploy.mjs`, run automatically by `npm run build` |

The wp-env site mounts this repo directly, so a change is live the moment it is saved (PHP) or
rebuilt (JS/CSS). The `:8889` QA site is a separate WordPress checkout that only mounts *its own*
tree, so `bin/deploy.mjs` mirrors the plugin into
`../wordpress-alcazaba/src/wp-content/plugins/allterrain-photo-editor` at the end of every build — no zip, no
WordPress upload screen, and it is live immediately because that checkout is itself bind-mounted
into the container.

The mirror copies only what runs in production; `src/`, `tests/`, `bin/`, `node_modules/` and the
build config are excluded. It deletes files the source no longer has, so a renamed file cannot
linger and mask a bug — and it therefore refuses to write into any directory that does not already
contain `allterrain-photo-editor.php`. When no WordPress checkout is present it prints a note and exits zero rather
than failing the build. Override with `LIENZO_DEPLOY_TARGET`, or skip with `LIENZO_SKIP_DEPLOY=1`.

`npm run env:start` maps both plugins in but activates neither: wp-env's `plugins` list mounts a
directory under its *own basename* as well, which would put a second copy of AllTerrain Photo Editor on the site. The
mappings put both at their correct slugs; activate them from the Plugins screen. AllTerrain Photo Editor alone is a
complete install — it is the desktop window that needs both.

Lint PHP with `vendor/bin/phpcs` inside the container:

```bash
npx wp-env run tests-cli --env-cwd=wp-content/plugins/allterrain-photo-editor vendor/bin/phpcs
```

## What runs in how many passes

One pass does almost everything: the six linear adjustments (as a single composed matrix), vibrance,
sharpen, vignette, grain, and the baked tone table for curves and levels. That is one round of 8-bit
quantisation for the whole colour pipeline.

Two things sit outside it, for reasons rather than convenience:

- **Geometry** renders into an intermediate texture first, but *only* when it is not the identity —
  which most edits are. A crop changes what the downstream pipeline is even looking at, so it cannot
  be a per-pixel operation.
- **Blur** is a separable Gaussian, which means two passes by definition. It joins the filter chain
  only when the slider is off zero, so an edit without blur still pays for exactly one pass.

Sharpen and blur have a spatial extent, so they are the ops that could break the
preview-matches-save guarantee. Both are stored as a fraction of the image's longest edge and
converted to pixels against whatever is actually being rendered — which is why a sharpen set on a
900px preview still looks the same saved at 6000px.

### sRGB, or light

The pass above does its arithmetic on the stored values, which is what core WordPress and most
browser editors do. A recipe can ask for **linear light** instead — the Light switch at the top of
the Adjustments panel — and then exposure is applied between the two halves of the sRGB transfer
curve: undo the curve, multiply, put it back. A stop then means a doubling of light rather than a
doubling of a number that only stands for light, which is what a camera means by one. One stop down
from a near-white sky lands at 125 in sRGB and at 184 in linear, and 184 is the physically correct
answer.

Only exposure moves. Contrast pivots on mid grey, saturation interpolates towards luma and the tone
curve is a table indexed by the encoded value — all three are *defined* against the encoding, and
moving them would change what the sliders do rather than make them more correct. So in a linear
recipe exposure leaves the colour matrix (a 4×5 matrix has nowhere to put a curve) and travels as its
own uniform, and everything else composes exactly as before.

sRGB is the default and stays the default. The setting is stored per recipe, schema v6, and a recipe
without one is sRGB — which is what every recipe written before it was rendered in.

### Sixteen bits where it counts

The layer composite is the one texture that is written and then *sampled again*: every layer is
blended into it, the geometry pass writes it, and the adjustment shader reads it. It is allocated as
`rgba16float` where the GPU allows it, so a stack of semi-transparent layers does not quantise once
per layer and the geometry pass does not quantise before the colour maths has run at all. Everything
downstream is eight bits regardless, because that is what a PNG holds.

Anything that reads pixels *back* — the eyedropper, the wand, the paint bucket, copy — goes through
`GpuContext.resolve()` first, which blits to an eight-bit target. Half-float samples read back as
bytes are not the numbers anyone wanted, and the failure looks like an eyedropper picking nonsense.
The blit costs one full-canvas draw and happens only when something asks, never per frame.

WebGL2 needs `EXT_color_buffer_half_float` to render into one at all — without it the framebuffer is
merely incomplete, with no exception and nothing drawn — so the extension is checked rather than
assumed. On WebGPU it is deliberately switched *off*: Pixi 8's pipeline cache is not keyed on the
target's colour format, so the batcher's pipeline, compiled for the BGRA8 canvas, is reused for a
pass into an RGBA16F texture and the device rejects the whole command buffer. Eight bits is a real
cost; a blank canvas is not a trade.

### Two programs, one shader

`engine/shaders/adjust.ts` is GLSL and `engine/shaders/adjust-wgsl.ts` is its WGSL twin, and they
have to stay twins: Pixi picks a program by backend and silently *skips* a filter that has none for
the active one, which shows the unedited image with no error anywhere. That is why the renderer used
to pin itself to WebGL. It no longer has to — `lienzo_renderer_backend` takes `webgl` (the default),
`webgpu`, or `auto`, which asks for WebGPU and lets Pixi fall back by itself.

Two details in the WGSL are worth knowing before editing it. The `@group(1)` bindings are matched to
the filter's `resources` map by **variable name** — `adjustUniforms`, `uLut`, `uLutSampler` — not by
struct name and not by position; getting one wrong produces a bind group with a hole in it and a
`TypeError` from inside Pixi's WebGPU backend on the first frame. And a `size: 20` float array is
`array<vec4<f32>, 5>`, because a uniform buffer cannot pack floats tighter than sixteen bytes.

## Adding an adjustment

Four places, and all four are required or the op silently misbehaves:

1. `lienzo_op_schema()` in `includes/recipe.php` — bounds and rest position.
2. `OpType` / `PANEL_OP_ORDER` / `MATRIX_OP_ORDER` in `src/model/recipe.ts`.
3. `matrixForOp()` in `src/engine/color-matrix.ts`, or a new shader uniform if it is not linear.
4. `OP_DISPLAY` in `src/api.ts` — the user-facing scale and suffix.

The server accepts and stores whatever the schema allows, so registering an op there without a
browser implementation gives you a slider that validates and then does nothing.

## Extension points

| Hook | Purpose |
|---|---|
| `lienzo_op_schema` | Add or re-bound adjustments |
| `lienzo_supported_mime_types` | Which images may be opened |
| `lienzo_max_render_pixels` | Ceiling on a single GPU render |
| `lienzo_max_upload_bytes` | Ceiling on a saved render |
| `lienzo_max_selection_pixels` | Raster a boolean selection is worked out on |
| `lienzo_max_edge_pixels` | Size of the magnetic lasso's edge field |
| `lienzo_renderer_backend` | `webgl` (default), `webgpu` or `auto` |
| `lienzo_pixi_url` | Where the classic-admin editor loads PixiJS from |
| `lienzo_media_screens` | Admin screens the bundle loads on |
| `lienzo_config` | The blob handed to the browser |
| `lienzo_rest_media_payload` | The open-image response |
| `lienzo_post_image_id` | Which image a post is "about" |
| `lienzo_post_image_candidates` | The list checked before that decides |
| `lienzo_post_image_updated` | Fires after a post is pointed at an edit |

## Opening a post's photo

Drag a WooCommerce product — or any post with a picture — onto the AllTerrain Photo Editor icon and its image opens
straight in the editor, skipping the picker. Dropping a photo does the same.

The shell owns the drop target on every wallpaper tile, because a tile has to reject foreign
payloads rather than let them fall through to the wallpaper underneath. Registering a target on the
icon is therefore silently displaced; AllTerrain Photo Editor cooperates with the claimant through
`registerTilePayloadHandler` instead, scoped to its own icon so it cannot shadow another plugin's.

Which image a post is "about" is a filterable chain rather than a featured-image read: featured
image, then the WooCommerce gallery, then anything attached. Deliberately generic over post type —
a product's featured image is a featured image, and WooCommerce is the first caller rather than a
special case.

Saving an image opened that way asks what to do with it. **Both answers are non-destructive**:
"update the product" writes a new attachment and points the product at it, leaving the original in
the library. AllTerrain Photo Editor has no path that rewrites an original and this does not add one, which is what
makes the change reversible — the previous image is still there, and putting it back is one more
repoint rather than a restore from backup. A gallery swap keeps its position.

## Known limits

Stated plainly, because each is better read here than discovered:

- **A resize repaints the picture inside the ResizeObserver callback.** Resizing the drawing buffer
  clears it, and a ResizeObserver runs *after* the frame's animation callbacks — so the ticker has
  already drawn by the time the surface is replaced, and the browser paints the empty one. That was
  one blank frame per resize step, which during a window drag is every frame: the picture flickered,
  or seemed to vanish and come back. `ViewController.fit()` now draws synchronously whenever the
  surface actually changed, which is still before paint. The cost is one extra render per resize step
  and no extra render on a pan or a zoom, where the buffer is untouched.
- **The flood fill is still CPU work.** A span fill over a memoised match test answers a
  twenty-megapixel photograph in about 200ms rather than a few seconds, which is fast enough to feel
  like a click — but it is one thread, and a fill that covers the whole frame is closer to 800ms
  than to nothing. A worker would take it off the main thread; the GPU would not help, because
  connectivity is not a per-pixel question.
- **Sixteen-bit intermediates are WebGL-only.** Not for want of a format — WebGPU has one — but
  because Pixi 8 does not key its pipeline cache on the render target's colour format, so a pass into
  an `rgba16float` texture reuses a pipeline compiled for the eight-bit canvas and the device rejects
  it. Fixing that is upstream work.
- **Linear light moves exposure and nothing else.** Blur and sharpen still run on encoded values,
  where a physically correct pipeline would filter in linear too; the difference is small and the
  change is not.
- **Asking the desktop from inside a chromeless iframe is a `postMessage`, and it can go unheard.**
  The window manager only exists in the top frame, so "Edit with AllTerrain Photo Editor" in the media modal posts its
  request up. Being told the message was *forwarded* is not being told a window opened — so the frame
  now waits 600ms for the top frame to acknowledge, and opens the overlay itself if nothing does. A
  top frame running a stale cached bundle, one that hears the request but does not answer it, would
  open both; two editors is a visible annoyance where a dead button is neither.
- **"Edit Photos" is not in the Media menu while the desktop is running.** The shell hides the whole
  admin body behind the desktop, so an editor mounted on that page would be a live WebGL context and
  a full-resolution texture inside a `display: none` container. The item is registered and then
  removed from the menu, so the URL still answers — a bookmark, or the `editorUrl` in the config
  blob — and what it answers with is a sentence saying where the editor is and a button that opens
  it. AllTerrain Photo Editor lives in the dock and on the wallpaper there; `lienzo_desktop_owns_the_editor` is the
  one filter that decides.
- **A save from the classic-admin overlay does not always have somewhere to put the edit.** The block
  editor's image block is repointed, and so is the media modal: the copy joins the modal's library
  and *replaces* the original in its selection, so pressing Insert afterwards inserts the photograph
  as you just left it rather than as you found it. The Media Library row action still has nowhere to
  put an answer — there is no post at the other end of it, only a list — so what it offers is the
  editor's own banner and a button that opens the copy. Inside the shell, moving an edit somewhere
  else is what the drag bridge is for.
- **The classic-admin editor reads a path inside OpenStation's directory** to find PixiJS, because
  the module registry that would otherwise answer is only on the page in desktop mode. The constant
  is resolved rather than the slug, and the file is checked before it is offered — but it is still
  one plugin knowing where another keeps something, and `lienzo_pixi_url` exists to repair it.
- **`big_image_size_threshold`** can silently downscale a saved render. The success toast reports the
  dimensions actually stored rather than the ones requested.
- **Animated GIFs are not offered for editing**, because a canvas round trip flattens them to one
  frame, and quietly destroying an animation is worse than declining. The picker still passes them
  over — but it now counts what it passed and says so, because a library of nothing but GIFs used to
  read exactly like an empty one, right down to being invited to upload the photographs it already
  had.
- **Boolean selections are exact to the working raster, not to the path.** Adding, subtracting and
  intersecting go through a mask round trip rather than a path clipper, and that raster is capped at
  four megapixels — so on a document larger than that, the combined outline is traced at a reduced
  scale. It is invisible against the tracer's own six-hundred-vertex budget, which costs more
  precision than the scaling does, but it does mean the result is a fresh path and not the two paths
  that went in. `lienzo_max_selection_pixels` moves the cap for a site that would rather pay the
  allocation. Selections are still not part of the undo stack — they describe how someone is working
  rather than what the picture should look like, and an undo that stepped through six marquees before
  reaching the brush stroke you meant would be worse than none — so they have their own short history
  instead: **Step back**, or Cmd/Ctrl+Shift+D, puts the marquee back as it was before the last
  change. Twenty deep, and separate from the document's undo in both directions.
- **The magnetic lasso reads the document once, when the trace begins.** It has to: the read-back
  from the GPU and the convolution over it are the one expensive thing the tool does, and repeating
  them per anchor would put that cost on every click instead of the first. The consequence is that
  painting *during* a trace is invisible to the wire, which keeps following the picture as it was
  when you pressed. Closing and starting again picks up the change.
- **Its edge field is capped at two megapixels**, so on a larger document the boundary is found at a
  stride — one field pixel per two, three or four document pixels. Against the six-hundred-vertex
  budget every selection path is held to, and against a hand that is six pixels out to begin with,
  this has not been the limiting term; on a 50-megapixel scan it is a stride of five, and there it
  would be. `lienzo_max_edge_pixels` is the way to buy that precision back, at the price of the pause
  before the first anchor.
- **It follows the strongest edge near the pointer, which is not always the one you meant.** Two
  boundaries a few pixels apart — a rim light, a shadow just outside a subject — are genuinely
  ambiguous, and the wire resolves them by cost rather than by intent. Narrowing Width, raising
  Frequency and pinning anchors by hand are the three answers, in that order.
- **The picker fetches the next page only once the end of the grid has been *seen*.** It loads as you
  scroll — an `IntersectionObserver` on the footer, which answers "is this visible" having already
  clipped the element against every scrolling ancestor, so it does not matter which of them moved and
  the picker never has to guess. What it cannot do is fetch *ahead*: `rootMargin` expands the
  viewport, not the clip of the desktop window the grid is inside, so inside a window the page is
  asked for when the footer arrives rather than a screen early. The Load more button is what a
  browser with no observer gets *instead* — offering both would leave a control that could never be
  the reason anything happened, since by the time anyone reached for it the page it asks for is
  already on its way.

## Licence

GPL-2.0-or-later. No third-party libraries are bundled and no external requests are made. Rendering
uses PixiJS (MIT), which OpenStation vendors and serves from your own site.
