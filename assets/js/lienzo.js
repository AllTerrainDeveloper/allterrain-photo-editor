var lienzo = function(exports) {
  "use strict";
  const IDENTITY_TRANSFORM = {
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipH: false,
    flipV: false
  };
  const MIN_SCALE = 0.02;
  const MAX_SCALE = 20;
  function isIdentityTransform(transform) {
    const e = 1e-4;
    return Math.abs(transform.x - 0.5) < e && Math.abs(transform.y - 0.5) < e && Math.abs(transform.scaleX - 1) < e && Math.abs(transform.scaleY - 1) < e && Math.abs(transform.rotation) < e && !transform.flipH && !transform.flipV;
  }
  function clampTransform(transform) {
    const axis = (value) => Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Number.isFinite(value) ? value : 1)
    );
    return {
      x: Number.isFinite(transform.x) ? transform.x : 0.5,
      y: Number.isFinite(transform.y) ? transform.y : 0.5,
      scaleX: axis(transform.scaleX),
      scaleY: axis(transform.scaleY),
      rotation: Number.isFinite(transform.rotation) ? normaliseAngle(transform.rotation) : 0,
      flipH: transform.flipH === true,
      flipV: transform.flipV === true
    };
  }
  function normaliseAngle(degrees) {
    let angle = degrees % 360;
    if (angle > 180) {
      angle -= 360;
    }
    if (angle <= -180) {
      angle += 360;
    }
    return angle;
  }
  function layerSize(source, transform) {
    return {
      width: source.width * transform.scaleX,
      height: source.height * transform.scaleY
    };
  }
  function layerBounds(source, transform, canvas) {
    const size = layerSize(source, transform);
    const radians = transform.rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const width = size.width * cos + size.height * sin;
    const height = size.width * sin + size.height * cos;
    return {
      x: transform.x * canvas.width - width / 2,
      y: transform.y * canvas.height - height / 2,
      width,
      height
    };
  }
  function normaliseTransform(raw) {
    if (!raw || typeof raw !== "object") {
      return { ...IDENTITY_TRANSFORM };
    }
    const input = raw;
    const legacy = raw.scale;
    const uniform = Number.isFinite(Number(legacy)) ? Number(legacy) : 1;
    return clampTransform({
      x: Number(input.x ?? 0.5),
      y: Number(input.y ?? 0.5),
      scaleX: Number(input.scaleX ?? uniform),
      scaleY: Number(input.scaleY ?? uniform),
      rotation: Number(input.rotation ?? 0),
      flipH: input.flipH === true,
      flipV: input.flipV === true
    });
  }
  const MIN_CANVAS = 16;
  function isNativeCanvas(canvas, source) {
    return Math.abs(canvas.width - source.width) < 1 && Math.abs(canvas.height - source.height) < 1;
  }
  function clampCanvas(canvas, maxPixels) {
    let width = Math.max(MIN_CANVAS, Math.round(canvas.width) || MIN_CANVAS);
    let height = Math.max(MIN_CANVAS, Math.round(canvas.height) || MIN_CANVAS);
    const total = width * height;
    if (total > maxPixels) {
      const factor = Math.sqrt(maxPixels / total);
      width = Math.max(MIN_CANVAS, Math.floor(width * factor));
      height = Math.max(MIN_CANVAS, Math.floor(height * factor));
    }
    return { width, height };
  }
  function fitScale$1(source, canvas) {
    if (source.width <= 0 || source.height <= 0) {
      return 1;
    }
    return Math.min(canvas.width / source.width, canvas.height / source.height);
  }
  function coverScale(source, canvas) {
    if (source.width <= 0 || source.height <= 0) {
      return 1;
    }
    return Math.max(canvas.width / source.width, canvas.height / source.height);
  }
  function applyCrop(canvas, transform, rect) {
    const next = {
      width: Math.max(MIN_CANVAS, Math.round(canvas.width * rect.w)),
      height: Math.max(MIN_CANVAS, Math.round(canvas.height * rect.h))
    };
    const centreX = transform.x * canvas.width - rect.x * canvas.width;
    const centreY = transform.y * canvas.height - rect.y * canvas.height;
    return {
      canvas: next,
      transform: {
        ...transform,
        x: centreX / (canvas.width * rect.w),
        y: centreY / (canvas.height * rect.h)
      }
    };
  }
  function resizeCanvas(canvas, transform, next, anchor = { x: 0.5, y: 0.5 }) {
    const offsetX = (next.width - canvas.width) * anchor.x;
    const offsetY = (next.height - canvas.height) * anchor.y;
    const centreX = transform.x * canvas.width + offsetX;
    const centreY = transform.y * canvas.height + offsetY;
    return {
      canvas: next,
      transform: {
        ...transform,
        x: next.width === 0 ? 0.5 : centreX / next.width,
        y: next.height === 0 ? 0.5 : centreY / next.height
      }
    };
  }
  function normaliseCanvas(raw, fallback) {
    if (!raw || typeof raw !== "object") {
      return { ...fallback };
    }
    const input = raw;
    const width = Number(input.width);
    const height = Number(input.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return { ...fallback };
    }
    if (width <= 0 || height <= 0) {
      return { width: 0, height: 0 };
    }
    return {
      width: Math.max(MIN_CANVAS, Math.round(width)),
      height: Math.max(MIN_CANVAS, Math.round(height))
    };
  }
  function centredCrop(aspect, canvasAspect) {
    if (!Number.isFinite(aspect) || aspect <= 0) {
      return { x: 0, y: 0, w: 1, h: 1 };
    }
    const relative = aspect / canvasAspect;
    if (relative >= 1) {
      const h = 1 / relative;
      return { x: 0, y: (1 - h) / 2, w: 1, h };
    }
    return { x: (1 - relative) / 2, y: 0, w: relative, h: 1 };
  }
  function clampRect(rect) {
    const min = 0.01;
    const w = Math.min(1, Math.max(min, rect.w));
    const h = Math.min(1, Math.max(min, rect.h));
    return {
      x: Math.min(1 - w, Math.max(0, rect.x)),
      y: Math.min(1 - h, Math.max(0, rect.y)),
      w,
      h
    };
  }
  const BASE_LAYER_ID = "base";
  const MAX_TEXT_LENGTH = 5e3;
  function createImageLayer(name) {
    return {
      id: BASE_LAYER_ID,
      name,
      kind: "image",
      transform: { ...IDENTITY_TRANSFORM },
      visible: true,
      opacity: 1
    };
  }
  function newLayerId() {
    return `layer-${Math.random().toString(36).slice(2, 10)}`;
  }
  function createRasterLayer(name, transform = {}) {
    return {
      id: newLayerId(),
      name,
      kind: "raster",
      transform: { ...IDENTITY_TRANSFORM, ...transform },
      visible: true,
      opacity: 1
    };
  }
  function createTextLayer(name, source, transform = {}) {
    return {
      id: newLayerId(),
      name,
      kind: "text",
      transform: { ...IDENTITY_TRANSFORM, ...transform },
      visible: true,
      opacity: 1,
      text: normaliseTextSource(source) ?? source
    };
  }
  function normaliseTextSource(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const input = raw;
    if (typeof input.text !== "string") {
      return null;
    }
    const text = input.text.replace(/[^\P{C}\n\t]/gu, "").slice(0, MAX_TEXT_LENGTH);
    if (!text.trim()) {
      return null;
    }
    const size = Number(input.size);
    const strokeWidth = Number(input.strokeWidth ?? 0);
    const colour = typeof input.colour === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(input.colour) ? input.colour : "#000000";
    return {
      text,
      size: Number.isFinite(size) ? Math.min(2e3, Math.max(1, size)) : 72,
      family: typeof input.family === "string" && input.family.trim() ? input.family.slice(0, 200) : "sans-serif",
      colour,
      bold: input.bold === true,
      italic: input.italic === true,
      strokeWidth: Number.isFinite(strokeWidth) ? Math.min(200, Math.max(0, strokeWidth)) : 0
    };
  }
  function normaliseLayers(raw, fallback = "Image") {
    if (!Array.isArray(raw) || raw.length === 0) {
      return [createImageLayer(fallback)];
    }
    const layers = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const layer = entry;
      const opacity = Number(layer.opacity ?? 1);
      const text = layer.kind === "text" ? normaliseTextSource(layer.text) : null;
      const kind = layer.kind === "text" ? text ? "text" : "raster" : layer.kind === "raster" ? "raster" : "image";
      layers.push({
        id: typeof layer.id === "string" && layer.id ? layer.id : newLayerId(),
        name: typeof layer.name === "string" ? layer.name : fallback,
        kind,
        transform: normaliseTransform(layer.transform),
        visible: layer.visible !== false,
        opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
        ...text ? { text } : {}
      });
    }
    return layers.length > 0 ? layers : [createImageLayer(fallback)];
  }
  function findLayer(layers, id) {
    return layers.find((layer) => layer.id === id);
  }
  function updateLayer(layers, id, patch) {
    return layers.map(
      (layer) => layer.id === id ? { ...layer, ...patch } : layer
    );
  }
  function replaceLayer(layers, id, replacement) {
    return layers.map((layer) => layer.id === id ? replacement : layer);
  }
  function reorderLayer(layers, id, direction) {
    const index = layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= layers.length) {
      return layers;
    }
    const next = [...layers];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return next;
  }
  const PREFIXES = ["os", "wpd"];
  function desktop$1() {
    const wp = window.wp;
    const api = wp?.os ?? wp?.desktop;
    return api?.isActive?.() ? api : void 0;
  }
  function isDesktopMode() {
    return desktop$1() !== void 0;
  }
  function isDesktopModeEnabled() {
    const config = window.lienzoConfig;
    const flag = config?.desktopMode;
    return flag === true || flag === "1" || flag === 1 || isDesktopMode();
  }
  function pickComponent(names) {
    for (const name of names) {
      const tag = componentTag(name);
      if (tag) {
        return tag;
      }
    }
    return null;
  }
  function componentTag(name) {
    if ("undefined" === typeof customElements) {
      return null;
    }
    for (const prefix of PREFIXES) {
      const tag = `${prefix}-${name}`;
      if (customElements.get(tag) !== void 0) {
        return tag;
      }
    }
    return null;
  }
  function shellEvents(name) {
    return PREFIXES.map((prefix) => `${prefix}-${name}`);
  }
  function onShellEvent(el, name, handler) {
    const names = shellEvents(name);
    for (const event of names) {
      el.addEventListener(event, handler);
    }
    return () => {
      for (const event of names) {
        el.removeEventListener(event, handler);
      }
    };
  }
  function request(input, init) {
    const api = desktop$1();
    if (api?.fetch) {
      return api.fetch(input, init);
    }
    return window.fetch(input, init);
  }
  function toast(message, type = "info") {
    const api = desktop$1();
    if (api?.showToast) {
      api.showToast({ message, type });
      return;
    }
    fallbackToast(message, type);
  }
  let toastHost = null;
  function fallbackToast(message, type) {
    if (!toastHost || !toastHost.isConnected) {
      toastHost = document.createElement("div");
      toastHost.className = "lz-toasts";
      toastHost.setAttribute("role", "status");
      toastHost.setAttribute("aria-live", "polite");
      document.body.appendChild(toastHost);
    }
    const node = document.createElement("div");
    node.className = `lz-toast lz-toast--${type}`;
    node.textContent = message;
    toastHost.appendChild(node);
    window.setTimeout(() => {
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 300);
    }, type === "error" ? 6e3 : 3500);
  }
  class RestError extends Error {
    constructor(message, code, status) {
      super(message);
      this.name = "RestError";
      this.code = code;
      this.status = status;
    }
  }
  async function toError(response) {
    let message = `Request failed with status ${response.status}.`;
    let code = "lienzo_http_error";
    try {
      const body = await response.json();
      if (body && typeof body === "object") {
        if (typeof body.message === "string") {
          message = body.message;
        }
        if (typeof body.code === "string") {
          code = body.code;
        }
      }
    } catch {
    }
    return new RestError(message, code, response.status);
  }
  class RestClient {
    /**
     * @param config Runtime configuration from `window.lienzoConfig`.
     */
    constructor(config) {
      this.config = config;
    }
    /** Headers every authenticated call needs. */
    headers(extra = {}) {
      return { "X-WP-Nonce": this.config.restNonce, ...extra };
    }
    /**
     * Fetches everything needed to open an image.
     *
     * @param attachmentId Attachment to open.
     */
    async getMedia(attachmentId) {
      const response = await request(`${this.config.restUrl}media/${attachmentId}`, {
        credentials: "same-origin",
        headers: this.headers()
      });
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /**
     * Uploads a rendered image and creates a new attachment.
     *
     * Sent as multipart rather than JSON with a base64 payload: a full-resolution
     * PNG can be tens of megabytes, and base64 would inflate that by a third before
     * it ever reached the wire.
     *
     * The painted layers ride along as PNGs of their own, one per layer, so the copy
     * can be opened again with its layers intact rather than baked in. Without them
     * the server stores the copy flattened, exactly as it did before they travelled.
     *
     * @param attachmentId Attachment the edit was rendered from.
     * @param blob         Encoded image.
     * @param recipe       The edit, for storage alongside the result.
     * @param layers       Optional. Each raster layer's pixels, keyed by layer id.
     */
    async saveRender(attachmentId, blob, recipe, layers = []) {
      const body = new FormData();
      body.append("file", blob, "render");
      body.append("recipe", JSON.stringify(recipe));
      for (const layer of layers) {
        body.append(`layers[${layer.id}]`, layer.blob, `${layer.id}.png`);
      }
      const response = await request(
        `${this.config.restUrl}media/${attachmentId}/render`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: this.headers(),
          body
        }
      );
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /** Lists the current user's presets. */
    async getPresets() {
      const response = await request(`${this.config.restUrl}presets`, {
        credentials: "same-origin",
        headers: this.headers()
      });
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /**
     * Saves the current edit as a named preset.
     *
     * @param name   Display name.
     * @param recipe The edit to derive it from.
     */
    async createPreset(name, recipe) {
      const response = await request(`${this.config.restUrl}presets`, {
        method: "POST",
        credentials: "same-origin",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name, recipe: JSON.stringify(recipe) })
      });
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /**
     * Deletes a preset.
     *
     * @param id Preset identifier.
     */
    async deletePreset(id) {
      const response = await request(`${this.config.restUrl}presets/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: this.headers()
      });
      if (!response.ok) {
        throw await toError(response);
      }
    }
    /**
     * Streams the original bytes from the same origin as wp-admin.
     *
     * Only used when a direct load tainted or failed -- see `loadSourceImage()`.
     *
     * @param sourceUrl Absolute URL of the `/source` route.
     */
    async getSourceBlob(sourceUrl) {
      return this.getBlob(sourceUrl);
    }
    /**
     * Fetches bytes from one of this plugin's routes, with the nonce along.
     *
     * Through `fetch` rather than an `<img>` because a REST route without the nonce is
     * an anonymous request, and anonymous requests may not read a layer's pixels.
     *
     * @param url Absolute URL of the route.
     */
    async getBlob(url) {
      const response = await request(url, {
        credentials: "same-origin",
        headers: this.headers()
      });
      if (!response.ok) {
        throw await toError(response);
      }
      return response.blob();
    }
    /**
     * Finds the image a post is about.
     *
     * @param postId Post to look at.
     * @throws {Error} When the post has no editable image, or is not this user's to
     *                 edit.
     */
    async getPostImage(postId) {
      const response = await request(
        `${this.config.restUrl}posts/${postId}/image`,
        { credentials: "same-origin", headers: this.headers() }
      );
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /**
     * Points a post's image at an attachment.
     *
     * @param postId       Post to update.
     * @param attachmentId Attachment it should point at.
     * @param slot         Which image: 'thumbnail' or 'gallery'.
     * @param replacing    Attachment being replaced, for a gallery slot.
     * @throws {Error} When the post could not be updated.
     */
    async attachToPost(postId, attachmentId, slot, replacing = 0) {
      const response = await request(
        `${this.config.restUrl}posts/${postId}/image`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: this.headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({ attachmentId, slot, replacing })
        }
      );
      if (!response.ok) {
        throw await toError(response);
      }
    }
  }
  const LUMA_R = 0.2126;
  const LUMA_G = 0.7152;
  const LUMA_B = 0.0722;
  const IDENTITY = [
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0
  ];
  function multiply(b, a) {
    const out = new Array(20).fill(0);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += b[row * 5 + k] * a[k * 5 + col];
        }
        if (col === 4) {
          sum += b[row * 5 + 4];
        }
        out[row * 5 + col] = sum;
      }
    }
    return out;
  }
  function exposureGain(v) {
    return Math.pow(2, v * 2);
  }
  function exposureMatrix(v) {
    const scale = exposureGain(v);
    return [
      scale,
      0,
      0,
      0,
      0,
      0,
      scale,
      0,
      0,
      0,
      0,
      0,
      scale,
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function contrastMatrix(v) {
    const c = 1 + v;
    const offset = 0.5 * (1 - c);
    return [
      c,
      0,
      0,
      0,
      offset,
      0,
      c,
      0,
      0,
      offset,
      0,
      0,
      c,
      0,
      offset,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function saturationMatrix(v) {
    const s = 1 + v;
    const ir = LUMA_R * (1 - s);
    const ig = LUMA_G * (1 - s);
    const ib = LUMA_B * (1 - s);
    return [
      ir + s,
      ig,
      ib,
      0,
      0,
      ir,
      ig + s,
      ib,
      0,
      0,
      ir,
      ig,
      ib + s,
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function temperatureMatrix(v) {
    const r = 1 + 0.2 * v;
    const b = 1 - 0.2 * v;
    return [
      r,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      b,
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function tintMatrix(v) {
    const g = 1 - 0.15 * v;
    const rb = 1 + 0.075 * v;
    return [
      rb,
      0,
      0,
      0,
      0,
      0,
      g,
      0,
      0,
      0,
      0,
      0,
      rb,
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function multiply3(b, a) {
    const out = new Array(9).fill(0);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) {
          sum += b[row * 3 + k] * a[k * 3 + col];
        }
        out[row * 3 + col] = sum;
      }
    }
    return out;
  }
  const LUMA_PROJECTION = [
    LUMA_R,
    LUMA_G,
    LUMA_B,
    LUMA_R,
    LUMA_G,
    LUMA_B,
    LUMA_R,
    LUMA_G,
    LUMA_B
  ];
  const CHROMA_PROJECTION = [
    1 - LUMA_R,
    -LUMA_G,
    -LUMA_B,
    -LUMA_R,
    1 - LUMA_G,
    -LUMA_B,
    -LUMA_R,
    -LUMA_G,
    1 - LUMA_B
  ];
  const NEUTRAL_AXIS_CROSS = (() => {
    const n = 1 / Math.sqrt(3);
    return [0, -n, n, n, 0, -n, -n, n, 0];
  })();
  const CHROMA_QUARTER_TURN = multiply3(CHROMA_PROJECTION, NEUTRAL_AXIS_CROSS);
  function hueMatrix(degrees) {
    const radians = degrees * Math.PI / 180;
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const m = new Array(9);
    for (let i = 0; i < 9; i++) {
      m[i] = LUMA_PROJECTION[i] + c * CHROMA_PROJECTION[i] + s * CHROMA_QUARTER_TURN[i];
    }
    return [
      m[0],
      m[1],
      m[2],
      0,
      0,
      m[3],
      m[4],
      m[5],
      0,
      0,
      m[6],
      m[7],
      m[8],
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  const RECIPE_VERSION = 6;
  const MATRIX_OP_ORDER = [
    "exposure",
    "contrast",
    "temperature",
    "tint",
    "saturation",
    "hue"
  ];
  const PANEL_OP_ORDER = [
    "exposure",
    "contrast",
    "temperature",
    "tint",
    "saturation",
    "vibrance",
    "hue"
  ];
  const EFFECT_OP_ORDER = ["sharpen", "blur", "vignette", "grain"];
  const OP_LABELS = {
    exposure: "Exposure",
    contrast: "Contrast",
    saturation: "Saturation",
    vibrance: "Vibrance",
    temperature: "Temperature",
    tint: "Tint",
    hue: "Hue",
    sharpen: "Sharpen",
    blur: "Blur",
    vignette: "Vignette",
    grain: "Grain"
  };
  const IDENTITY_LEVELS = { black: 0, white: 255, gamma: 1 };
  const LINEAR_CURVE = [
    [0, 0],
    [255, 255]
  ];
  function isIdentityCurves(curves) {
    if (!curves) {
      return true;
    }
    return ["rgb", "r", "g", "b"].every(
      (channel) => isLinear(curves[channel])
    );
  }
  function isLinear(points) {
    if (!points || points.length === 0) {
      return true;
    }
    return points.every(([x, y]) => Math.abs(x - y) < 0.5);
  }
  function isIdentityLevels(levels) {
    if (!levels) {
      return true;
    }
    return levels.black <= 0 && levels.white >= 255 && Math.abs(levels.gamma - 1) < 1e-6;
  }
  function normaliseCurve(points) {
    if (!points || points.length < 2) {
      return LINEAR_CURVE.map((p) => [...p]);
    }
    const clamped = points.map(
      ([x, y]) => [
        Math.min(255, Math.max(0, Math.round(x))),
        Math.min(255, Math.max(0, Math.round(y)))
      ]
    ).sort((a, b) => a[0] - b[0]);
    const unique = [];
    for (const point of clamped) {
      const last = unique[unique.length - 1];
      if (last && last[0] === point[0]) {
        unique[unique.length - 1] = point;
        continue;
      }
      unique.push(point);
    }
    if (unique.length < 2) {
      return LINEAR_CURVE.map((p) => [...p]);
    }
    return unique;
  }
  function sampleCurve(points) {
    const curve = normaliseCurve(points);
    const out = new Uint8ClampedArray(256);
    const n = curve.length;
    const deltas = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = curve[i + 1][0] - curve[i][0];
      deltas.push(dx === 0 ? 0 : (curve[i + 1][1] - curve[i][1]) / dx);
    }
    const tangents = new Array(n);
    tangents[0] = deltas[0];
    tangents[n - 1] = deltas[n - 2];
    for (let i = 1; i < n - 1; i++) {
      tangents[i] = deltas[i - 1] * deltas[i] <= 0 ? 0 : (deltas[i - 1] + deltas[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (deltas[i] === 0) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
        continue;
      }
      const a = tangents[i] / deltas[i];
      const b = tangents[i + 1] / deltas[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * a * deltas[i];
        tangents[i + 1] = t * b * deltas[i];
      }
    }
    let segment = 0;
    for (let x = 0; x < 256; x++) {
      if (x <= curve[0][0]) {
        out[x] = curve[0][1];
        continue;
      }
      if (x >= curve[n - 1][0]) {
        out[x] = curve[n - 1][1];
        continue;
      }
      while (segment < n - 2 && x > curve[segment + 1][0]) {
        segment++;
      }
      const [x0, y0] = curve[segment];
      const [x1, y1] = curve[segment + 1];
      const h = x1 - x0;
      const t = (x - x0) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      out[x] = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * tangents[segment] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * tangents[segment + 1];
    }
    return out;
  }
  function sampleLevels(levels) {
    const out = new Uint8ClampedArray(256);
    const black = Math.min(254, Math.max(0, levels.black));
    const white = Math.max(black + 1, Math.min(255, levels.white));
    const gamma = Math.min(10, Math.max(0.1, levels.gamma));
    const span = white - black;
    for (let x = 0; x < 256; x++) {
      const normalised = Math.min(1, Math.max(0, (x - black) / span));
      out[x] = Math.pow(normalised, 1 / gamma) * 255;
    }
    return out;
  }
  function buildLut(curves, levels) {
    const base = levels && !isIdentityLevels(levels) ? sampleLevels(levels) : identityRamp();
    const master = isLinear(curves?.rgb) ? null : sampleCurve(curves.rgb);
    const channels = ["r", "g", "b"].map(
      (channel) => isLinear(curves?.[channel]) ? null : sampleCurve(curves[channel])
    );
    const lut = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const afterLevels = base[i];
      const afterMaster = master ? master[afterLevels] : afterLevels;
      for (let c = 0; c < 3; c++) {
        const channel = channels[c];
        lut[i * 4 + c] = channel ? channel[afterMaster] : afterMaster;
      }
      lut[i * 4 + 3] = i;
    }
    return lut;
  }
  function identityRamp() {
    const ramp = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      ramp[i] = i;
    }
    return ramp;
  }
  function defaultRecipe(source, canvas) {
    return {
      version: RECIPE_VERSION,
      source,
      ops: [],
      // Zero means "not sized yet"; the editor fills it from the image on open.
      canvas: canvas ? { ...canvas } : { width: 0, height: 0 },
      layers: [createImageLayer("Image")],
      activeLayerId: BASE_LAYER_ID,
      curves: {},
      levels: { ...IDENTITY_LEVELS },
      output: { format: "image/jpeg", quality: 0.92 },
      // sRGB, matching core WordPress and every recipe written before the working
      // space existed. Linear light is a choice someone makes, not a default that
      // silently re-renders the edits they already saved.
      space: "srgb"
    };
  }
  function getOp(recipe, type, schema) {
    const op = recipe.ops.find((candidate) => candidate.type === type);
    if (op) {
      return op.v;
    }
    return schema[type]?.default ?? 0;
  }
  function setOp(recipe, type, value, schema) {
    const spec = schema[type];
    const clamped = spec ? Math.min(spec.max, Math.max(spec.min, value)) : value;
    const isDefault = spec !== void 0 && Math.abs(clamped - spec.default) < 1e-9;
    const ops = recipe.ops.filter((op) => op.type !== type);
    if (!isDefault) {
      ops.push({ type, v: clamped });
    }
    ops.sort(
      (a, b) => PANEL_OP_ORDER.indexOf(a.type) - PANEL_OP_ORDER.indexOf(b.type)
    );
    return { ...recipe, ops };
  }
  function resetOps(recipe, nativeCanvas) {
    return {
      ...recipe,
      ops: [],
      canvas: nativeCanvas ? { ...nativeCanvas } : recipe.canvas,
      // Reset drops added layers along with everything else; the base image is
      // what "reset" means.
      layers: [createImageLayer(recipe.layers[0]?.name ?? "Image")],
      activeLayerId: BASE_LAYER_ID,
      curves: {},
      levels: { ...IDENTITY_LEVELS }
    };
  }
  function setCurve(recipe, channel, points) {
    const curves = { ...recipe.curves };
    if (!points) {
      delete curves[channel];
    } else {
      curves[channel] = normaliseCurve(points);
    }
    return { ...recipe, curves };
  }
  function setLevels(recipe, levels) {
    return { ...recipe, levels };
  }
  function isIdentity(recipe, source) {
    const untouchedCanvas = !source || recipe.canvas.width === 0 || isNativeCanvas(recipe.canvas, source);
    return recipe.ops.length === 0 && untouchedCanvas && recipe.layers.length === 1 && recipe.layers[0].kind === "image" && isIdentityTransform(recipe.layers[0].transform) && isIdentityCurves(recipe.curves) && isIdentityLevels(recipe.levels);
  }
  function setLayer(recipe, transform) {
    return {
      ...recipe,
      layers: updateLayer(recipe.layers, recipe.activeLayerId, {
        transform: normaliseTransform(transform)
      })
    };
  }
  function setLayers(recipe, layers, active2) {
    const stack = layers.length > 0 ? layers : recipe.layers;
    const activeLayerId = active2 && stack.some((layer) => layer.id === active2) ? active2 : stack.some((layer) => layer.id === recipe.activeLayerId) ? recipe.activeLayerId : stack[stack.length - 1].id;
    return { ...recipe, layers: stack, activeLayerId };
  }
  function activeLayer$1(recipe) {
    return findLayer(recipe.layers, recipe.activeLayerId) ?? recipe.layers[0];
  }
  function setDocument(recipe, canvas, transform) {
    return {
      ...recipe,
      canvas: normaliseCanvas(canvas, recipe.canvas),
      layers: updateLayer(recipe.layers, recipe.activeLayerId, {
        transform: normaliseTransform(transform)
      })
    };
  }
  function migrateRecipe(raw) {
    const version2 = Number(raw.version ?? 1);
    if (version2 >= RECIPE_VERSION) {
      return raw;
    }
    if (version2 >= 3) {
      const single = raw;
      return {
        ...raw,
        version: RECIPE_VERSION,
        layers: single.layers ?? [
          {
            ...createImageLayer("Image"),
            transform: normaliseTransform(single.layer)
          }
        ],
        // Kept when the recipe already had a stack to point into. Overwriting it
        // would move the active layer back to the image every time an older recipe
        // was opened, which is a thing a user would notice.
        activeLayerId: typeof single.activeLayerId === "string" ? single.activeLayerId : BASE_LAYER_ID
      };
    }
    const geometry = raw.geometry ?? {};
    const migrated = { ...raw };
    delete migrated.geometry;
    migrated.version = RECIPE_VERSION;
    migrated.canvas = { width: 0, height: 0 };
    migrated.activeLayerId = BASE_LAYER_ID;
    migrated.layers = [
      {
        ...createImageLayer("Image"),
        transform: {
          ...IDENTITY_TRANSFORM,
          rotation: Number(geometry.rotate ?? 0) + Number(geometry.straighten ?? 0) || 0,
          flipH: geometry.flipH === true,
          flipV: geometry.flipV === true
        }
      }
    ];
    return migrated;
  }
  function validateRecipe(raw, schema) {
    let input = raw;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        throw new Error("The edit recipe was not valid JSON.");
      }
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("The edit recipe must be an object.");
    }
    const rawVersion = Number(input.version ?? 0);
    if (!Number.isInteger(rawVersion) || rawVersion < 1 || rawVersion > RECIPE_VERSION) {
      throw new Error(`Unsupported recipe version ${rawVersion}.`);
    }
    const candidate = migrateRecipe(
      input
    );
    const source = Number(candidate.source ?? 0);
    if (!Number.isInteger(source) || source <= 0) {
      throw new Error("The edit recipe must name the attachment its pixels came from.");
    }
    const rawOps = candidate.ops;
    if (rawOps !== void 0 && !Array.isArray(rawOps)) {
      throw new Error("The edit recipe operations must be a list.");
    }
    const ops = [];
    const seen = /* @__PURE__ */ new Set();
    for (const op of rawOps ?? []) {
      if (!op || typeof op !== "object" || typeof op.type !== "string") {
        throw new Error("Every recipe operation must be an object with a type.");
      }
      const spec = schema[op.type];
      if (!spec) {
        throw new Error(`Unknown recipe operation "${op.type}".`);
      }
      if (seen.has(op.type)) {
        throw new Error(`Recipe operation "${op.type}" appears more than once.`);
      }
      const value = Number(op.v);
      if (!Number.isFinite(value)) {
        throw new Error(`Recipe operation "${op.type}" is missing a numeric value.`);
      }
      if (value < spec.min || value > spec.max) {
        throw new Error(
          `Recipe operation "${op.type}" must be between ${spec.min} and ${spec.max}.`
        );
      }
      seen.add(op.type);
      if (Math.abs(value - spec.default) < 1e-9) {
        continue;
      }
      ops.push({ type: op.type, v: value });
    }
    const output = candidate.output ?? {};
    const format = typeof output.format === "string" ? output.format : "image/jpeg";
    const quality = Number(output.quality ?? 0.92);
    if (!Number.isFinite(quality) || quality < 0.1 || quality > 1) {
      throw new Error("Output quality must be between 0.1 and 1.0.");
    }
    ops.sort(
      (a, b) => PANEL_OP_ORDER.indexOf(a.type) - PANEL_OP_ORDER.indexOf(b.type)
    );
    const layers = normaliseLayers(candidate.layers);
    const activeLayerId = layers.some((layer) => layer.id === candidate.activeLayerId) ? candidate.activeLayerId : layers[layers.length - 1].id;
    return {
      version: RECIPE_VERSION,
      source,
      ops,
      canvas: normaliseCanvas(candidate.canvas, { width: 0, height: 0 }),
      layers,
      activeLayerId,
      curves: normaliseCurves(candidate.curves),
      levels: normaliseLevels(candidate.levels),
      output: { format, quality },
      space: normaliseSpace(candidate.space)
    };
  }
  function normaliseSpace(raw) {
    return raw === "linear" ? "linear" : "srgb";
  }
  function normaliseCurves(raw) {
    if (!raw || typeof raw !== "object") {
      return {};
    }
    const input = raw;
    const out = {};
    for (const channel of ["rgb", "r", "g", "b"]) {
      const points = input[channel];
      if (!Array.isArray(points) || points.length < 2) {
        continue;
      }
      const normalised = normaliseCurve(points);
      if (normalised.every(([x, y]) => Math.abs(x - y) < 0.5)) {
        continue;
      }
      out[channel] = normalised;
    }
    return out;
  }
  function normaliseLevels(raw) {
    if (!raw || typeof raw !== "object") {
      return { ...IDENTITY_LEVELS };
    }
    const input = raw;
    const black = Number(input.black ?? 0);
    const white = Number(input.white ?? 255);
    const gamma = Number(input.gamma ?? 1);
    const safeBlack = Number.isFinite(black) ? Math.min(254, Math.max(0, black)) : 0;
    const safeWhite = Number.isFinite(white) ? Math.min(255, Math.max(safeBlack + 1, white)) : 255;
    return {
      black: safeBlack,
      white: safeWhite,
      gamma: Number.isFinite(gamma) ? Math.min(10, Math.max(0.1, gamma)) : 1
    };
  }
  function matrixForOp(type, v) {
    switch (type) {
      case "exposure":
        return exposureMatrix(v);
      case "contrast":
        return contrastMatrix(v);
      case "saturation":
        return saturationMatrix(v);
      case "temperature":
        return temperatureMatrix(v);
      case "tint":
        return tintMatrix(v);
      case "hue":
        return hueMatrix(v);
      default:
        return IDENTITY;
    }
  }
  function composeAdjustments(ops, schema, space = "srgb") {
    const byType = /* @__PURE__ */ new Map();
    for (const op of ops) {
      byType.set(op.type, op.v);
    }
    let matrix = IDENTITY;
    let exposure = 1;
    for (const type of MATRIX_OP_ORDER) {
      const value = byType.get(type);
      if (value === void 0) {
        continue;
      }
      const rest = schema[type]?.default ?? 0;
      if (Math.abs(value - rest) < 1e-9) {
        continue;
      }
      if (type === "exposure" && space === "linear") {
        exposure = exposureGain(value);
        continue;
      }
      matrix = multiply(matrixForOp(type, value), matrix);
    }
    return {
      matrix,
      exposure,
      vibrance: byType.get("vibrance") ?? 0,
      sharpen: byType.get("sharpen") ?? 0,
      vignette: byType.get("vignette") ?? 0,
      grain: byType.get("grain") ?? 0,
      blur: byType.get("blur") ?? 0
    };
  }
  const ADJUST_VERT = (
    /* glsl */
    `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
	vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

	position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
	position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

	return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
	return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
	gl_Position = filterVertexPosition();
	vTextureCoord = filterTextureCoord();
}
`
  );
  const ADJUST_FRAG = (
    /* glsl */
    `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLut;

/*
 * Filter-stage uniforms Pixi supplies. uInputClamp carries the valid texture
 * coordinates of the filtered area as (minX, minY, maxX, maxY), which is how the
 * vignette finds the centre of the image rather than of whatever padding the
 * filter system allocated around it.
 *
 * uOutputFrame is deliberately not used here: it is a vertex-stage uniform, and
 * declaring it in the fragment shader stops the program linking.
 */
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;

uniform float uColorMatrix[20];
uniform float uVibrance;
uniform float uLutMix;
uniform float uSharpen;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform float uExposure;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

/**
 * The sRGB transfer curve, and its inverse.
 *
 * The piecewise IEC 61966-2-1 definition rather than a plain 2.2 power: the linear
 * segment near black is what keeps the darkest few values from collapsing into each
 * other and back, which on an 8-bit shadow is visible as posterisation.
 */
vec3 toLinear( vec3 c )
{
	return mix(
		c / 12.92,
		pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ),
		step( vec3( 0.04045 ), c )
	);
}

vec3 toSrgb( vec3 c )
{
	return mix(
		c * 12.92,
		1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055,
		step( vec3( 0.0031308 ), c )
	);
}

/**
 * Scales saturation by how unsaturated a pixel already is.
 *
 * Vibrance is the one adjustment that cannot join the colour matrix: the amount of
 * the effect depends on the pixel, so it is not a linear transform. Muted colours
 * get the full push while already-vivid ones are left alone, which is what stops a
 * saturation boost from turning a red jacket into a solid block.
 */
vec3 applyVibrance( vec3 color, float amount )
{
	float mx = max( color.r, max( color.g, color.b ) );
	float mn = min( color.r, min( color.g, color.b ) );
	float chroma = mx - mn;
	float luma = dot( color, LUMA );

	float scale = 1.0 + amount * ( 1.0 - chroma );

	return mix( vec3( luma ), color, scale );
}

/**
 * Cheap hash for film grain.
 *
 * Deterministic in screen space and seeded per render, so the grain is stable while
 * a slider is dragged rather than crawling, but a save does not reproduce the exact
 * pattern the preview showed -- which nobody can tell apart and which costs nothing.
 */
float hash( vec2 p )
{
	return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

void main( void )
{
	vec4 color = texture( uTexture, vTextureCoord );

	if ( uSharpen > 0.0 ) {
		// Unsharp mask: subtract a small blur, add the difference back.
		//
		// The offset is one texel of the *render target*, so the effect scales with
		// whatever is being drawn. That is what keeps a sharpen previewed at 900px
		// looking the same when saved at 6000px, instead of vanishing.
		vec2 texel = uInputSize.zw;

		vec4 blurred =
			texture( uTexture, vTextureCoord + vec2( texel.x, 0.0 ) ) +
			texture( uTexture, vTextureCoord - vec2( texel.x, 0.0 ) ) +
			texture( uTexture, vTextureCoord + vec2( 0.0, texel.y ) ) +
			texture( uTexture, vTextureCoord - vec2( 0.0, texel.y ) );

		blurred *= 0.25;

		color += ( color - blurred ) * uSharpen * 1.5;
	}

	if ( color.a > 0.0 ) {
		color.rgb /= color.a;
	}

	if ( uExposure != 1.0 ) {
		// Exposure in linear light. A stop is a doubling of the light that reached the
		// sensor, and the stored value is not that light -- it is the light through the
		// sRGB transfer curve. Multiplying the stored value instead is what makes a
		// "+1 stop" in most browser editors land somewhere other than where the same
		// correction in a raw developer would.
		//
		// Only when the working space is linear: in sRGB this uniform is 1 and the
		// exposure travels inside the colour matrix, exactly as it always did.
		color.rgb = clamp( toSrgb( toLinear( clamp( color.rgb, 0.0, 1.0 ) ) * uExposure ), 0.0, 1.0 );
	}

	vec4 result;

	result.r = uColorMatrix[0] * color.r + uColorMatrix[1] * color.g
		+ uColorMatrix[2] * color.b + uColorMatrix[3] * color.a + uColorMatrix[4];
	result.g = uColorMatrix[5] * color.r + uColorMatrix[6] * color.g
		+ uColorMatrix[7] * color.b + uColorMatrix[8] * color.a + uColorMatrix[9];
	result.b = uColorMatrix[10] * color.r + uColorMatrix[11] * color.g
		+ uColorMatrix[12] * color.b + uColorMatrix[13] * color.a + uColorMatrix[14];
	result.a = uColorMatrix[15] * color.r + uColorMatrix[16] * color.g
		+ uColorMatrix[17] * color.b + uColorMatrix[18] * color.a + uColorMatrix[19];

	if ( uVibrance != 0.0 ) {
		result.rgb = applyVibrance( clamp( result.rgb, 0.0, 1.0 ), uVibrance );
	}

	result.rgb = clamp( result.rgb, 0.0, 1.0 );

	if ( uVignette != 0.0 || uGrain > 0.0 ) {
		// Position across the filtered area, 0..1, independent of any padding the
		// filter system added around it.
		vec2 span = max( uInputClamp.zw - uInputClamp.xy, vec2( 1e-6 ) );
		vec2 uv = ( vTextureCoord - uInputClamp.xy ) / span;

		if ( uVignette != 0.0 ) {
			// Distance from centre, normalised so the corners sit at 1.
			float d = length( uv - 0.5 ) / 0.7071;
			float falloff = smoothstep( 0.35, 1.0, d );

			result.rgb *= 1.0 - falloff * uVignette;
		}

		if ( uGrain > 0.0 ) {
			float noise = hash( gl_FragCoord.xy + uSeed ) - 0.5;

			// Weighted towards the midtones. Grain in a blown highlight or a
			// crushed shadow only reads as sensor noise, never as film.
			float luma = dot( result.rgb, LUMA );
			float weight = 1.0 - abs( luma - 0.5 ) * 2.0;

			result.rgb += noise * uGrain * 0.25 * weight;
		}

		result.rgb = clamp( result.rgb, 0.0, 1.0 );
	}

	if ( uLutMix > 0.0 ) {
		// One fetch per channel: levels, the master curve and the per-channel curve
		// are all baked into this table before it is uploaded.
		//
		// Sampled at (v * 255 + 0.5) / 256 rather than at v. A 256-texel table's
		// texel centres sit at those half-offsets, and sampling at v instead would
		// land on a boundary and blend two neighbouring entries -- turning an
		// intentionally hard step in a curve into a soft one.
		vec3 coord = ( result.rgb * 255.0 + 0.5 ) / 256.0;

		result.r = texture( uLut, vec2( coord.r, 0.5 ) ).r;
		result.g = texture( uLut, vec2( coord.g, 0.5 ) ).g;
		result.b = texture( uLut, vec2( coord.b, 0.5 ) ).b;
	}

	finalColor = vec4( result.rgb * result.a, result.a );
}
`
  );
  const ADJUST_WGSL = (
    /* wgsl */
    `
struct GlobalFilterUniforms {
	uInputSize: vec4<f32>,
	uInputPixel: vec4<f32>,
	uInputClamp: vec4<f32>,
	uOutputFrame: vec4<f32>,
	uGlobalFrame: vec4<f32>,
	uOutputTexture: vec4<f32>,
};

struct AdjustUniforms {
	uColorMatrix: array<vec4<f32>, 5>,
	uVibrance: f32,
	uLutMix: f32,
	uSharpen: f32,
	uVignette: f32,
	uGrain: f32,
	uSeed: f32,
	uExposure: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@group(1) @binding(0) var<uniform> adjustUniforms: AdjustUniforms;
@group(1) @binding(1) var uLut: texture_2d<f32>;
@group(1) @binding(2) var uLutSampler: sampler;

const LUMA = vec3<f32>( 0.2126, 0.7152, 0.0722 );

struct VSOutput {
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
};

fn filterVertexPosition( aPosition: vec2<f32> ) -> vec4<f32>
{
	var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;

	position.x = position.x * ( 2.0 / gfu.uOutputTexture.x ) - 1.0;
	position.y = position.y * ( 2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y ) - gfu.uOutputTexture.z;

	return vec4<f32>( position, 0.0, 1.0 );
}

fn filterTextureCoord( aPosition: vec2<f32> ) -> vec2<f32>
{
	return aPosition * ( gfu.uOutputFrame.zw * gfu.uInputSize.zw );
}

@vertex
fn mainVertex( @location(0) aPosition: vec2<f32> ) -> VSOutput
{
	return VSOutput(
		filterVertexPosition( aPosition ),
		filterTextureCoord( aPosition ),
	);
}

/** The sRGB transfer curve, and its inverse. See the GLSL twin for why it is piecewise. */
fn toLinear( c: vec3<f32> ) -> vec3<f32>
{
	return mix(
		c / 12.92,
		pow( ( c + 0.055 ) / 1.055, vec3<f32>( 2.4 ) ),
		step( vec3<f32>( 0.04045 ), c )
	);
}

fn toSrgb( c: vec3<f32> ) -> vec3<f32>
{
	return mix(
		c * 12.92,
		1.055 * pow( c, vec3<f32>( 1.0 / 2.4 ) ) - 0.055,
		step( vec3<f32>( 0.0031308 ), c )
	);
}

/** Scales saturation by how unsaturated a pixel already is. */
fn applyVibrance( color: vec3<f32>, amount: f32 ) -> vec3<f32>
{
	let mx = max( color.r, max( color.g, color.b ) );
	let mn = min( color.r, min( color.g, color.b ) );
	let chroma = mx - mn;
	let luma = dot( color, LUMA );
	let scale = 1.0 + amount * ( 1.0 - chroma );

	return mix( vec3<f32>( luma ), color, vec3<f32>( scale ) );
}

/** Cheap hash for film grain. */
fn hash( p: vec2<f32> ) -> f32
{
	return fract( sin( dot( p, vec2<f32>( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

@fragment
fn mainFragment(
	@builtin(position) position: vec4<f32>,
	@location(0) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
	var color = textureSample( uTexture, uSampler, uv );

	if ( adjustUniforms.uSharpen > 0.0 ) {
		// Unsharp mask, at one texel of the render target -- which is what keeps a
		// sharpen previewed at 900px looking the same saved at 6000px.
		let texel = gfu.uInputSize.zw;

		var blurred =
			textureSample( uTexture, uSampler, uv + vec2<f32>( texel.x, 0.0 ) ) +
			textureSample( uTexture, uSampler, uv - vec2<f32>( texel.x, 0.0 ) ) +
			textureSample( uTexture, uSampler, uv + vec2<f32>( 0.0, texel.y ) ) +
			textureSample( uTexture, uSampler, uv - vec2<f32>( 0.0, texel.y ) );

		blurred *= 0.25;

		color += ( color - blurred ) * adjustUniforms.uSharpen * 1.5;
	}

	if ( color.a > 0.0 ) {
		color = vec4<f32>( color.rgb / color.a, color.a );
	}

	if ( adjustUniforms.uExposure != 1.0 ) {
		// Exposure in linear light; 1.0 in an sRGB working space, where it rides in
		// the colour matrix instead.
		color = vec4<f32>(
			clamp( toSrgb( toLinear( clamp( color.rgb, vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ) ) * adjustUniforms.uExposure ), vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ),
			color.a
		);
	}

	let cm = adjustUniforms.uColorMatrix;
	var result = vec4<f32>( 0.0 );

	result.r = cm[0][0] * color.r + cm[0][1] * color.g + cm[0][2] * color.b
		+ cm[0][3] * color.a + cm[1][0];
	result.g = cm[1][1] * color.r + cm[1][2] * color.g + cm[1][3] * color.b
		+ cm[2][0] * color.a + cm[2][1];
	result.b = cm[2][2] * color.r + cm[2][3] * color.g + cm[3][0] * color.b
		+ cm[3][1] * color.a + cm[3][2];
	result.a = cm[3][3] * color.r + cm[4][0] * color.g + cm[4][1] * color.b
		+ cm[4][2] * color.a + cm[4][3];

	if ( adjustUniforms.uVibrance != 0.0 ) {
		result = vec4<f32>(
			applyVibrance( clamp( result.rgb, vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ), adjustUniforms.uVibrance ),
			result.a
		);
	}

	result = vec4<f32>( clamp( result.rgb, vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ), result.a );

	if ( adjustUniforms.uVignette != 0.0 || adjustUniforms.uGrain > 0.0 ) {
		let span = max( gfu.uInputClamp.zw - gfu.uInputClamp.xy, vec2<f32>( 1e-6 ) );
		let local = ( uv - gfu.uInputClamp.xy ) / span;

		if ( adjustUniforms.uVignette != 0.0 ) {
			let d = length( local - 0.5 ) / 0.7071;
			let falloff = smoothstep( 0.35, 1.0, d );

			result = vec4<f32>( result.rgb * ( 1.0 - falloff * adjustUniforms.uVignette ), result.a );
		}

		if ( adjustUniforms.uGrain > 0.0 ) {
			let noise = hash( position.xy + adjustUniforms.uSeed ) - 0.5;
			let luma = dot( result.rgb, LUMA );
			let weight = 1.0 - abs( luma - 0.5 ) * 2.0;

			result = vec4<f32>(
				result.rgb + noise * adjustUniforms.uGrain * 0.25 * weight,
				result.a
			);
		}

		result = vec4<f32>( clamp( result.rgb, vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ), result.a );
	}

	if ( adjustUniforms.uLutMix > 0.0 ) {
		// Sampled at texel centres, so a hard step in a curve stays hard.
		let coord = ( result.rgb * 255.0 + 0.5 ) / 256.0;

		result = vec4<f32>(
			textureSample( uLut, uLutSampler, vec2<f32>( coord.r, 0.5 ) ).r,
			textureSample( uLut, uLutSampler, vec2<f32>( coord.g, 0.5 ) ).g,
			textureSample( uLut, uLutSampler, vec2<f32>( coord.b, 0.5 ) ).b,
			result.a
		);
	}

	return vec4<f32>( result.rgb * result.a, result.a );
}
`
  );
  const IDENTITY_MATRIX = [
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0
  ];
  const BLUR_FRACTION = 0.04;
  class AdjustPipeline {
    /**
     * @param gpu    Drawing context.
     * @param schema Op table, used to skip adjustments sitting at rest.
     */
    constructor(gpu, schema) {
      this.uniforms = {
        matrix: [],
        exposure: 1,
        vibrance: 0,
        sharpen: 0,
        vignette: 0,
        grain: 0,
        blur: 0
      };
      this.space = "srgb";
      this.ops = [];
      this.lut = null;
      this.lutActive = false;
      this.bypassed = false;
      this.seed = Math.floor(Math.random() * 1e3);
      this.gpu = gpu;
      this.schema = schema;
    }
    /** Whether the blur pass is currently doing anything. */
    get hasBlur() {
      return this.uniforms.blur > 0;
    }
    /** Whether the adjustments are currently being skipped. */
    get bypass() {
      return this.bypassed;
    }
    /**
     * Builds a fresh adjustment filter.
     *
     * A new instance per call, deliberately. A Pixi filter holds per-instance uniform
     * buffers, so sharing one between two concurrent render targets is asking for the
     * wrong values on one of them.
     *
     * `uColorMatrix` is declared with `size: 20` so Pixi uploads it as a GLSL array
     * uniform rather than a scalar.
     */
    build() {
      const uniforms = new this.gpu.pixi.UniformGroup({
        uColorMatrix: { value: [...IDENTITY_MATRIX], type: "f32", size: 20 },
        uVibrance: { value: 0, type: "f32" },
        uLutMix: { value: 0, type: "f32" },
        uSharpen: { value: 0, type: "f32" },
        uVignette: { value: 0, type: "f32" },
        uGrain: { value: 0, type: "f32" },
        uSeed: { value: 0, type: "f32" },
        uExposure: { value: 1, type: "f32" }
      });
      return new this.gpu.pixi.Filter({
        glProgram: this.gpu.pixi.GlProgram.from({
          vertex: ADJUST_VERT,
          fragment: ADJUST_FRAG,
          name: "lienzo-adjust"
        }),
        // The WebGPU half. Pixi picks a program by backend and *skips* a filter
        // that has none for the active one, with no error and no visible sign
        // beyond the image looking unedited -- which is why this shipping is what
        // lets the renderer stop pinning itself to WebGL.
        gpuProgram: this.gpu.pixi.GpuProgram.from({
          vertex: { source: ADJUST_WGSL, entryPoint: "mainVertex" },
          fragment: { source: ADJUST_WGSL, entryPoint: "mainFragment" }
        }),
        resources: {
          adjustUniforms: uniforms,
          // A second texture needs both its source and its sampler style. Binding
          // only the source leaves the sampler unresolved and the program fails to
          // link -- which surfaces as "Could not initialize shader" and a blank
          // canvas, because Pixi silently skips a filter it could not compile.
          //
          // Their order here is the order of the `@group(1)` bindings in the WGSL.
          uLut: this.lutTexture().source,
          uLutSampler: this.lutTexture().source.style
        }
      });
    }
    /**
     * The tone lookup table texture, created on first use.
     *
     * Sampled with nearest-neighbour filtering. Linear filtering would blend adjacent
     * entries and quietly soften any hard step a user deliberately put in a curve.
     */
    lutTexture() {
      if (!this.lut) {
        this.lut = new this.gpu.pixi.Texture({
          source: new this.gpu.pixi.BufferImageSource({
            resource: buildLut(),
            width: 256,
            height: 1,
            scaleMode: "nearest",
            alphaMode: "premultiply-alpha-on-upload"
          })
        });
      }
      return this.lut;
    }
    /**
     * Rebuilds the tone table from curves and levels.
     *
     * @param curves Curve set.
     * @param levels Levels.
     */
    setTone(curves, levels) {
      const source = this.lutTexture().source;
      source.resource.set(buildLut(curves, levels));
      source.update();
      this.lutActive = !(isIdentityCurves(curves) && isIdentityLevels(levels));
    }
    /**
     * Sets the adjustments to render.
     *
     * @param ops Recipe ops.
     * @return True when the blur pass was switched on or off, so the chain needs
     *         rebuilding.
     */
    setOps(ops) {
      const hadBlur = this.hasBlur;
      this.ops = ops;
      this.uniforms = composeAdjustments(ops, this.schema, this.space);
      return hadBlur !== this.hasBlur;
    }
    /**
     * Sets the working space the adjustments are computed in.
     *
     * The ops are recomposed rather than merely flagged, because the space decides
     * whether exposure belongs in the colour matrix or beside it.
     *
     * @param space Working space.
     * @return True when the state changed.
     */
    setSpace(space) {
      if (this.space === space) {
        return false;
      }
      this.space = space;
      this.uniforms = composeAdjustments(this.ops, this.schema, space);
      return true;
    }
    /**
     * Temporarily shows the unedited image, for a before/after comparison.
     *
     * @param bypass Whether to skip the adjustments.
     * @return True when the state changed.
     */
    setBypass(bypass) {
      if (this.bypassed === bypass) {
        return false;
      }
      this.bypassed = bypass;
      return true;
    }
    /**
     * The blur radius for a given render width.
     *
     * @param width Width being rendered, in pixels.
     */
    blurStrength(width) {
      return Math.max(0.1, this.uniforms.blur * BLUR_FRACTION * width);
    }
    /**
     * Pushes the current uniforms onto a filter.
     *
     * @param filter Filter to update.
     */
    applyTo(filter) {
      const group = filter.resources.adjustUniforms;
      const off = this.bypassed;
      group.uniforms.uColorMatrix = off ? [...IDENTITY_MATRIX] : this.uniforms.matrix;
      group.uniforms.uVibrance = off ? 0 : this.uniforms.vibrance;
      group.uniforms.uLutMix = !off && this.lutActive ? 1 : 0;
      group.uniforms.uSharpen = off ? 0 : this.uniforms.sharpen;
      group.uniforms.uVignette = off ? 0 : this.uniforms.vignette;
      group.uniforms.uGrain = off ? 0 : this.uniforms.grain;
      group.uniforms.uSeed = this.seed;
      group.uniforms.uExposure = off ? 1 : this.uniforms.exposure;
    }
    /** Frees the tone table. */
    release() {
      this.lut?.destroy(true);
      this.lut = null;
    }
  }
  function placeLayer(sprite, transform, canvas) {
    const { x, y, scaleX, scaleY, rotation, flipH, flipV } = transform;
    sprite.anchor.set(0.5);
    sprite.scale.set(scaleX * (flipH ? -1 : 1), scaleY * (flipV ? -1 : 1));
    sprite.rotation = rotation * Math.PI / 180;
    sprite.position.set(x * canvas.width, y * canvas.height);
  }
  class DocumentCompositor {
    /**
     * @param gpu    Drawing context.
     * @param layers Layer textures.
     */
    constructor(gpu, layers) {
      this.target = null;
      this.gpu = gpu;
      this.layers = layers;
    }
    /** The composed texture, or null before anything has been composed. */
    get texture() {
      return this.target;
    }
    /**
     * Redraws the layer stack onto the canvas.
     *
     * @param canvas Output surface size.
     * @param stack  Layers, back to front.
     * @param source The loaded image, which backs the base layer.
     * @param hidden Optional. A layer to leave out without changing the document --
     *               the text layer whose words are being retyped on top of it.
     */
    compose(canvas, stack, source, hidden = null) {
      this.release();
      if (!source || canvas.width <= 0 || canvas.height <= 0) {
        return;
      }
      if (!this.layers.has(BASE_LAYER_ID)) {
        this.layers.set(BASE_LAYER_ID, source);
      }
      const target = this.gpu.createTarget(canvas.width, canvas.height, true);
      const holder = this.gpu.container();
      for (const layer of stack) {
        const texture = this.layers.get(layer.id);
        if (!texture || !layer.visible || layer.opacity <= 0 || layer.id === hidden) {
          continue;
        }
        const sprite = this.gpu.sprite(texture);
        placeLayer(sprite, layer.transform, canvas);
        sprite.alpha = layer.opacity;
        holder.addChild(sprite);
      }
      this.gpu.draw(holder, target, true);
      holder.destroy({ children: true });
      this.target = target;
    }
    /**
     * Reads the composed document as raw bytes, for flood fill.
     *
     * Through a resolve, because the composed texture is half-float where the GPU
     * allows it and half-float samples read back as bytes are not the numbers anyone
     * wanted. The blit costs one full-canvas draw and only happens when something asks
     * for pixels -- the eyedropper, the wand, the paint bucket -- never per frame.
     */
    readPixels() {
      if (!this.target) {
        return null;
      }
      const resolved = this.gpu.resolve(this.target);
      try {
        return this.gpu.extractPixels(resolved.texture);
      } finally {
        if (resolved.owned) {
          resolved.texture.destroy(true);
        }
      }
    }
    /**
     * Reads one composed pixel.
     *
     * @param x Canvas coordinate.
     * @param y Canvas coordinate.
     * @return Channels 0..255, or null when there is nothing there.
     */
    samplePixel(x, y) {
      const read = this.readPixels();
      if (!read) {
        return null;
      }
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= read.width || py >= read.height) {
        return null;
      }
      const index = (py * read.width + px) * 4;
      return [
        read.pixels[index],
        read.pixels[index + 1],
        read.pixels[index + 2],
        read.pixels[index + 3]
      ];
    }
    /**
     * Reads the image alone, with every painted layer left out.
     *
     * What the history brush paints from. Composed on demand rather than snapshotted at
     * load, because holding a second full-resolution copy of a twenty-megapixel photo
     * for the whole session -- against the chance that one brush gets used -- is the
     * kind of cost that only shows up on someone else's machine.
     *
     * @param canvas Output surface size.
     * @param stack  Layers, back to front.
     * @param source The loaded image.
     * @return Canvas-aligned pixels, or null when nothing is loaded.
     */
    readPristine(canvas, stack, source) {
      const base = this.layers.get(BASE_LAYER_ID) ?? source;
      const layer = stack.find((entry) => BASE_LAYER_ID === entry.id);
      if (!base || !layer || canvas.width <= 0 || canvas.height <= 0) {
        return null;
      }
      const target = this.gpu.createTarget(canvas.width, canvas.height);
      const sprite = this.gpu.sprite(base);
      placeLayer(sprite, layer.transform, canvas);
      this.gpu.draw(sprite, target, true);
      const read = this.gpu.extractPixels(target);
      sprite.destroy();
      target.destroy(true);
      return { pixels: read.pixels, width: canvas.width, height: canvas.height };
    }
    /**
     * Reads part of the composed document back as pixels, for copy.
     *
     * @param x      Left edge, in canvas pixels.
     * @param y      Top edge, in canvas pixels.
     * @param width  Region width.
     * @param height Region height.
     */
    extractRegion(x, y, width, height) {
      if (!this.target || width < 1 || height < 1) {
        return null;
      }
      const resolved = this.gpu.resolve(this.target);
      const full = this.gpu.extractCanvas(resolved.texture);
      if (resolved.owned) {
        resolved.texture.destroy(true);
      }
      const out = document.createElement("canvas");
      out.width = Math.round(width);
      out.height = Math.round(height);
      const context = out.getContext("2d");
      if (!context) {
        return null;
      }
      context.drawImage(
        full,
        Math.round(x),
        Math.round(y),
        out.width,
        out.height,
        0,
        0,
        out.width,
        out.height
      );
      return out;
    }
    /** Frees the composed texture. */
    release() {
      this.target?.destroy(true);
      this.target = null;
    }
  }
  const LUMA_R_256 = 55;
  const LUMA_G_256 = 183;
  const LUMA_B_256 = 18;
  function histogramPeak(channels) {
    let interior = 0;
    let overall = 0;
    for (const bins of channels) {
      for (let i = 0; i < 256; i++) {
        const count = bins[i];
        if (count > overall) {
          overall = count;
        }
        if (i > 0 && i < 255 && count > interior) {
          interior = count;
        }
      }
    }
    return interior > 0 ? interior : overall;
  }
  function computeHistogram(pixels) {
    const r = new Uint32Array(256);
    const g = new Uint32Array(256);
    const b = new Uint32Array(256);
    const luma = new Uint32Array(256);
    let total = 0;
    for (let i = 0; i + 3 < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) {
        continue;
      }
      const red = pixels[i];
      const green = pixels[i + 1];
      const blue = pixels[i + 2];
      r[red]++;
      g[green]++;
      b[blue]++;
      luma[LUMA_R_256 * red + LUMA_G_256 * green + LUMA_B_256 * blue >> 8]++;
      total++;
    }
    return { r, g, b, luma, total, peak: histogramPeak([r, g, b, luma]) };
  }
  function emptyHistogram() {
    return {
      r: new Uint32Array(256),
      g: new Uint32Array(256),
      b: new Uint32Array(256),
      luma: new Uint32Array(256),
      total: 0,
      peak: 0
    };
  }
  const HISTOGRAM_EDGE = 256;
  const HISTOGRAM_BUDGET_MS = 8;
  const HISTOGRAM_MAX_SKIP = 4;
  class HistogramProbe {
    /**
     * @param gpu    Drawing context.
     * @param source How to build the thing being measured.
     */
    constructor(gpu, source) {
      this.listeners = /* @__PURE__ */ new Set();
      this.frame = null;
      this.skip = 0;
      this.stopped = false;
      this.gpu = gpu;
      this.source = source;
    }
    /**
     * Subscribes to histogram updates.
     *
     * @param listener Called after each recomputation.
     * @return Unsubscribe function.
     */
    subscribe(listener) {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
    /**
     * Queues a recomputation for the next animation frame.
     *
     * A slider drag fires many pointer moves per frame, so the work is coalesced to
     * one pass per frame -- the display cannot show more than that anyway. Aligning
     * to the frame also means the readback happens once the frame's drawing is
     * already queued, rather than interleaved with it.
     */
    schedule() {
      if (null !== this.frame) {
        return;
      }
      this.frame = window.requestAnimationFrame(() => {
        this.frame = null;
        if (this.skip > 0) {
          this.skip--;
          this.schedule();
          return;
        }
        this.measure();
      });
    }
    /** Renders the probe, reads it back, and notifies listeners. */
    measure() {
      const size = this.source.size();
      if (this.stopped || !size || 0 === this.listeners.size) {
        return;
      }
      const started = performance.now();
      const width = Math.max(1, Math.round(size.width * fitScale(size)));
      const height = Math.max(1, Math.round(size.height * fitScale(size)));
      let target = null;
      try {
        target = this.gpu.createTarget(width, height);
        const probe = this.source.sprite(width / size.width);
        if (!probe) {
          return;
        }
        this.gpu.draw(probe, target, true);
        const { pixels } = this.gpu.extractPixels(target);
        probe.destroy({ children: true });
        this.emit(computeHistogram(pixels));
      } catch {
        this.emit(emptyHistogram());
      } finally {
        target?.destroy(true);
      }
      const cost = performance.now() - started;
      this.skip = cost > HISTOGRAM_BUDGET_MS ? Math.min(HISTOGRAM_MAX_SKIP, Math.ceil(cost / HISTOGRAM_BUDGET_MS) - 1) : 0;
    }
    /**
     * Emits a histogram to every listener.
     *
     * @param histogram Computed histogram.
     */
    emit(histogram) {
      for (const listener of this.listeners) {
        listener(histogram);
      }
    }
    /** Cancels any pending pass and drops every listener. */
    stop() {
      this.stopped = true;
      if (null !== this.frame) {
        window.cancelAnimationFrame(this.frame);
        this.frame = null;
      }
      this.listeners.clear();
    }
  }
  function fitScale(size) {
    return Math.min(HISTOGRAM_EDGE / Math.max(size.width, size.height), 1);
  }
  class LayerTextures {
    /**
     * @param gpu Drawing context.
     */
    constructor(gpu) {
      this.textures = /* @__PURE__ */ new Map();
      this.mask = null;
      this.gpu = gpu;
    }
    /**
     * The texture behind a layer, when it has one.
     *
     * @param id Layer id.
     */
    get(id) {
      return this.textures.get(id);
    }
    /**
     * Whether a layer has a texture.
     *
     * @param id Layer id.
     */
    has(id) {
      return this.textures.has(id);
    }
    /**
     * Adopts a texture for a layer.
     *
     * @param id      Layer id.
     * @param texture Texture to adopt.
     */
    set(id, texture) {
      this.textures.set(id, texture);
    }
    /** Every texture currently held. */
    all() {
      return this.textures.values();
    }
    /**
     * The native size of whatever backs a layer.
     *
     * @param id Layer id.
     */
    sizeOf(id) {
      const texture = this.textures.get(id);
      return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
    }
    /**
     * Whether a layer's texture can be rendered into.
     *
     * @param id Layer id.
     */
    isTarget(id) {
      const texture = this.textures.get(id);
      return !!texture && this.gpu.isTarget(texture);
    }
    /**
     * Creates a raster layer's backing texture from an image.
     *
     * @param id     Layer id.
     * @param source Decoded pixels.
     */
    addRaster(id, source) {
      this.textures.get(id)?.destroy(true);
      this.textures.set(id, this.gpu.textureFrom(source));
    }
    /**
     * Creates an empty paintable texture for a layer, canvas-sized.
     *
     * @param id     Layer id.
     * @param canvas Current canvas size.
     */
    ensurePaintable(id, canvas) {
      const existing = this.textures.get(id);
      if (existing && this.gpu.isTarget(existing)) {
        return existing;
      }
      const target = this.gpu.createTarget(
        Math.max(1, canvas.width),
        Math.max(1, canvas.height)
      );
      if (existing) {
        const sprite = this.gpu.sprite(existing);
        sprite.anchor.set(0.5);
        sprite.position.set(canvas.width / 2, canvas.height / 2);
        this.gpu.draw(sprite, target, true);
        sprite.destroy();
        existing.destroy(true);
      }
      this.textures.set(id, target);
      return target;
    }
    /**
     * Frees textures for layers that can no longer come back.
     *
     * Reachability is the caller's to decide, and it is not "in the current document".
     * A layer that has merely been *undone* still exists as far as the user is
     * concerned -- one press of redo brings it back -- but its pixels live only in a
     * texture, so freeing them on undo made redo restore an empty frame.
     *
     * @param live      Layer ids in the current document.
     * @param reachable Layer ids still referenced anywhere the user can return to.
     */
    retain(live, reachable) {
      for (const [id, texture] of this.textures) {
        if (live.has(id) || reachable.has(id) || BASE_LAYER_ID === id) {
          continue;
        }
        texture.destroy(true);
        this.textures.delete(id);
      }
    }
    /**
     * Sets the mask confining every paint operation.
     *
     * @param mask Canvas-sized alpha mask, or null for no confinement.
     */
    setMask(mask) {
      this.mask?.destroy(true);
      this.mask = mask ? this.gpu.textureFrom(mask) : null;
    }
    /**
     * Wraps a sprite in the current selection mask, if there is one.
     *
     * Both the sprite and its mask have to be in the same rendered container, which
     * is why this returns a holder rather than just setting a property.
     *
     * @param sprite What to clip.
     * @return The container to render, and its teardown.
     */
    clip(sprite) {
      const holder = this.gpu.container();
      holder.addChild(sprite);
      if (!this.mask) {
        return {
          container: holder,
          release: () => holder.destroy({ children: true })
        };
      }
      const mask = this.gpu.sprite(this.mask);
      mask.position.set(0, 0);
      holder.addChild(mask);
      sprite.mask = mask;
      return {
        container: holder,
        release: () => {
          sprite.mask = null;
          holder.destroy({ children: true });
        }
      };
    }
    /**
     * Frees every layer texture except the source.
     *
     * The base layer's texture *is* the loaded source, which its owner destroys
     * separately -- releasing it twice is how a double-free surfaces as a blank canvas.
     */
    releaseAll() {
      for (const [id, texture] of this.textures) {
        if (BASE_LAYER_ID !== id) {
          texture.destroy(true);
        }
      }
      this.textures.clear();
    }
    /** Frees the mask. */
    releaseMask() {
      this.mask?.destroy(true);
      this.mask = null;
    }
  }
  function encodeCanvas(canvas, format, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(
            new Error(
              `The browser could not encode the image as ${format}. Try a different format.`
            )
          );
        },
        format,
        quality
      );
    });
  }
  function makeRenderSprite(ctx, scale) {
    const texture = ctx.texture();
    if (!texture) {
      return null;
    }
    const sprite = ctx.gpu.sprite(texture);
    const filter = ctx.adjust.build();
    sprite.anchor.set(0);
    sprite.position.set(0, 0);
    sprite.scale.set(scale);
    ctx.adjust.applyTo(filter);
    if (!ctx.adjust.bypass && ctx.adjust.hasBlur) {
      const blur = new ctx.gpu.pixi.BlurFilter({
        strength: ctx.adjust.blurStrength(texture.width * scale),
        quality: 3
      });
      sprite.filters = [blur, filter];
      return sprite;
    }
    sprite.filters = [filter];
    return sprite;
  }
  async function renderFull(ctx, format, quality, maxRenderPixels) {
    const texture = ctx.texture();
    if (!texture) {
      throw new Error("No image is loaded.");
    }
    const { width, height } = texture;
    if (width * height > maxRenderPixels) {
      throw new Error(
        `This image is too large to render in the browser (${width}x${height}).`
      );
    }
    const sprite = makeRenderSprite(ctx, 1);
    let target = null;
    try {
      target = ctx.gpu.createTarget(width, height);
      ctx.gpu.draw(sprite, target, true);
      return await encodeCanvas(ctx.gpu.extractCanvas(target), format, quality);
    } finally {
      sprite.destroy({ children: true });
      target?.destroy(true);
    }
  }
  function dabSprite(ctx, options) {
    const texture = ctx.gpu.textureFrom(options.image);
    const sprite = ctx.gpu.sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = options.size;
    sprite.height = options.size;
    sprite.position.set(options.x, options.y);
    if (!options.erase) {
      sprite.tint = options.colour;
    }
    return { sprite, release: () => texture.destroy(true) };
  }
  function fillWithMask(ctx, layerId, mask, colour, opacity, x = 0, y = 0) {
    const target = ctx.layers.ensurePaintable(layerId, ctx.canvas);
    const texture = ctx.gpu.textureFrom(mask);
    const sprite = ctx.gpu.sprite(texture);
    sprite.position.set(Math.round(x), Math.round(y));
    sprite.alpha = opacity;
    sprite.tint = colour;
    const clip = ctx.layers.clip(sprite);
    ctx.gpu.draw(clip.container, target);
    clip.release();
    texture.destroy(true);
  }
  function compositeCanvas(ctx, layerId, source, x = 0, y = 0, opacity = 1, erase = false) {
    const target = ctx.layers.ensurePaintable(layerId, ctx.canvas);
    const texture = ctx.gpu.textureFrom(source);
    const sprite = ctx.gpu.sprite(texture);
    sprite.position.set(Math.round(x), Math.round(y));
    sprite.alpha = opacity;
    if (erase) {
      sprite.blendMode = "erase";
    }
    const clip = ctx.layers.clip(sprite);
    ctx.gpu.draw(clip.container, target);
    clip.release();
    texture.destroy(true);
  }
  function extractLayerRegion(ctx, layerId, rect, source) {
    const texture = source ?? ctx.layers.get(layerId);
    if (!texture || rect.width < 1 || rect.height < 1) {
      return null;
    }
    const target = ctx.gpu.createTarget(rect.width, rect.height);
    const sprite = ctx.gpu.sprite(texture);
    sprite.position.set(-Math.round(rect.x), -Math.round(rect.y));
    ctx.gpu.draw(sprite, target, true);
    const canvas = ctx.gpu.extractCanvas(target);
    sprite.destroy();
    target.destroy(true);
    return canvas;
  }
  function restoreLayerRegion(ctx, layerId, rect, pixels) {
    const target = ctx.layers.ensurePaintable(layerId, ctx.canvas);
    const eraser = ctx.gpu.sprite(ctx.gpu.solidTexture());
    eraser.position.set(Math.round(rect.x), Math.round(rect.y));
    eraser.width = Math.round(rect.width);
    eraser.height = Math.round(rect.height);
    eraser.blendMode = "erase";
    ctx.gpu.drawDetached(eraser, target);
    if (pixels) {
      const texture = ctx.gpu.textureFrom(pixels);
      const sprite = ctx.gpu.sprite(texture);
      sprite.position.set(Math.round(rect.x), Math.round(rect.y));
      ctx.gpu.drawDetached(sprite, target);
      texture.destroy(true);
    }
  }
  function beginStroke(gpu, layers, layerId, canvas, opacity, erase) {
    const target = layers.ensurePaintable(layerId, canvas);
    const base = gpu.createTarget(target.width, target.height);
    const snapshot = gpu.sprite(target);
    gpu.draw(snapshot, base, true);
    snapshot.destroy();
    return {
      layerId,
      opacity: Math.min(1, Math.max(0, opacity)),
      erase,
      base,
      buffer: gpu.createTarget(target.width, target.height),
      target
    };
  }
  function stampIntoStroke(gpu, layers, stroke, sprite) {
    sprite.alpha = 1;
    const clip = layers.clip(sprite);
    gpu.draw(clip.container, stroke.buffer);
    clip.release();
  }
  function flushStroke(gpu, stroke) {
    const base = gpu.sprite(stroke.base);
    gpu.draw(base, stroke.target, true);
    base.destroy();
    const overlay = gpu.sprite(stroke.buffer);
    overlay.alpha = stroke.opacity;
    if (stroke.erase) {
      overlay.blendMode = "erase";
    }
    gpu.drawDetached(overlay, stroke.target);
  }
  function releaseStroke(stroke) {
    stroke.base.destroy(true);
    stroke.buffer.destroy(true);
  }
  class PaintApi {
    /**
     * @param host Renderer internals the operations run against.
     */
    constructor(host) {
      this.stroke = null;
      this.flushQueued = false;
      this.host = host;
    }
    /** The context every operation runs in. */
    get ctx() {
      return {
        gpu: this.host.gpu,
        layers: this.host.layers,
        canvas: this.host.canvas()
      };
    }
    /**
     * Creates a raster layer's backing texture from an image.
     *
     * @param id     Layer id.
     * @param source Decoded pixels.
     */
    addRasterTexture(id, source) {
      this.endStroke();
      this.host.layers.addRaster(id, source);
    }
    /**
     * Creates an empty paintable texture for a layer, canvas-sized.
     *
     * @param id Layer id.
     */
    ensurePaintTexture(id) {
      return this.host.layers.ensurePaintable(id, this.host.canvas());
    }
    /**
     * The native size of whatever backs a layer.
     *
     * @param id Layer id.
     */
    layerTextureSize(id) {
      return this.host.layers.sizeOf(id);
    }
    /**
     * Whether a layer has any pixels at all.
     *
     * @param id Layer id.
     */
    hasTexture(id) {
      return this.host.layers.has(id);
    }
    /**
     * Sets the mask confining every paint operation.
     *
     * @param mask Canvas-sized alpha mask, or null for no confinement.
     */
    setPaintMask(mask) {
      this.endStroke();
      this.host.layers.setMask(mask);
    }
    /**
     * Renders a display object into a layer's texture.
     *
     * This is how a brush stroke becomes permanent: the stroke is drawn once into the
     * layer and never re-drawn, so a long painting session costs the same per frame as
     * an empty one.
     *
     * @param id        Layer to paint into.
     * @param container What to draw.
     */
    paintInto(id, container) {
      this.endStroke();
      this.host.gpu.draw(container, this.ensurePaintTexture(id));
      this.host.onChange();
    }
    /**
     * Stamps one brush dab into a layer.
     *
     * The first dab opens a stroke and every dab after it joins the same one, until
     * `endStroke()` closes it. Within a stroke the opacity applies to the whole stroke:
     * a dab laid over another does not darken it, and a 20% eraser dragged back and
     * forth still leaves 80% of what was there -- see `stroke-buffer.ts`.
     *
     * @param layerId Target layer.
     * @param image   Stamp canvas, white with its shape in the alpha.
     * @param x       Canvas coordinates of the dab centre.
     * @param y       Canvas coordinates of the dab centre.
     * @param size    Diameter in canvas pixels.
     * @param colour  CSS colour.
     * @param opacity Stroke opacity, 0..1.
     * @param erase   Whether to remove rather than add.
     */
    stampBrush(layerId, image, x, y, size, colour, opacity, erase) {
      const current = this.stroke;
      if (current && (current.layerId !== layerId || current.erase !== erase || current.opacity !== opacity)) {
        this.endStroke();
      }
      if (!this.stroke) {
        this.stroke = beginStroke(
          this.host.gpu,
          this.host.layers,
          layerId,
          this.host.canvas(),
          opacity,
          erase
        );
      }
      const dab = dabSprite(this.ctx, {
        image,
        x,
        y,
        size,
        colour,
        erase
      });
      stampIntoStroke(this.host.gpu, this.host.layers, this.stroke, dab.sprite);
      dab.release();
      this.scheduleFlush();
    }
    /**
     * Rewrites the layer from the stroke at the end of the current task.
     *
     * A pointer event can carry a dozen interpolated dabs, and composing the layer
     * after each one would cost a dozen full-canvas passes for one visible frame. Once
     * per task is once per pointer event, which is as often as anything can be seen.
     */
    scheduleFlush() {
      if (this.flushQueued) {
        return;
      }
      this.flushQueued = true;
      queueMicrotask(() => {
        this.flushQueued = false;
        if (this.stroke) {
          flushStroke(this.host.gpu, this.stroke);
          this.host.onChange();
        }
      });
    }
    /**
     * Closes the stroke in progress, leaving the layer holding its result.
     *
     * Safe to call when there is none. Every operation that touches a layer's pixels
     * some other way calls this first, so a stroke can never be half-applied under a
     * fill, a paste or an undo.
     */
    endStroke() {
      const stroke = this.stroke;
      if (!stroke) {
        return;
      }
      this.stroke = null;
      flushStroke(this.host.gpu, stroke);
      releaseStroke(stroke);
      this.host.onChange();
    }
    /** Whether a brush stroke is being laid down right now. */
    get isStroking() {
      return this.stroke !== null;
    }
    /**
     * Paints a mask into a layer.
     *
     * @param layerId Target layer.
     * @param mask    Mask, opaque where the fill applies.
     * @param colour  CSS colour.
     * @param opacity 0..1.
     * @param x       Where the mask's top-left corner sits, in canvas pixels.
     * @param y       Where the mask's top-left corner sits, in canvas pixels.
     */
    fillWithMask(layerId, mask, colour, opacity, x = 0, y = 0) {
      this.endStroke();
      fillWithMask(this.ctx, layerId, mask, colour, opacity, x, y);
      this.host.onChange();
    }
    /**
     * Composites a bitmap onto a layer.
     *
     * @param layerId Target layer.
     * @param source  Bitmap to draw.
     * @param x       Where its top-left corner lands, in canvas pixels.
     * @param y       Where its top-left corner lands, in canvas pixels.
     * @param opacity 0..1.
     * @param erase   Whether to cut the shape out rather than draw it.
     */
    compositeCanvas(layerId, source, x = 0, y = 0, opacity = 1, erase = false) {
      this.endStroke();
      compositeCanvas(this.ctx, layerId, source, x, y, opacity, erase);
      this.host.onChange();
    }
    /**
     * Reads one rectangle of a layer's pixels.
     *
     * During a stroke on that layer the read comes from the snapshot the stroke keeps,
     * so undo captures the pixels as they were before the brush touched them.
     *
     * @param layerId Layer to read.
     * @param rect    Region, in canvas pixels.
     */
    extractLayerRegion(layerId, rect) {
      const source = this.stroke && this.stroke.layerId === layerId ? this.stroke.base : void 0;
      return extractLayerRegion(this.ctx, layerId, rect, source);
    }
    /**
     * Reads a whole layer back as a canvas, for saving its pixels.
     *
     * @param layerId Layer to read.
     * @return The pixels, or null when the layer has no texture.
     */
    extractLayerCanvas(layerId) {
      this.endStroke();
      const gpu = this.host.gpu;
      const texture = this.host.layers.get(layerId);
      if (!texture) {
        return null;
      }
      const resolved = gpu.isTarget(texture) ? gpu.resolve(texture) : { texture, owned: false };
      try {
        return gpu.extractCanvas(resolved.texture);
      } finally {
        if (resolved.owned) {
          resolved.texture.destroy(true);
        }
      }
    }
    /**
     * Encodes a layer's pixels as a PNG.
     *
     * PNG regardless of the document's output format: a layer is mostly transparent,
     * and its pixels have to come back exactly, not approximately.
     *
     * @param layerId Layer to encode.
     * @return The encoded pixels, or null when the layer has none.
     */
    async exportLayer(layerId) {
      const canvas = this.extractLayerCanvas(layerId);
      return canvas ? encodeCanvas(canvas, "image/png", 1) : null;
    }
    /**
     * Puts one rectangle of a layer back to a previous state.
     *
     * @param layerId Layer to write.
     * @param rect    Region, in canvas pixels.
     * @param pixels  What to put there, or null to leave it empty.
     */
    restoreLayerRegion(layerId, rect, pixels) {
      this.endStroke();
      restoreLayerRegion(this.ctx, layerId, rect, pixels);
      this.host.onChange();
    }
    /**
     * Drops a stroke in progress without writing it.
     *
     * For teardown, where the GPU is about to go and drawing into it would be wasted.
     */
    dispose() {
      const stroke = this.stroke;
      this.stroke = null;
      if (stroke) {
        releaseStroke(stroke);
      }
    }
  }
  class ScreenFilters {
    /**
     * @param gpu    Drawing context.
     * @param adjust The pipeline holding the uniform values.
     */
    constructor(gpu, adjust) {
      this.sprite = null;
      this.filter = null;
      this.blur = null;
      this.gpu = gpu;
      this.adjust = adjust;
    }
    /**
     * Puts the chain on a newly created sprite.
     *
     * @param sprite Sprite to filter.
     */
    attach(sprite) {
      this.sprite = sprite;
      this.filter = this.adjust.build();
      this.rebuildChain();
      sprite.filters ?? (sprite.filters = [this.filter]);
      this.applyUniforms();
    }
    /**
     * Rebuilds the tone table from curves and levels.
     *
     * @param curves Curve set.
     * @param levels Levels.
     */
    setTone(curves, levels) {
      this.adjust.setTone(curves, levels);
      this.applyUniforms();
    }
    /**
     * Sets the adjustments to render.
     *
     * The space first, because it decides whether exposure is composed into the colour
     * matrix or handed to the shader beside it.
     *
     * @param ops        Recipe ops.
     * @param space      Working space the adjustments are computed in.
     * @param blurTarget Width the blur radius should be scaled to.
     */
    setOps(ops, space, blurTarget) {
      this.adjust.setSpace(space);
      if (this.adjust.setOps(ops)) {
        this.rebuildChain();
      }
      this.refreshBlur(blurTarget);
      this.applyUniforms();
    }
    /**
     * Temporarily shows the unedited image.
     *
     * @param bypass Whether to skip the adjustments.
     * @return True when the state changed, so the caller can re-measure.
     */
    setBypass(bypass) {
      if (!this.adjust.setBypass(bypass)) {
        return false;
      }
      this.applyUniforms();
      return true;
    }
    /**
     * Scales the blur radius to whatever is being rendered.
     *
     * The stored value is a fraction of the longest edge, so a blur previewed on a
     * 900px canvas survives being saved at 6000px instead of becoming imperceptible.
     *
     * @param width Width being rendered, in pixels.
     */
    refreshBlur(width) {
      if (this.blur && this.adjust.hasBlur) {
        this.blur.strength = this.adjust.blurStrength(width);
      }
    }
    /** Adds or removes the blur pass. */
    rebuildChain() {
      if (!this.sprite || !this.filter) {
        return;
      }
      if (!this.adjust.hasBlur) {
        this.sprite.filters = [this.filter];
        return;
      }
      this.blur ?? (this.blur = new this.gpu.pixi.BlurFilter({ strength: 1, quality: 3 }));
      this.sprite.filters = [this.blur, this.filter];
    }
    /** Pushes the current uniforms onto the on-screen filter. */
    applyUniforms() {
      if (this.filter) {
        this.adjust.applyTo(this.filter);
      }
    }
    /** Forgets the sprite's filter, which is destroyed along with the sprite. */
    release() {
      this.sprite = null;
      this.filter = null;
    }
  }
  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 16;
  const INSET = 48;
  const RULER_GUTTER = 20;
  class Camera {
    constructor() {
      this.zoomLevel = 1;
      this.panX = 0;
      this.panY = 0;
      this.listeners = /* @__PURE__ */ new Set();
    }
    /** Current zoom, where 1 means fitted to the stage. */
    get zoom() {
      return this.zoomLevel;
    }
    /** Current pan offset, in CSS pixels. */
    get pan() {
      return { x: this.panX, y: this.panY };
    }
    /**
     * Scale that fits an image inside the stage, never magnifying past 1:1.
     *
     * Upscaling a small image to fill the viewport would show interpolation artefacts
     * and mislead the user about the detail they actually have.
     *
     * @param stage   Stage size in CSS pixels.
     * @param texture Image size in pixels.
     * @param gutter  Extra inset for the rulers.
     */
    fitScale(stage, texture, gutter) {
      const available = {
        width: Math.max(1, stage.width - INSET - gutter),
        height: Math.max(1, stage.height - INSET - gutter)
      };
      return Math.min(
        available.width / texture.width,
        available.height / texture.height,
        1
      );
    }
    /**
     * Where the sprite's centre goes, in stage CSS pixels.
     *
     * @param stage  Stage size.
     * @param gutter Extra inset for the rulers.
     */
    centre(stage, gutter) {
      return {
        x: (stage.width + gutter) / 2 + this.panX,
        y: (stage.height + gutter) / 2 + this.panY
      };
    }
    /**
     * The rectangle the image occupies.
     *
     * The crop overlay needs this to draw over the image rather than over the
     * letterboxing around it.
     *
     * @param stage   Stage size.
     * @param texture Image size in pixels.
     * @param scale   On-screen scale currently applied to the sprite.
     * @param gutter  Extra inset for the rulers.
     */
    viewport(stage, texture, scale, gutter) {
      const width = texture.width * scale;
      const height = texture.height * scale;
      return {
        x: (stage.width - width + gutter) / 2 + this.panX,
        y: (stage.height - height + gutter) / 2 + this.panY,
        width,
        height
      };
    }
    /**
     * Scrolls the pasteboard.
     *
     * @param dx Horizontal movement in CSS pixels.
     * @param dy Vertical movement in CSS pixels.
     */
    scrollBy(dx, dy) {
      this.panX += dx;
      this.panY += dy;
    }
    /**
     * Zooms about a point, keeping whatever is under it in place.
     *
     * Anchoring to the pointer rather than to the centre is what makes wheel-zoom feel
     * like a map instead of a slideshow: the detail you were looking at is still under
     * the cursor afterwards.
     *
     * @param factor  Multiplier on the current zoom.
     * @param originX Anchor point, in stage CSS pixels.
     * @param originY Anchor point, in stage CSS pixels.
     * @param stage   Stage size.
     * @return True when the zoom actually moved.
     */
    zoomAt(factor, originX, originY, stage) {
      const previous = this.zoomLevel;
      const next = clampZoom(previous * factor);
      if (next === previous) {
        return false;
      }
      const centreX = stage.width / 2 + this.panX;
      const centreY = stage.height / 2 + this.panY;
      const ratio = next / previous;
      this.panX += (centreX - originX) * (ratio - 1);
      this.panY += (centreY - originY) * (ratio - 1);
      this.zoomLevel = next;
      return true;
    }
    /**
     * Zooms so one canvas pixel covers one CSS pixel, and recentres.
     *
     * `zoom` is relative to the fitted size, not absolute, so getting to 100% means
     * cancelling out whatever the fit came to.
     *
     * @param spriteScale The scale currently applied on screen.
     */
    zoomToActual(spriteScale) {
      const fitted = spriteScale / Math.max(this.zoomLevel, 1e-6);
      this.zoomLevel = clampZoom(1 / Math.max(fitted, 1e-6));
      this.panX = 0;
      this.panY = 0;
    }
    /** Returns the view to a centred, fitted position. */
    reset() {
      this.zoomLevel = 1;
      this.panX = 0;
      this.panY = 0;
    }
    /**
     * Subscribes to view changes, so overlays can follow a resize.
     *
     * @param listener Called after each re-fit.
     * @return Unsubscribe function.
     */
    onChange(listener) {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
    /** Tells every listener the view moved. */
    emit() {
      for (const listener of this.listeners) {
        listener();
      }
    }
    /** Drops every listener. */
    clear() {
      this.listeners.clear();
    }
  }
  function clampZoom(value) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }
  const NEAREST_ABOVE = 1.05;
  function applySampling(scale, textures) {
    const wanted = scale > NEAREST_ABOVE ? "nearest" : "linear";
    for (const texture of textures) {
      if (!texture) {
        continue;
      }
      const source = texture.source;
      if (source.scaleMode === wanted) {
        continue;
      }
      source.scaleMode = wanted;
      if (source.style) {
        source.style.scaleMode = wanted;
        source.style.update?.();
      }
    }
  }
  class ViewController {
    /**
     * @param gpu     Drawing context.
     * @param host    Element the canvas fills.
     * @param subject What is being displayed.
     */
    constructor(gpu, host, subject) {
      this.camera = new Camera();
      this.resizeObserver = null;
      this.gpu = gpu;
      this.host = host;
      this.subject = subject;
      this.syncSurface();
      this.observeResize();
    }
    /** Current zoom, where 1 means fitted to the stage. */
    get zoom() {
      return this.camera.zoom;
    }
    /**
     * Re-fits whenever the host element changes size.
     *
     * A ResizeObserver rather than Pixi's own `resizeTo`, which only listens for
     * *window* resizes. Hiding the sidebar changes the stage's width without the
     * window changing at all, so `resizeTo` never fired -- the renderer kept drawing
     * into the old coordinate space while CSS stretched the canvas element to the
     * new width. The picture ended up scaled and offset from its own handles.
     */
    observeResize() {
      if ("undefined" === typeof ResizeObserver) {
        return;
      }
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(this.host);
    }
    /**
     * Matches the drawing surface to the host element.
     *
     * Called from `fit()` so there is exactly one place that can get this wrong, and
     * every path that repositions the image goes through it.
     *
     * @return The host's size in CSS pixels, and whether the surface was replaced.
     */
    syncSurface() {
      const bounds = this.host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      return { width, height, resized: this.gpu.resize(width, height) };
    }
    /** Extra inset when the rulers are showing, so fitting never tucks under them. */
    get gutter() {
      return this.host.classList.contains("has-rulers") ? RULER_GUTTER : 0;
    }
    /**
     * Scales and centres the sprite to fit the host, never magnifying past 1:1.
     *
     * Upscaling a small image to fill the viewport would show interpolation artefacts
     * and mislead the user about the detail they actually have.
     */
    fit() {
      const bounds = this.syncSurface();
      this.place(bounds);
      if (bounds.resized) {
        this.gpu.renderNow();
      }
    }
    /**
     * Scales and centres the sprite for a given surface size.
     *
     * @param bounds Surface size in CSS pixels.
     */
    place(bounds) {
      const sprite = this.subject.sprite();
      const size = this.subject.size();
      if (!sprite || size.width <= 0) {
        return;
      }
      const gutter = this.gutter;
      const effective = this.camera.fitScale(bounds, size, gutter) * this.camera.zoom;
      const centre = this.camera.centre(bounds, gutter);
      sprite.scale.set(effective);
      this.applySampling(effective);
      sprite.position.set(centre.x, centre.y);
      this.camera.emit();
    }
    /**
     * Applies the sampling mode the current zoom calls for.
     *
     * @param scale On-screen scale. Defaults to whatever the sprite currently has, so
     *              a freshly created render texture can be brought into line without
     *              waiting for the next fit.
     */
    applySampling(scale) {
      const sprite = this.subject.sprite();
      const effective = scale ?? (sprite ? Math.abs(sprite.scale.x) : null);
      if (null === effective) {
        return;
      }
      applySampling(effective, this.subject.textures());
    }
    /**
     * Where the image sits inside the stage, in CSS pixels.
     *
     * The crop overlay needs this to draw a rectangle over the image rather than over
     * the letterboxing around it.
     *
     * @return Viewport rectangle, or null when nothing is loaded.
     */
    viewport() {
      const sprite = this.subject.sprite();
      const size = this.subject.size();
      if (!sprite || size.width <= 0) {
        return null;
      }
      return this.camera.viewport(
        this.gpu.screen,
        size,
        Math.abs(sprite.scale.x),
        this.gutter
      );
    }
    /**
     * Subscribes to viewport changes, so overlays can follow a resize.
     *
     * @param listener Called after each re-fit.
     * @return Unsubscribe function.
     */
    onChange(listener) {
      return this.camera.onChange(listener);
    }
    /**
     * Scrolls the pasteboard.
     *
     * @param dx Horizontal movement in CSS pixels.
     * @param dy Vertical movement in CSS pixels.
     */
    pan(dx, dy) {
      this.camera.scrollBy(dx, dy);
      this.fit();
    }
    /**
     * Zooms about a point, keeping whatever is under it in place.
     *
     * @param factor  Multiplier on the current zoom.
     * @param originX Anchor point, in stage CSS pixels.
     * @param originY Anchor point, in stage CSS pixels.
     */
    zoomAt(factor, originX, originY) {
      if (this.camera.zoomAt(factor, originX, originY, this.gpu.screen)) {
        this.fit();
      }
    }
    /** Zooms so one canvas pixel covers one CSS pixel. */
    zoomToActual() {
      const sprite = this.subject.sprite();
      if (!sprite || this.subject.size().width <= 0) {
        return;
      }
      this.camera.zoomToActual(sprite.scale.x);
      this.fit();
    }
    /** Returns the view to a centred, fitted position. */
    reset() {
      this.camera.reset();
      this.fit();
    }
    /** Stops observing and drops every listener. */
    destroy() {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.camera.clear();
    }
  }
  function assemble(gpu, host, schema, reads) {
    const adjust = new AdjustPipeline(gpu, schema);
    const layers = new LayerTextures(gpu);
    const compositor = new DocumentCompositor(gpu, layers);
    const offscreen = { gpu, adjust, texture: reads.display };
    const view = new ViewController(gpu, host, {
      sprite: reads.sprite,
      size: () => sizeOf(reads.display()),
      textures: () => [reads.source(), reads.display(), ...layers.all()]
    });
    const paint = new PaintApi({
      gpu,
      layers,
      canvas: reads.canvas,
      onChange: reads.onPaint
    });
    const histogram = new HistogramProbe(gpu, {
      size: () => reads.source() ? sizeOf(reads.display()) : null,
      sprite: (scale) => makeRenderSprite(offscreen, scale)
    });
    return {
      adjust,
      filters: new ScreenFilters(gpu, adjust),
      layers,
      compositor,
      view,
      paint,
      histogram,
      offscreen
    };
  }
  function sizeOf(texture) {
    return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
  }
  const MODULE_ID = "pixijs";
  let injection = null;
  function shell() {
    const wp = window.wp;
    return wp?.os ?? wp?.desktop;
  }
  async function loadPixi() {
    if (window.PIXI) {
      return window.PIXI;
    }
    const desktop2 = shell();
    if (desktop2?.loadModules) {
      try {
        await desktop2.loadModules([MODULE_ID]);
      } catch {
      }
      if (window.PIXI) {
        return window.PIXI;
      }
    }
    return injectFromShell();
  }
  function injectFromShell() {
    if (injection) {
      return injection;
    }
    const url = window.lienzoConfig?.pixiUrl;
    if (!url) {
      return Promise.reject(
        new Error(
          "AllTerrain Photo Editor needs the desktop shell: PixiJS comes from it, and this page can reach neither its module registry nor its files."
        )
      );
    }
    injection = new Promise((resolve, reject) => {
      const settle = () => {
        if (window.PIXI) {
          resolve(window.PIXI);
        } else {
          reject(
            new Error(
              "PixiJS loaded but did not define window.PIXI. The shell may be mid-upgrade."
            )
          );
        }
      };
      const fail2 = () => {
        injection = null;
        reject(new Error(`Could not load PixiJS from ${url}`));
      };
      const selector = `script[data-lienzo-pixi="${CSS.escape(url)}"]`;
      const existing = document.querySelector(selector);
      if (existing) {
        existing.addEventListener("load", settle, { once: true });
        existing.addEventListener("error", fail2, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.lienzoPixi = url;
      script.addEventListener("load", settle, { once: true });
      script.addEventListener("error", fail2, { once: true });
      document.head.appendChild(script);
    });
    return injection;
  }
  class GpuContext {
    /**
     * @param pixi The Pixi namespace.
     * @param app  An initialised application.
     */
    constructor(pixi, app) {
      this.solid = null;
      this.precision = null;
      this.pixi = pixi;
      this.app = app;
    }
    /**
     * Boots Pixi and attaches a canvas to a host element.
     *
     * The backend used to be pinned to WebGL, for a good reason: the adjustment filter
     * shipped a GLSL program only, and Pixi silently *skips* a filter that has no
     * program for the active backend, which shows the unedited image with no error at
     * all. It now ships a WGSL program too, so the pin is a preference rather than a
     * requirement -- but the default is still WebGL, because that is the path with
     * years of use behind it and `auto` is a choice a site should make deliberately.
     *
     * `auto` asks Pixi for WebGPU and lets it fall back to WebGL by itself on a
     * browser that has none.
     *
     * @param host       Element the canvas fills.
     * @param preference Which backend to ask for.
     */
    static async create(host, preference = "webgl") {
      const pixi = await loadPixi();
      const app = new pixi.Application();
      await app.init({
        preference: "auto" === preference ? "webgpu" : preference,
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1
      });
      app.canvas.classList.add("lz-canvas");
      host.appendChild(app.canvas);
      return new GpuContext(pixi, app);
    }
    /**
     * Which backend Pixi actually chose.
     *
     * Worth asking rather than assuming once `auto` is a supported preference: WebGPU
     * falls back to WebGL by itself, silently and correctly, and the only way to know
     * which one is running is to look.
     */
    get backend() {
      return this.app.renderer.gl ? "webgl" : "webgpu";
    }
    /** Whether intermediate render targets are half-float here. */
    get hasPreciseTargets() {
      return this.halfFloat;
    }
    /** The drawing surface, in CSS pixels. */
    get screen() {
      return this.app.renderer.screen;
    }
    /** The root container everything on screen hangs off. */
    get stage() {
      return this.app.stage;
    }
    /**
     * Matches the drawing surface to a size.
     *
     * @param width  Width in CSS pixels.
     * @param height Height in CSS pixels.
     * @return Whether the surface actually changed, which means it was also cleared.
     */
    resize(width, height) {
      const screen = this.app.renderer.screen;
      if (screen.width === width && screen.height === height) {
        return false;
      }
      this.app.renderer.resize(width, height);
      return true;
    }
    /**
     * Draws the stage now, instead of waiting for the ticker's next frame.
     *
     * Resizing reallocates the drawing buffer, and a reallocated buffer is transparent
     * until something is drawn into it. That is normally invisible -- but a
     * ResizeObserver callback runs *after* the frame's animation callbacks, so the
     * ticker has already drawn this frame by the time the surface is replaced, and the
     * browser paints the empty one. One blank frame per resize step, which during a
     * window drag is every frame: the picture flickers, or seems to vanish and come
     * back.
     *
     * Drawing here closes that gap. The ResizeObserver still runs before paint, so the
     * frame the user sees has the picture in it at the new size.
     */
    renderNow() {
      this.app.render();
    }
    /**
     * Creates a render target.
     *
     * @param width   Width in pixels.
     * @param height  Height in pixels.
     * @param precise Whether to ask for sixteen bits per channel. Only worth it for a
     *                texture that is *sampled again* rather than read back or encoded:
     *                the extra precision is spent on the next pass, and the last pass
     *                is eight bits either way.
     */
    createTarget(width, height, precise = false) {
      return this.pixi.RenderTexture.create({
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
        ...precise && this.halfFloat ? { format: "rgba16float" } : {}
      });
    }
    /**
     * Whether half-float render targets are usable.
     *
     * WebGL2 can *sample* a half-float texture always but can only *render into* one
     * with `EXT_color_buffer_half_float` (or `EXT_color_buffer_float`, which implies
     * it), and without the extension the framebuffer is merely incomplete -- no
     * exception, nothing drawn. Asking the context is the only honest way to know.
     */
    get halfFloat() {
      if (this.precision === null) {
        this.precision = this.detectHalfFloat();
      }
      return this.precision;
    }
    /** Works out whether this renderer can draw into a half-float texture. */
    detectHalfFloat() {
      try {
        const renderer = this.app.renderer;
        if (!renderer.gl) {
          return false;
        }
        return !!renderer.gl.getExtension("EXT_color_buffer_half_float") || !!renderer.gl.getExtension("EXT_color_buffer_float");
      } catch {
        return false;
      }
    }
    /**
     * An eight-bit copy of a target, for anything that reads pixels back.
     *
     * A half-float texture cannot be read with `readPixels` as bytes -- the values come
     * back reinterpreted, which shows up as an eyedropper picking nonsense. One blit
     * resolves it, and only when someone actually asks for pixels rather than on every
     * frame. An eight-bit target is returned as it stands, with `owned` false, so the
     * caller knows not to free something it did not create.
     *
     * @param target Texture to resolve.
     */
    resolve(target) {
      if (!this.isHalfFloat(target)) {
        return { texture: target, owned: false };
      }
      const copy = this.pixi.RenderTexture.create({
        width: target.width,
        height: target.height
      });
      const sprite = this.sprite(target);
      this.draw(sprite, copy, true);
      sprite.destroy();
      return { texture: copy, owned: true };
    }
    /**
     * Whether a texture holds half-float samples.
     *
     * @param texture Texture to test.
     */
    isHalfFloat(texture) {
      return texture.source.format === "rgba16float";
    }
    /**
     * Wraps a source in a texture.
     *
     * @param source Decoded pixels.
     */
    textureFrom(source) {
      return this.pixi.Texture.from(source);
    }
    /** An empty container. */
    container() {
      return new this.pixi.Container();
    }
    /**
     * A sprite over a texture.
     *
     * @param texture What to draw.
     */
    sprite(texture) {
      return new this.pixi.Sprite(texture);
    }
    /**
     * Draws a container into a target.
     *
     * @param container What to draw.
     * @param target    Where to draw it. Omit for the screen.
     * @param clear     Whether to wipe the target first.
     */
    draw(container, target, clear = false) {
      this.app.renderer.render({ container, target, clear });
    }
    /**
     * Draws one sprite into a target, honouring its blend mode.
     *
     * The wrapping container is not ceremony. A sprite passed as the render *root* is
     * its own render group, and the batcher never applies a root's blend mode -- so an
     * `erase` sprite rendered directly paints solid white instead of clearing, with no
     * error.
     *
     * @param sprite What to draw. Destroyed afterwards.
     * @param target Texture to draw into.
     * @param clear  Whether to wipe the target first.
     */
    drawDetached(sprite, target, clear = false) {
      const holder = this.container();
      holder.addChild(sprite);
      this.draw(holder, target, clear);
      holder.destroy({ children: true });
    }
    /**
     * Reads a texture back as a canvas.
     *
     * Any texture, not only a render target: a pasted layer's pixels sit in a plain
     * texture, and saving them beside the recipe has to read those too.
     *
     * @param texture Texture to read.
     */
    extractCanvas(texture) {
      return this.app.renderer.extract.canvas(texture);
    }
    /**
     * Reads a target back as raw bytes.
     *
     * @param target Texture to read.
     */
    extractPixels(target) {
      const { pixels } = this.app.renderer.extract.pixels(target);
      return { pixels, width: target.width, height: target.height };
    }
    /**
     * A one-pixel opaque white texture, used as an eraser stencil.
     *
     * Built here rather than taken from `Texture.WHITE` so the narrow Pixi surface this
     * engine is typed against stays narrow.
     */
    solidTexture() {
      if (!this.solid) {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 1, 1);
        }
        this.solid = this.textureFrom(canvas);
      }
      return this.solid;
    }
    /**
     * Whether a texture can be rendered into.
     *
     * @param texture Texture to test.
     */
    isTarget(texture) {
      return texture instanceof this.pixi.RenderTexture;
    }
    /**
     * Releases the application.
     *
     * `destroy( true )` on the Application is deliberately *not* used: it releases
     * Pixi's global resource registries, which corrupts any other Pixi application
     * alive on the page. OpenStation runs its own -- wallpapers, widgets, games --
     * so taking that shortcut here would break unrelated windows.
     */
    destroy() {
      this.solid = null;
      this.app.destroy({ removeView: true }, { children: true, texture: true });
    }
  }
  function releaseImage(engine, sprite, texture) {
    engine.paint.dispose();
    engine.compositor.release();
    engine.layers.releaseAll();
    engine.filters.release();
    sprite?.destroy({ children: true });
    texture?.destroy(true);
    return null;
  }
  function scaleModeOf(texture) {
    return texture ? texture.source.scaleMode : null;
  }
  function rendererDebugState(subject) {
    const { document: document2 } = subject;
    return {
      canvas: { ...subject.canvas },
      layerCount: subject.stack.length,
      layers: subject.stack.map((layer) => ({
        id: layer.id,
        kind: layer.kind,
        visible: layer.visible,
        hasTexture: subject.layers.has(layer.id),
        isRenderTexture: subject.layers.isTarget(layer.id)
      })),
      zoom: subject.zoom,
      spriteScale: subject.spriteScale,
      viewport: subject.viewport ? { ...subject.viewport } : null,
      backend: subject.backend,
      preciseIntermediates: subject.precise,
      documentScaleMode: scaleModeOf(document2),
      sourceScaleMode: scaleModeOf(subject.source),
      hasDocumentTexture: !!document2,
      documentSize: document2 ? { w: document2.width, h: document2.height } : null
    };
  }
  class EditorRenderer {
    /**
     * @param gpu     Drawing context.
     * @param options Renderer options.
     */
    constructor(gpu, options) {
      this.activeLayerId = "";
      this.texture = null;
      this.sprite = null;
      this.canvas = { width: 0, height: 0 };
      this.stack = [];
      this.hidden = null;
      this.destroyed = false;
      this.gpu = gpu;
      this.maxRenderPixels = options.maxRenderPixels;
      const engine = assemble(gpu, options.host, options.schema, {
        canvas: () => this.canvas,
        source: () => this.texture,
        display: () => this.displayTexture(),
        sprite: () => this.sprite,
        onPaint: () => this.recompose()
      });
      this.engine = engine;
      this.filters = engine.filters;
      this.layers = engine.layers;
      this.histogram = engine.histogram;
      this.view = engine.view;
      this.paint = engine.paint;
      this.pixels = engine.compositor;
    }
    /**
     * Boots Pixi and attaches a canvas to the host element.
     *
     * @param options Renderer options.
     */
    static async create(options) {
      return new EditorRenderer(
        await GpuContext.create(options.host, options.backend ?? "webgl"),
        options
      );
    }
    /** The texture every downstream stage reads. */
    displayTexture() {
      return this.pixels.texture ?? this.texture;
    }
    /** Size of the texture every downstream stage reads. */
    displaySize() {
      return sizeOf(this.displayTexture());
    }
    /**
     * Redraws the document and brings the display back in line with it.
     *
     * A newly created render texture starts on linear sampling, so the mode the
     * current zoom calls for is re-applied rather than waiting for the next fit.
     */
    recompose() {
      this.pixels.compose(this.canvas, this.stack, this.texture, this.hidden);
      if (this.sprite) {
        const texture = this.displayTexture();
        if (texture) {
          this.sprite.texture = texture;
        }
        this.view.applySampling();
      }
      this.histogram.schedule();
    }
    /**
     * Replaces the image being edited.
     *
     * @param image Decoded, untainted image element.
     */
    setImage(image) {
      this.releaseImage();
      this.texture = this.gpu.textureFrom(image);
      this.sprite = this.gpu.sprite(this.texture);
      this.sprite.anchor.set(0.5);
      this.filters.attach(this.sprite);
      this.gpu.stage.addChild(this.sprite);
      this.view.fit();
      this.histogram.schedule();
    }
    /** Tears down the texture, sprite and filter without touching the app. */
    releaseImage() {
      this.sprite = releaseImage(this.engine, this.sprite, this.texture);
      this.texture = null;
    }
    /**
     * Replaces the document and recomposes it.
     *
     * @param canvas        Output surface size.
     * @param layers        Layer stack, back to front.
     * @param activeLayerId Which layer painting acts on.
     */
    setDocument(canvas, layers, activeLayerId) {
      this.canvas = clampCanvas(canvas, this.maxRenderPixels);
      this.stack = layers;
      this.activeLayerId = activeLayerId;
      this.recompose();
      this.view.fit();
    }
    /**
     * Leaves one layer out of the picture, or puts it back.
     *
     * Not a document change: the layer is still there, still visible as far as the
     * recipe is concerned, and comes back the moment this is cleared.
     *
     * @param layerId Layer to hide, or null to hide none.
     */
    hideLayer(layerId) {
      if (this.hidden === layerId) {
        return;
      }
      this.hidden = layerId;
      this.recompose();
    }
    /**
     * Frees textures for layers that can no longer come back.
     *
     * @param reachable Layer ids still referenced anywhere the user can return to.
     */
    retainLayers(reachable) {
      this.layers.retain(new Set(this.stack.map((l) => l.id)), reachable);
    }
    /**
     * Rebuilds the tone table from curves and levels.
     *
     * @param curves Curve set.
     * @param levels Levels.
     */
    setTone(curves, levels) {
      this.filters.setTone(curves, levels);
      this.histogram.schedule();
    }
    /**
     * Sets the adjustments to render.
     *
     * @param ops   Recipe ops.
     * @param space Working space the adjustments are computed in.
     */
    setOps(ops, space = "srgb") {
      this.filters.setOps(ops, space, this.blurTarget());
      this.histogram.schedule();
    }
    /**
     * Temporarily shows the unedited image, for a before/after comparison.
     *
     * The histogram deliberately keeps tracking the bypassed state too, so holding
     * the compare key shows you both the original pixels and the original curve.
     *
     * @param bypass Whether to skip the adjustments.
     */
    setBypass(bypass) {
      if (this.filters.setBypass(bypass)) {
        this.histogram.schedule();
      }
    }
    /** The width a blur radius should be scaled against. */
    blurTarget() {
      return this.view.viewport()?.width ?? this.displaySize().width;
    }
    /**
     * Subscribes to histogram updates.
     *
     * @param listener Called after each recomputation.
     * @return Unsubscribe function.
     */
    onHistogram(listener) {
      return this.histogram.subscribe(listener);
    }
    /** Reads the image alone, with every painted layer left out. */
    readPristinePixels() {
      return this.pixels.readPristine(this.canvas, this.stack, this.texture);
    }
    /** The current output surface size. */
    get canvasSize() {
      return { ...this.canvas };
    }
    /** Native pixel dimensions of the loaded image. */
    get imageSize() {
      return {
        width: this.texture?.width ?? 0,
        height: this.texture?.height ?? 0
      };
    }
    /**
     * Pixel dimensions of what the edit currently produces.
     *
     * The canvas size once a document is composed -- which is what the save path and
     * the info panel both want.
     */
    get sourceSize() {
      return this.displaySize();
    }
    /**
     * Renders the edit at full resolution and encodes it.
     *
     * @param format  Output MIME type.
     * @param quality Encoder quality, 0..1. Ignored for PNG.
     * @return The encoded image.
     * @throws {Error} When the image is too large, or encoding fails.
     */
    renderFull(format, quality) {
      return renderFull(this.engine.offscreen, format, quality, this.maxRenderPixels);
    }
    /**
     * Encodes one layer's pixels as a PNG, for saving beside the recipe.
     *
     * @param layerId Layer to encode.
     * @return The encoded pixels, or null when the layer has none.
     */
    exportLayer(layerId) {
      return this.paint.exportLayer(layerId);
    }
    /** Internal state, for diagnosing render problems from the console. */
    debugState() {
      return rendererDebugState({
        canvas: this.canvas,
        stack: this.stack,
        layers: this.layers,
        source: this.texture,
        document: this.pixels.texture,
        zoom: this.view.zoom,
        spriteScale: this.sprite ? Math.abs(this.sprite.scale.x) : null,
        viewport: this.view.viewport(),
        backend: this.gpu.backend,
        precise: this.gpu.hasPreciseTargets
      });
    }
    /** Releases everything. */
    destroy() {
      if (this.destroyed) {
        return;
      }
      this.destroyed = true;
      this.histogram.stop();
      this.view.destroy();
      this.releaseImage();
      this.engine.adjust.release();
      this.layers.releaseMask();
      this.gpu.destroy();
    }
  }
  function __(text) {
    return window.wp?.i18n?.__?.(text, "allterrain-photo-editor") ?? text;
  }
  function _n(single, plural, count) {
    return window.wp?.i18n?._n?.(single, plural, count, "allterrain-photo-editor") ?? (1 === count ? single : plural);
  }
  function sprintf(text, ...args) {
    const translated = __(text);
    const impl = window.wp?.i18n?.sprintf;
    if (impl) {
      return impl(translated, ...args);
    }
    let index = 0;
    return translated.replace(/%[sd]/g, () => String(args[index++] ?? ""));
  }
  function loadElement(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener(
        "error",
        () => reject(new Error(`Could not load image from ${url}`)),
        { once: true }
      );
      image.src = url;
    });
  }
  async function loadImageUrl(url) {
    const image = await loadElement(url);
    return { image, release: () => {
    }, via: "direct" };
  }
  async function loadImageFile(file) {
    if (!file.type.startsWith("image/")) {
      throw new Error(`${file.name} is not an image.`);
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await loadElement(url);
      return { image, release: () => URL.revokeObjectURL(url), via: "direct" };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(`${file.name} could not be decoded.`);
    }
  }
  async function loadImageBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const image = await loadElement(url);
      return { image, release: () => URL.revokeObjectURL(url), via: "proxy" };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
  async function loadSourceImage(payload, client) {
    try {
      const image = await loadElement(payload.url);
      return { image, release: () => {
      }, via: "direct" };
    } catch {
    }
    const blob = await client.getSourceBlob(payload.sourceUrl);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await loadElement(objectUrl);
      return {
        image,
        release: () => URL.revokeObjectURL(objectUrl),
        via: "proxy"
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
  function buildButton(options) {
    const tag = componentTag("button");
    const useWpd = null !== tag;
    const el = document.createElement(tag ?? "button");
    el.classList.add(options.className);
    el.textContent = options.content;
    if (useWpd) {
      el.setAttribute("variant", options.variant ?? "ghost");
      if (options.iconOnly) {
        el.setAttribute("icon-only", "");
      }
    } else {
      el.type = "button";
      el.classList.add(`lz-button--${options.variant ?? "ghost"}`);
    }
    let disabled = false;
    const onClick = () => {
      if (!disabled) {
        options.onClick();
      }
    };
    el.addEventListener("click", onClick);
    return {
      el,
      setDisabled: (off) => {
        disabled = off;
        el.toggleAttribute("disabled", off);
        el.classList.toggle("is-disabled", off);
        if (useWpd) {
          el.setAttribute("aria-disabled", String(off));
          el.toggleAttribute("inert", off);
        }
      },
      setPressed: (pressed) => {
        el.classList.toggle(options.pressedClass, pressed);
        el.setAttribute("aria-pressed", String(pressed));
      },
      destroy: () => el.removeEventListener("click", onClick)
    };
  }
  function createButton(options) {
    const handle = buildButton({
      content: options.label,
      className: "lz-button",
      variant: options.variant,
      pressedClass: "is-pressed",
      onClick: options.onClick
    });
    if (options.title) {
      handle.el.setAttribute("title", options.title);
      handle.el.setAttribute("aria-label", options.title);
    }
    return handle;
  }
  function createIconButton(options) {
    const handle = buildButton({
      content: options.glyph,
      className: "lz-icon-button",
      variant: options.variant,
      // An icon button reads as a state, not a press -- it is what the tool rail and
      // the options bar use for their toggles.
      pressedClass: "is-active",
      iconOnly: true,
      onClick: options.onClick
    });
    if (options.className) {
      handle.el.classList.add(options.className);
    }
    handle.el.setAttribute("title", options.label);
    handle.el.setAttribute("aria-label", options.label);
    return {
      ...handle,
      setGlyph: (glyph) => {
        handle.el.textContent = glyph;
      }
    };
  }
  let idCounter = 1;
  function fieldId(kind) {
    return `lz-${kind}-${(idCounter++).toString(36)}`;
  }
  function nameControl(input, label, kind) {
    const id = fieldId(kind);
    input.id = id;
    input.name = id;
    if (label) {
      label.htmlFor = id;
    }
  }
  function siblingTag(resolved, name) {
    return `${resolved.split("-")[0]}-${name}`;
  }
  function eventDetail(event) {
    const detail = event.detail;
    return detail && "object" === typeof detail ? detail : null;
  }
  function labelledRow(tag, label, className) {
    const wrap = document.createElement(tag);
    const text = document.createElement("span");
    wrap.className = className;
    text.className = "lz-field__label";
    text.textContent = label;
    return { wrap, text };
  }
  function createCheckbox(options) {
    const tag = componentTag("checkbox-label");
    if (tag) {
      const field = document.createElement(tag);
      field.setAttribute("label", options.label);
      field.toggleAttribute("checked", options.checked);
      if (options.title) {
        field.setAttribute("title", options.title);
      }
      const onChange2 = (event) => {
        const detail = eventDetail(event);
        options.onChange(true === detail?.checked);
      };
      const off = onShellEvent(field, "checkbox-change", onChange2);
      return {
        el: field,
        setChecked: (checked) => field.toggleAttribute("checked", checked),
        destroy: off
      };
    }
    const wrap = document.createElement("label");
    wrap.className = "lz-check";
    if (options.title) {
      wrap.title = options.title;
    }
    const box = document.createElement("input");
    box.type = "checkbox";
    nameControl(box, null, "check");
    box.checked = options.checked;
    const onChange = () => options.onChange(box.checked);
    box.addEventListener("change", onChange);
    wrap.append(box, document.createTextNode(options.label));
    return {
      el: wrap,
      setChecked: (checked) => {
        box.checked = checked;
      },
      destroy: () => box.removeEventListener("change", onChange)
    };
  }
  function createColourField(options) {
    const tag = options.compact ? null : componentTag("color-field");
    if (tag) {
      const field = document.createElement(tag);
      field.setAttribute("label", options.label);
      field.setAttribute("value", options.value);
      const onChange = (event) => {
        const detail = eventDetail(event);
        if (detail?.value) {
          options.onChange(detail.value);
        }
      };
      const off = onShellEvent(field, "color-change", onChange);
      return {
        el: field,
        setValue: (value) => field.setAttribute("value", String(value)),
        destroy: off
      };
    }
    const { wrap, text } = labelledRow(
      "label",
      options.label,
      "lz-field lz-field--compact"
    );
    const input = document.createElement("input");
    input.type = "color";
    input.className = "lz-field__control lz-colour";
    nameControl(input, null, "colour");
    input.value = options.value;
    const onInput = () => options.onChange(input.value);
    input.addEventListener("input", onInput);
    wrap.append(text, input);
    return {
      el: wrap,
      setValue: (value) => {
        input.value = String(value);
      },
      destroy: () => input.removeEventListener("input", onInput)
    };
  }
  function floatingHost(anchor) {
    return anchor.closest(".lz-editor") ?? document.body;
  }
  function positionFloating(el, anchor, placement = "inline-end") {
    const from = anchor.getBoundingClientRect();
    el.style.position = "fixed";
    el.style.insetInlineStart = "auto";
    el.style.insetBlockStart = "auto";
    const box = el.getBoundingClientRect();
    const gap = 6;
    let left = "inline-end" === placement ? from.right + gap : from.left;
    let top = "inline-end" === placement ? from.top : from.bottom + gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - box.width - gap));
    top = Math.max(gap, Math.min(top, window.innerHeight - box.height - gap));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }
  function createMenuButton(options) {
    let el = null;
    let detachAway = null;
    const close = () => {
      detachAway?.();
      detachAway = null;
      el?.remove();
      el = null;
      button.setPressed(false);
    };
    const open2 = () => {
      const menu = document.createElement("div");
      menu.className = "lz-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", options.label);
      for (const entry of options.getItems()) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "lz-menu__item";
        item.setAttribute("role", "menuitem");
        item.textContent = entry.label;
        if (entry.title) {
          item.setAttribute("title", entry.title);
        }
        item.addEventListener("click", () => {
          close();
          entry.onSelect();
        });
        menu.appendChild(item);
      }
      floatingHost(button.el).appendChild(menu);
      positionFloating(menu, button.el, "block-end");
      el = menu;
      button.setPressed(true);
      const onAway = (event) => {
        if (event.target instanceof Node && !menu.contains(event.target) && !button.el.contains(event.target)) {
          close();
        }
      };
      const onEscape = (event) => {
        if ("Escape" === event.key) {
          close();
        }
      };
      window.setTimeout(() => document.addEventListener("click", onAway), 0);
      document.addEventListener("keydown", onEscape);
      detachAway = () => {
        document.removeEventListener("click", onAway);
        document.removeEventListener("keydown", onEscape);
      };
    };
    const button = createIconButton({
      glyph: options.glyph ?? "⋯",
      label: __(options.label),
      ...options.className ? { className: options.className } : {},
      onClick: () => el ? close() : open2()
    });
    button.el.setAttribute("aria-haspopup", "menu");
    return {
      el: button.el,
      close,
      destroy: () => {
        close();
        button.destroy();
      }
    };
  }
  function createNumberField(options) {
    const tag = options.compact ? null : pickComponent(["number-field", "text-field"]);
    return tag ? componentField(tag, options) : nativeField(options);
  }
  function componentField(tag, options) {
    const numeric = tag.endsWith("-number-field");
    const field = document.createElement(tag);
    if (options.compact) {
      field.setAttribute("aria-label", options.label);
    } else {
      field.setAttribute("label", options.label);
    }
    field.setAttribute("value", String(Math.round(options.value)));
    field.classList.add("lz-field--compact");
    if (numeric) {
      field.setAttribute("min", String(options.min));
      field.setAttribute("max", String(options.max));
      field.setAttribute("step", String(options.step ?? 1));
    } else {
      field.setAttribute("type", "number");
    }
    if (options.suffix) {
      field.setAttribute("suffix", options.suffix);
    }
    const onChange = (event) => {
      const detail = eventDetail(event);
      if (!detail) {
        return;
      }
      const next = Number(detail.value);
      if (!Number.isFinite(next)) {
        return;
      }
      options.onChange(numeric ? next : clamp$2(next, options));
    };
    const offs = [
      onShellEvent(field, "input-change", onChange),
      onShellEvent(field, "input-commit", onChange)
    ];
    const handle = {
      el: field,
      setValue: (value) => field.setAttribute("value", String(value)),
      destroy: () => {
        for (const off of offs) {
          off();
        }
      }
    };
    if (!options.compact) {
      return handle;
    }
    const { wrap, text } = labelledRow(
      "div",
      options.label,
      "lz-field lz-field--compact lz-field--narrow"
    );
    wrap.append(text, field);
    return { ...handle, el: wrap };
  }
  function nativeField(options) {
    const { wrap, text } = labelledRow(
      "label",
      options.label,
      options.compact ? "lz-field lz-field--compact lz-field--narrow" : "lz-field lz-field--compact"
    );
    const input = document.createElement("input");
    input.type = "number";
    input.className = "lz-field__control";
    nameControl(input, null, "number");
    input.value = String(Math.round(options.value));
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step ?? 1);
    const onInput = () => {
      const next = Number(input.value);
      if (Number.isFinite(next)) {
        options.onChange(clamp$2(next, options));
      }
    };
    input.addEventListener("input", onInput);
    wrap.append(text, input);
    if (options.suffix) {
      const suffix = document.createElement("span");
      suffix.className = "lz-field__suffix";
      suffix.textContent = options.suffix;
      suffix.setAttribute("aria-hidden", "true");
      wrap.append(suffix);
    }
    return {
      el: wrap,
      setValue: (value) => {
        input.value = String(value);
      },
      destroy: () => input.removeEventListener("input", onInput)
    };
  }
  function clamp$2(value, bounds) {
    return Math.min(bounds.max, Math.max(bounds.min, value));
  }
  function createSection(heading, options = {}) {
    const tag = options.compact ? null : componentTag("section");
    if (tag) {
      const section2 = document.createElement(tag);
      section2.setAttribute("heading", heading);
      section2.setAttribute("stack", "");
      section2.classList.add("lz-section");
      section2.append(...options.children ?? []);
      return section2;
    }
    const section = document.createElement("section");
    section.className = options.compact ? "lz-section lz-section--compact" : "lz-section";
    const title = document.createElement("h3");
    title.className = "lz-section__heading";
    title.textContent = heading;
    section.append(title, ...options.children ?? []);
    return section;
  }
  function createSegmented(options) {
    const clipped = options.icons || options.hideLabel;
    const { wrap, text } = labelledRow(
      "div",
      options.label,
      clipped ? "lz-field lz-field--compact lz-field--unlabelled" : "lz-field lz-field--compact"
    );
    const tag = componentTag("segmented");
    if (tag) {
      const group2 = document.createElement(tag);
      group2.setAttribute("value", options.value);
      group2.setAttribute("label", options.label);
      for (const option of options.options) {
        const segment = document.createElement(siblingTag(tag, "segment"));
        segment.setAttribute("value", option.value);
        segment.textContent = option.label;
        if (option.title) {
          segment.setAttribute("title", option.title);
          segment.setAttribute("aria-label", option.title);
        }
        group2.appendChild(segment);
      }
      const onPick = (event) => {
        const detail = eventDetail(event);
        if (detail?.value) {
          options.onChange(detail.value);
        }
      };
      const off = onShellEvent(group2, "pick", onPick);
      wrap.append(text, group2);
      return {
        el: wrap,
        setValue: (value) => group2.setAttribute("value", String(value)),
        destroy: off
      };
    }
    const group = document.createElement("div");
    group.className = options.icons ? "lz-segmented lz-segmented--icons" : "lz-segmented";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", options.label);
    const buttons = [];
    let current = options.value;
    const paint = () => {
      for (const button of buttons) {
        const on = button.dataset.value === current;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-checked", String(on));
      }
    };
    for (const option of options.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lz-segmented__item";
      button.dataset.value = option.value;
      button.textContent = option.label;
      button.setAttribute("role", "radio");
      if (option.title) {
        button.setAttribute("title", option.title);
        button.setAttribute("aria-label", option.title);
      }
      button.addEventListener("click", () => {
        current = option.value;
        paint();
        options.onChange(option.value);
      });
      buttons.push(button);
      group.appendChild(button);
    }
    paint();
    wrap.append(text, group);
    return {
      el: wrap,
      setValue: (value) => {
        current = String(value);
        paint();
      },
      destroy: () => {
      }
    };
  }
  function createSelect(options) {
    const tag = options.compact ? null : componentTag("select");
    const useWpd = null !== tag;
    const wrap = document.createElement("div");
    wrap.className = options.compact ? "lz-field lz-field--compact" : "lz-field";
    const label = document.createElement("label");
    label.className = "lz-field__label";
    label.textContent = options.label;
    const select = document.createElement(tag ?? "select");
    select.className = "lz-field__control";
    if (useWpd) {
      const id = fieldId("select-label");
      label.id = id;
      select.setAttribute("aria-labelledby", id);
    } else {
      nameControl(select, label, "select");
    }
    for (const option of options.options) {
      const node = document.createElement(
        tag ? siblingTag(tag, "option") : "option"
      );
      node.setAttribute("value", option.value);
      node.textContent = option.label;
      select.appendChild(node);
    }
    if (useWpd) {
      select.setAttribute("value", options.value);
    } else {
      select.value = options.value;
    }
    const read = () => useWpd ? select.getAttribute("value") ?? options.value : select.value;
    const onChange = () => options.onChange(read());
    select.addEventListener("change", onChange);
    const off = onShellEvent(select, "change", onChange);
    wrap.append(label, select);
    return {
      el: wrap,
      getValue: read,
      destroy: () => {
        select.removeEventListener("change", onChange);
        off();
      }
    };
  }
  function createSlider(options) {
    const row = document.createElement("div");
    row.className = "lz-adjust";
    const tag = componentTag("range-field");
    const handle = tag ? createShellSlider(tag, options) : createNativeSlider(options);
    row.appendChild(handle.el);
    const reset = createButton({
      label: "↺",
      title: `Reset ${options.label}`,
      variant: "ghost",
      onClick: () => {
        handle.setValue(options.resetTo);
        options.onInput(options.resetTo);
        options.onCommit?.();
      }
    });
    reset.el.classList.add("lz-adjust__reset");
    row.appendChild(reset.el);
    return {
      el: row,
      setValue: handle.setValue,
      destroy: () => {
        handle.destroy();
        reset.destroy();
      }
    };
  }
  function createShellSlider(tag, options) {
    const field = document.createElement(tag);
    field.setAttribute("label", options.label);
    field.setAttribute("min", String(options.min));
    field.setAttribute("max", String(options.max));
    field.setAttribute("step", String(options.step));
    field.setAttribute("value", String(options.value));
    if (options.suffix) {
      field.setAttribute("suffix", options.suffix);
    }
    const onChange = (event) => {
      const detail = eventDetail(event);
      if (detail && "number" === typeof detail.value) {
        options.onInput(detail.value);
      }
    };
    const offChange = onShellEvent(field, "range-change", onChange);
    const onRelease = () => options.onCommit?.();
    field.addEventListener("pointerup", onRelease);
    field.addEventListener("keyup", onRelease);
    return {
      el: field,
      setValue: (value) => field.setAttribute("value", String(value)),
      destroy: () => {
        offChange();
        field.removeEventListener("pointerup", onRelease);
        field.removeEventListener("keyup", onRelease);
      }
    };
  }
  function createNativeSlider(options) {
    const wrap = document.createElement("div");
    wrap.className = "lz-slider";
    const id = fieldId("slider");
    const label = document.createElement("label");
    label.className = "lz-slider__label";
    label.htmlFor = id;
    label.textContent = options.label;
    const readout = document.createElement("output");
    readout.className = "lz-slider__value";
    readout.htmlFor = id;
    const input = document.createElement("input");
    input.type = "range";
    input.id = id;
    input.name = id;
    input.className = "lz-slider__input";
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.value = String(options.value);
    const paint = (value) => {
      readout.textContent = `${value}${options.suffix ?? ""}`;
      const ratio = (value - options.min) / (options.max - options.min || 1);
      wrap.style.setProperty("--lz-slider-fill", String(ratio));
      wrap.classList.toggle("is-modified", value !== options.resetTo);
    };
    paint(options.value);
    const onInput = () => {
      const value = Number(input.value);
      paint(value);
      options.onInput(value);
    };
    const onChange = () => options.onCommit?.();
    input.addEventListener("input", onInput);
    input.addEventListener("change", onChange);
    const head = document.createElement("div");
    head.className = "lz-slider__head";
    head.append(label, readout);
    wrap.append(head, input);
    return {
      el: wrap,
      setValue: (value) => {
        input.value = String(value);
        paint(value);
      },
      destroy: () => {
        input.removeEventListener("input", onInput);
        input.removeEventListener("change", onChange);
      }
    };
  }
  function createSwatchGrid(options) {
    const gridTag = componentTag("swatch-grid");
    const swatchTag = componentTag("swatch");
    const useWpd = null !== gridTag && null !== swatchTag;
    const el = document.createElement(gridTag && useWpd ? gridTag : "div");
    const listeners2 = [];
    el.classList.add("lz-palette");
    el.setAttribute("aria-label", options.label);
    if (useWpd) {
      el.setAttribute("mode", "row");
    } else {
      el.setAttribute("role", "group");
    }
    const chips = /* @__PURE__ */ new Map();
    for (const colour of options.colours) {
      const chip = document.createElement(
        useWpd && swatchTag ? swatchTag : "button"
      );
      chip.classList.add("lz-palette__chip");
      chip.setAttribute("title", colour);
      chip.setAttribute("aria-label", colour);
      if (useWpd) {
        chip.setAttribute("value", colour);
        chip.setAttribute("preview", colour);
        chip.setAttribute("size", "small");
      } else {
        chip.type = "button";
        chip.style.background = colour;
      }
      const onPick = () => options.onChange(colour);
      const events = useWpd ? shellEvents("pick") : ["click"];
      for (const event of events) {
        chip.addEventListener(event, onPick);
      }
      listeners2.push(() => {
        for (const event of events) {
          chip.removeEventListener(event, onPick);
        }
      });
      chips.set(colour, chip);
      el.appendChild(chip);
    }
    const setValue = (value) => {
      for (const [colour, chip] of chips) {
        const on = colour.toLowerCase() === value.toLowerCase();
        chip.toggleAttribute("selected", on);
        chip.classList.toggle("is-selected", on);
      }
    };
    if (options.value) {
      setValue(options.value);
    }
    return {
      el,
      setValue,
      destroy: () => {
        for (const off of listeners2) {
          off();
        }
      }
    };
  }
  function createTextField(options) {
    const tag = componentTag("text-field");
    if (tag) {
      const field = document.createElement(tag);
      field.setAttribute("label", options.label);
      field.setAttribute("value", options.value);
      if (options.placeholder) {
        field.setAttribute("placeholder", options.placeholder);
      }
      const read = (event) => eventDetail(event)?.value ?? "";
      const onChange = (event) => options.onChange(read(event));
      const onCommit2 = (event) => options.onCommit?.(read(event));
      const offs = [
        onShellEvent(field, "input-change", onChange),
        onShellEvent(field, "input-commit", onCommit2),
        onShellEvent(field, "submit", onCommit2)
      ];
      return {
        el: field,
        setValue: (value) => field.setAttribute("value", String(value)),
        destroy: () => {
          for (const off of offs) {
            off();
          }
        }
      };
    }
    const { wrap, text } = labelledRow("label", options.label, "lz-field");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "lz-field__control";
    nameControl(input, null, "text");
    input.value = options.value;
    if (options.placeholder) {
      input.placeholder = options.placeholder;
    }
    const onInput = () => options.onChange(input.value);
    const onCommit = () => options.onCommit?.(input.value);
    input.addEventListener("input", onInput);
    input.addEventListener("change", onCommit);
    input.addEventListener("keydown", (event) => {
      if ("Enter" === event.key) {
        onCommit();
      }
    });
    wrap.append(text, input);
    return {
      el: wrap,
      setValue: (value) => {
        input.value = String(value);
      },
      destroy: () => {
        input.removeEventListener("input", onInput);
        input.removeEventListener("change", onCommit);
      }
    };
  }
  const registry = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  function announce() {
    for (const listener of listeners) {
      listener();
    }
  }
  function registerPanel(def) {
    registry.set(def.id, def);
    announce();
  }
  function unregisterPanel(id) {
    if (registry.delete(id)) {
      announce();
    }
  }
  function listPanels() {
    return [...registry.values()].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100)
    );
  }
  function onPanelsChanged(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  const OP_DISPLAY = {
    exposure: { scale: 100, suffix: "", step: 1 },
    contrast: { scale: 100, suffix: "", step: 1 },
    temperature: { scale: 100, suffix: "", step: 1 },
    tint: { scale: 100, suffix: "", step: 1 },
    saturation: { scale: 100, suffix: "", step: 1 },
    vibrance: { scale: 100, suffix: "", step: 1 },
    hue: { scale: 1, suffix: "°", step: 1 },
    sharpen: { scale: 100, suffix: "", step: 1 },
    blur: { scale: 100, suffix: "", step: 1 },
    vignette: { scale: 100, suffix: "", step: 1 },
    grain: { scale: 100, suffix: "", step: 1 }
  };
  function adjustmentSlider(type, ctx) {
    const spec = ctx.payload.schema[type];
    if (!spec) {
      return null;
    }
    const display = OP_DISPLAY[type];
    return createSlider({
      label: __(OP_LABELS[type]),
      min: Math.round(spec.min * display.scale),
      max: Math.round(spec.max * display.scale),
      step: display.step,
      suffix: display.suffix,
      value: getOp(ctx.getRecipe(), type, ctx.payload.schema) * display.scale,
      resetTo: Math.round(spec.default * display.scale),
      onInput: (value) => ctx.setOp(type, value / display.scale)
    });
  }
  function renderAdjustments(host, ctx, order) {
    const sliders = /* @__PURE__ */ new Map();
    for (const type of order) {
      const slider = adjustmentSlider(type, ctx);
      if (!slider) {
        continue;
      }
      sliders.set(type, slider);
      host.appendChild(slider.el);
    }
    const off = ctx.onRecipeChange((recipe) => {
      for (const [type, slider] of sliders) {
        const display = OP_DISPLAY[type];
        slider.setValue(
          Math.round(getOp(recipe, type, ctx.payload.schema) * display.scale)
        );
      }
    });
    return () => {
      off();
      for (const slider of sliders.values()) {
        slider.destroy();
      }
    };
  }
  function workingSpaceField(ctx) {
    const field = createSegmented({
      label: __("Light"),
      value: ctx.getRecipe().space,
      options: [
        { value: "srgb", label: __("sRGB") },
        { value: "linear", label: __("Linear") }
      ],
      onChange: (value) => ctx.setSpace("linear" === value ? "linear" : "srgb")
    });
    return {
      el: field.el,
      destroy: field.destroy,
      sync: (recipe) => field.setValue(recipe.space)
    };
  }
  function registerAdjustmentPanels() {
    registerPanel({
      id: "adjustments",
      title: __("Adjustments"),
      order: 20,
      render: (host, ctx) => {
        const space = workingSpaceField(ctx);
        host.appendChild(space.el);
        const off = ctx.onRecipeChange(space.sync);
        const teardown = renderAdjustments(host, ctx, PANEL_OP_ORDER);
        return () => {
          off();
          space.destroy();
          teardown();
        };
      }
    });
    registerPanel({
      id: "effects",
      title: __("Detail & effects"),
      order: 60,
      defaultCollapsed: true,
      render: (host, ctx) => renderAdjustments(host, ctx, EFFECT_OP_ORDER)
    });
  }
  const BRUSH_SHAPES = [
    { value: "hard", label: "Hard round" },
    { value: "soft", label: "Soft round" },
    { value: "hairy", label: "Bristle" },
    { value: "square", label: "Square" }
  ];
  const cache = /* @__PURE__ */ new Map();
  const MAX_CACHED = 24;
  function brushStamp(shape, size, hardness) {
    const diameter = Math.max(1, Math.round(size));
    const key = `${shape}:${diameter}:${Math.round(hardness * 20)}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const canvas = document.createElement("canvas");
    canvas.width = diameter;
    canvas.height = diameter;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      paintStamp(ctx, shape, diameter, hardness);
    }
    if (cache.size >= MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest !== void 0) {
        cache.delete(oldest);
      }
    }
    cache.set(key, canvas);
    return canvas;
  }
  function paintStamp(ctx, shape, diameter, hardness) {
    const r = diameter / 2;
    if (shape === "square") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, diameter, diameter);
      return;
    }
    if (shape === "hairy") {
      const bristles = Math.max(24, Math.round(diameter * 3));
      let seed = diameter * 9301;
      const random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      for (let i = 0; i < bristles; i++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * r;
        const x = r + Math.cos(angle) * distance;
        const y = r + Math.sin(angle) * distance;
        const dot = Math.max(0.5, diameter / 40 * (0.4 + random()));
        ctx.globalAlpha = 0.12 + random() * 0.35;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, dot, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    const core = shape === "hard" ? Math.max(0.75, hardness) : hardness * 0.85;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(Math.min(0.99, core), "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const STAMP_SPACING = 0.18;
  function interpolateStroke(from, to, spacing) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.max(0.5, spacing);
    if (distance < step) {
      return [to];
    }
    const count = Math.floor(distance / step);
    const points = [];
    for (let i = 1; i <= count; i++) {
      const t = i * step / distance;
      points.push({ x: from.x + dx * t, y: from.y + dy * t });
    }
    points.push(to);
    return points;
  }
  const MATCH = 1;
  const MISS = 2;
  const INSIDE = 255;
  function floodFillRegion(pixels, width, height, startX, startY, tolerance) {
    const x0 = Math.round(startX);
    const y0 = Math.round(startY);
    if (width < 1 || height < 1 || x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
      return null;
    }
    const state2 = new Uint8Array(width * height);
    const seed = (y0 * width + x0) * 4;
    const target0 = pixels[seed];
    const target1 = pixels[seed + 1];
    const target2 = pixels[seed + 2];
    const target3 = pixels[seed + 3];
    const tol = Math.max(0, Math.min(255, Math.round(tolerance)));
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const open2 = (index) => {
      const known = state2[index];
      if (known !== 0) {
        return known === MATCH;
      }
      const p = index * 4;
      const matches = pixels[p] - target0 <= tol && target0 - pixels[p] <= tol && (pixels[p + 1] - target1 <= tol && target1 - pixels[p + 1] <= tol) && (pixels[p + 2] - target2 <= tol && target2 - pixels[p + 2] <= tol) && (pixels[p + 3] - target3 <= tol && target3 - pixels[p + 3] <= tol);
      state2[index] = matches ? MATCH : MISS;
      return matches;
    };
    const claim = (index, x, y) => {
      state2[index] = INSIDE;
      count++;
      if (x < minX) {
        minX = x;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (y > maxY) {
        maxY = y;
      }
    };
    const stack = [x0, x0, y0, 1, x0, x0, y0 - 1, -1];
    while (stack.length > 0) {
      const dy = stack.pop();
      const y = stack.pop();
      let x2 = stack.pop();
      let x1 = stack.pop();
      if (y < 0 || y >= height) {
        continue;
      }
      const row = y * width;
      let x = x1;
      if (open2(row + x)) {
        while (x > 0 && open2(row + x - 1)) {
          claim(row + x - 1, x - 1, y);
          x--;
        }
        if (x < x1) {
          stack.push(x, x1 - 1, y - dy, -dy);
        }
      }
      while (x1 <= x2) {
        while (x1 < width && open2(row + x1)) {
          claim(row + x1, x1, y);
          x1++;
        }
        if (x1 > x) {
          stack.push(x, x1 - 1, y + dy, dy);
        }
        if (x1 - 1 > x2) {
          stack.push(x2 + 1, x1 - 1, y - dy, -dy);
        }
        x1++;
        while (x1 <= x2 && !open2(row + x1)) {
          x1++;
        }
        x = x1;
      }
    }
    if (count === 0) {
      return null;
    }
    return {
      state: state2,
      width,
      height,
      bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      count
    };
  }
  function regionToCanvas(region) {
    const { bounds, state: state2, width } = region;
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    const image = ctx.createImageData(bounds.width, bounds.height);
    const words = new Uint32Array(image.data.buffer);
    for (let y = 0; y < bounds.height; y++) {
      const from = (bounds.y + y) * width + bounds.x;
      const to = y * bounds.width;
      for (let x = 0; x < bounds.width; x++) {
        if (state2[from + x] === INSIDE) {
          words[to + x] = 4294967295;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }
  function floodFillMask(pixels, width, height, startX, startY, tolerance) {
    const region = floodFillRegion(pixels, width, height, startX, startY, tolerance);
    if (!region) {
      return null;
    }
    const mask = regionToCanvas(region);
    return mask ? { region, mask } : null;
  }
  const RETOUCH_MODES = [
    { value: "blur", label: "Blur" },
    { value: "sharpen", label: "Sharpen" },
    { value: "smudge", label: "Smudge" },
    { value: "heal", label: "Heal" }
  ];
  const TONE_MODES = [
    { value: "dodge", label: "Dodge" },
    { value: "burn", label: "Burn" },
    { value: "sponge", label: "Desaturate" },
    { value: "saturate", label: "Saturate" }
  ];
  function sampleAt(buffer, x, y) {
    const index = (clampInt(Math.round(y), 0, buffer.height - 1) * buffer.width + clampInt(Math.round(x), 0, buffer.width - 1)) * 4;
    return sampleIndex(buffer, index);
  }
  function sampleIndex(buffer, index) {
    return [
      buffer.data[index],
      buffer.data[index + 1],
      buffer.data[index + 2],
      buffer.data[index + 3]
    ];
  }
  function blend(buffer, index, colour, weight) {
    const w = clamp01$1(weight);
    for (let c = 0; c < 3; c++) {
      buffer.data[index + c] += (colour[c] - buffer.data[index + c]) * w;
    }
  }
  function clamp01$1(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }
  function clampInt(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function grow(buffer, rect, margin) {
    const x0 = Math.max(0, rect.x - margin);
    const y0 = Math.max(0, rect.y - margin);
    const x1 = Math.min(buffer.width, rect.x + rect.width + margin);
    const y1 = Math.min(buffer.height, rect.y + rect.height + margin);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  function subBuffer(buffer, rect) {
    const data = new Uint8ClampedArray(rect.width * rect.height * 4);
    for (let row = 0; row < rect.height; row++) {
      const from = ((rect.y + row) * buffer.width + rect.x) * 4;
      data.set(
        buffer.data.subarray(from, from + rect.width * 4),
        row * rect.width * 4
      );
    }
    return { data, width: rect.width, height: rect.height };
  }
  function boxBlur(buffer, radius) {
    const { width, height } = buffer;
    const span = Math.max(1, Math.round(radius));
    const window2 = span * 2 + 1;
    const horizontal = new Uint8ClampedArray(buffer.data.length);
    const out = new Uint8ClampedArray(buffer.data.length);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const sums = [0, 0, 0, 0];
      for (let i = -span; i <= span; i++) {
        const index = (row + clampInt(i, 0, width - 1)) * 4;
        for (let c = 0; c < 4; c++) {
          sums[c] += buffer.data[index + c];
        }
      }
      for (let x = 0; x < width; x++) {
        const index = (row + x) * 4;
        for (let c = 0; c < 4; c++) {
          horizontal[index + c] = sums[c] / window2;
        }
        const leaving = (row + clampInt(x - span, 0, width - 1)) * 4;
        const entering = (row + clampInt(x + span + 1, 0, width - 1)) * 4;
        for (let c = 0; c < 4; c++) {
          sums[c] += buffer.data[entering + c] - buffer.data[leaving + c];
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const sums = [0, 0, 0, 0];
      for (let i = -span; i <= span; i++) {
        const index = (clampInt(i, 0, height - 1) * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          sums[c] += horizontal[index + c];
        }
      }
      for (let y = 0; y < height; y++) {
        const index = (y * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          out[index + c] = sums[c] / window2;
        }
        const leaving = (clampInt(y - span, 0, height - 1) * width + x) * 4;
        const entering = (clampInt(y + span + 1, 0, height - 1) * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          sums[c] += horizontal[entering + c] - horizontal[leaving + c];
        }
      }
    }
    return { data: out, width, height };
  }
  function dabRect(buffer, cx, cy, radius) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(buffer.width, Math.ceil(cx + radius) + 1);
    const y1 = Math.min(buffer.height, Math.ceil(cy + radius) + 1);
    if (x1 <= x0 || y1 <= y0) {
      return null;
    }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  function dabFalloff(x, y, cx, cy, radius, hardness) {
    const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (distance >= radius) {
      return 0;
    }
    const inner = radius * clamp01$1(hardness);
    if (distance <= inner) {
      return 1;
    }
    const t = 1 - (distance - inner) / Math.max(radius - inner, 1e-6);
    return t * t * (3 - 2 * t);
  }
  function ringAverage(buffer, cx, cy, radius) {
    const total = [0, 0, 0, 0];
    let count = 0;
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * radius * 1.35);
      const y = Math.round(cy + Math.sin(angle) * radius * 1.35);
      if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) {
        continue;
      }
      const sample = sampleAt(buffer, x, y);
      for (let c = 0; c < 4; c++) {
        total[c] += sample[c];
      }
      count++;
    }
    if (count === 0) {
      return null;
    }
    return [
      total[0] / count,
      total[1] / count,
      total[2] / count,
      total[3] / count
    ];
  }
  const MAX_KERNEL = 64;
  function applyPixelDab(request2) {
    const { target, op } = request2;
    const source = request2.source ?? target;
    const radius = Math.max(0.5, request2.radius / 2);
    const strength = clamp01$1(request2.strength);
    const rect = dabRect(target, request2.x, request2.y, radius);
    if (!rect) {
      return null;
    }
    const kernel = Math.max(
      1,
      Math.min(MAX_KERNEL, Math.round(radius * 0.35))
    );
    const hardness = clamp01$1(request2.hardness ?? 0.5);
    const offsetX = Math.round(request2.offsetX ?? 0);
    const offsetY = Math.round(request2.offsetY ?? 0);
    const needsSnapshot = op === "blur" || op === "sharpen" || op === "smudge" || op === "heal";
    const margin = op === "heal" ? Math.ceil(radius * 0.4) + 2 : kernel;
    const read = needsSnapshot ? grow(source, rect, margin) : rect;
    const snapshot = needsSnapshot ? subBuffer(source, read) : source;
    const readAt = (x, y) => needsSnapshot ? sampleAt(snapshot, x - read.x, y - read.y) : sampleAt(snapshot, x, y);
    const blurred = op === "blur" || op === "sharpen" ? boxBlur(snapshot, kernel) : null;
    const patch = op === "heal" ? ringAverage(
      snapshot,
      request2.x - read.x,
      request2.y - read.y,
      radius
    ) : null;
    let carry;
    if (op === "smudge") {
      carry = request2.carry ? [...request2.carry] : readAt(request2.x, request2.y);
    }
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const falloff = dabFalloff(x, y, request2.x, request2.y, radius, hardness);
        if (falloff <= 0) {
          continue;
        }
        const weight = falloff * strength;
        const index = (y * target.width + x) * 4;
        switch (op) {
          case "blur":
            blend(
              target,
              index,
              sampleAt(blurred, x - read.x, y - read.y),
              weight
            );
            break;
          case "sharpen": {
            const soft = sampleAt(
              blurred,
              x - read.x,
              y - read.y
            );
            const here = readAt(x, y);
            blend(
              target,
              index,
              [
                here[0] + (here[0] - soft[0]) * 1.5,
                here[1] + (here[1] - soft[1]) * 1.5,
                here[2] + (here[2] - soft[2]) * 1.5,
                here[3]
              ],
              weight
            );
            break;
          }
          case "smudge": {
            const here = readAt(x, y);
            blend(target, index, carry, weight);
            for (let c = 0; c < 4; c++) {
              carry[c] += (here[c] - carry[c]) * (1 - strength) * 0.5;
            }
            break;
          }
          case "heal":
            if (patch) {
              blend(target, index, patch, weight);
            }
            break;
          case "dodge": {
            const here = sampleIndex(target, index);
            blend(
              target,
              index,
              [
                here[0] + (255 - here[0]) * weight,
                here[1] + (255 - here[1]) * weight,
                here[2] + (255 - here[2]) * weight,
                here[3]
              ],
              1
            );
            break;
          }
          case "burn": {
            const here = sampleIndex(target, index);
            blend(
              target,
              index,
              [
                here[0] * (1 - weight),
                here[1] * (1 - weight),
                here[2] * (1 - weight),
                here[3]
              ],
              1
            );
            break;
          }
          case "sponge":
          case "saturate": {
            const here = sampleIndex(target, index);
            const luma = 0.2126 * here[0] + 0.7152 * here[1] + 0.0722 * here[2];
            const amount = op === "sponge" ? -weight : weight;
            blend(
              target,
              index,
              [
                luma + (here[0] - luma) * (1 + amount),
                luma + (here[1] - luma) * (1 + amount),
                luma + (here[2] - luma) * (1 + amount),
                here[3]
              ],
              1
            );
            break;
          }
          case "clone":
            blend(
              target,
              index,
              sampleAt(source, x - offsetX, y - offsetY),
              weight
            );
            break;
          case "restore":
            blend(target, index, sampleAt(source, x, y), weight);
            break;
        }
      }
    }
    return carry ? { rect, carry } : { rect };
  }
  function syncSelectValue(root, value) {
    const select = root.querySelector("select");
    if (select) {
      if (select.value !== value) {
        select.value = value;
      }
      return;
    }
    if (root.getAttribute("value") !== value) {
      root.setAttribute("value", value);
    }
  }
  function toggleCollapsed(event) {
    return event.detail?.collapsed === true;
  }
  function hintText(text) {
    const hint = document.createElement("p");
    hint.className = "lz-hint";
    hint.textContent = text;
    return hint;
  }
  function buttonRow() {
    const row = document.createElement("div");
    row.className = "lz-buttons";
    return row;
  }
  function percentSlider(label, key, resetTo, min, ctx) {
    return createSlider({
      label,
      min,
      max: 100,
      step: 1,
      suffix: "%",
      value: Math.round(ctx.getBrush()[key] * 100),
      resetTo,
      onInput: (value) => ctx.setBrush({ [key]: value / 100 })
    });
  }
  function modeSelect(label, value, modes, onChange) {
    return createSelect({
      label,
      value,
      options: modes.map((entry) => ({
        value: entry.value,
        label: __(entry.label)
      })),
      onChange: (next) => onChange(next)
    });
  }
  function registerBrushPanel() {
    registerPanel({
      id: "brush",
      title: __("Brush"),
      order: 8,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const shape = createSelect({
          label: __("Shape"),
          value: ctx.getBrush().shape,
          options: BRUSH_SHAPES.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => ctx.setBrush({ shape: value })
        });
        const size = createSlider({
          label: __("Size"),
          min: 1,
          max: 400,
          step: 1,
          suffix: "px",
          value: ctx.getBrush().size,
          resetTo: 40,
          onInput: (value) => ctx.setBrush({ size: value })
        });
        const hardness = percentSlider(__("Hardness"), "hardness", 60, 0, ctx);
        const opacity = percentSlider(__("Opacity"), "opacity", 100, 1, ctx);
        const strength = percentSlider(__("Strength"), "strength", 50, 1, ctx);
        const tolerance = createSlider({
          label: __("Fill tolerance"),
          min: 0,
          max: 128,
          step: 1,
          value: ctx.getBrush().tolerance,
          resetTo: 32,
          onInput: (value) => ctx.setBrush({ tolerance: value })
        });
        const retouch = modeSelect(
          __("Retouch mode"),
          ctx.getBrush().retouch,
          RETOUCH_MODES,
          (value) => ctx.setBrush({ retouch: value })
        );
        const tone = modeSelect(
          __("Dodge & burn mode"),
          ctx.getBrush().tone,
          TONE_MODES,
          (value) => ctx.setBrush({ tone: value })
        );
        const colour = createColourField({
          label: __("Colour"),
          value: ctx.getBrush().colour,
          onChange: (value) => ctx.setBrush({ colour: value })
        });
        const off = ctx.onBrushChange((brush) => {
          size.setValue(Math.round(brush.size));
          hardness.setValue(Math.round(brush.hardness * 100));
          opacity.setValue(Math.round(brush.opacity * 100));
          strength.setValue(Math.round(brush.strength * 100));
          tolerance.setValue(Math.round(brush.tolerance));
          colour.setValue(brush.colour);
          syncSelectValue(shape.el, brush.shape);
          syncSelectValue(retouch.el, brush.retouch);
          syncSelectValue(tone.el, brush.tone);
        });
        host.append(
          shape.el,
          size.el,
          hardness.el,
          opacity.el,
          colour.el,
          createSection(__("Retouching"), {
            compact: true,
            children: [retouch.el, tone.el, strength.el]
          }),
          createSection(__("Fill"), { compact: true, children: [tolerance.el] })
        );
        const controls = [
          shape,
          size,
          hardness,
          opacity,
          colour,
          strength,
          retouch,
          tone,
          tolerance
        ];
        return () => {
          off();
          for (const control of controls) {
            control.destroy();
          }
        };
      }
    });
  }
  const MIN_SIZE = 0.02;
  function resizeRect(start, handle, dx, dy, aspect, frame) {
    if (handle === "move") {
      return clampRect({ ...start, x: start.x + dx, y: start.y + dy });
    }
    let { x, y, w, h } = start;
    if (handle.includes("w")) {
      const nx = Math.min(x + w - MIN_SIZE, Math.max(0, x + dx));
      w += x - nx;
      x = nx;
    }
    if (handle.includes("e")) {
      w = Math.min(1 - x, Math.max(MIN_SIZE, w + dx));
    }
    if (handle.includes("n")) {
      const ny = Math.min(y + h - MIN_SIZE, Math.max(0, y + dy));
      h += y - ny;
      y = ny;
    }
    if (handle.includes("s")) {
      h = Math.min(1 - y, Math.max(MIN_SIZE, h + dy));
    }
    if (aspect > 0) {
      const viewport = frame;
      const frameAspect = viewport && viewport.height > 0 ? viewport.width / viewport.height : 1;
      const relative = aspect / frameAspect;
      if (handle === "n" || handle === "s") {
        w = h * relative;
      } else {
        h = w / relative;
      }
      if (handle.includes("n")) {
        y = start.y + start.h - h;
      }
      if (handle.includes("w")) {
        x = start.x + start.w - w;
      }
    }
    return clampRect({ x, y, w, h });
  }
  class CropOverlay {
    constructor(options) {
      this.rect = { x: 0, y: 0, w: 1, h: 1 };
      this.aspect = 0;
      this.active = null;
      this.sync = () => {
        const viewport = this.options.getViewport();
        if (!viewport) {
          this.root.hidden = true;
          return;
        }
        this.root.hidden = false;
        this.root.style.insetInlineStart = `${viewport.x}px`;
        this.root.style.insetBlockStart = `${viewport.y}px`;
        this.root.style.inlineSize = `${viewport.width}px`;
        this.root.style.blockSize = `${viewport.height}px`;
        const rect = this.rect;
        for (const layer of [this.box, this.dim]) {
          layer.style.insetInlineStart = `${rect.x * 100}%`;
          layer.style.insetBlockStart = `${rect.y * 100}%`;
          layer.style.inlineSize = `${rect.w * 100}%`;
          layer.style.blockSize = `${rect.h * 100}%`;
        }
      };
      this.onPointerDown = (event) => {
        const target = event.target;
        const handle = target.dataset?.handle ?? "move";
        const viewport = this.options.getViewport();
        if (!viewport) {
          return;
        }
        this.active = {
          handle,
          startX: event.clientX,
          startY: event.clientY,
          startRect: { ...this.rect },
          viewport: { width: viewport.width, height: viewport.height }
        };
        event.preventDefault();
        event.stopPropagation();
        this.listen();
      };
      this.onPointerMove = (event) => {
        if (!this.active) {
          return;
        }
        const { viewport } = this.active;
        if (viewport.width === 0 || viewport.height === 0) {
          return;
        }
        const dx = (event.clientX - this.active.startX) / viewport.width;
        const dy = (event.clientY - this.active.startY) / viewport.height;
        this.rect = resizeRect(
          this.active.startRect,
          this.active.handle,
          dx,
          dy,
          this.aspect,
          this.active.viewport
        );
        this.options.onChange?.(this.rect);
        this.sync();
      };
      this.onPointerUp = () => {
        this.unlisten();
        if (!this.active) {
          return;
        }
        this.active = null;
        this.options.onChange?.(this.rect);
      };
      this.options = options;
      this.root = document.createElement("div");
      this.root.className = "lz-crop";
      this.root.setAttribute("aria-hidden", "true");
      const clip = document.createElement("div");
      clip.className = "lz-crop__clip";
      this.dim = document.createElement("div");
      this.dim.className = "lz-crop__dim";
      clip.appendChild(this.dim);
      this.box = document.createElement("div");
      this.box.className = "lz-crop__box";
      for (const line of ["v1", "v2", "h1", "h2"]) {
        const guide = document.createElement("span");
        guide.className = `lz-crop__guide lz-crop__guide--${line}`;
        this.box.appendChild(guide);
      }
      for (const handle of ["nw", "ne", "sw", "se", "n", "s", "w", "e"]) {
        const grip = document.createElement("span");
        grip.className = `lz-crop__handle lz-crop__handle--${handle}`;
        grip.dataset.handle = handle;
        this.box.appendChild(grip);
      }
      this.root.append(clip, this.box);
      options.stage.appendChild(this.root);
      this.box.addEventListener("pointerdown", this.onPointerDown);
      this.sync();
    }
    /** Starts tracking a drag on the window. */
    listen() {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
      window.addEventListener("blur", this.onPointerUp);
    }
    /** Stops tracking. Safe to call when not tracking. */
    unlisten() {
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("pointercancel", this.onPointerUp);
      window.removeEventListener("blur", this.onPointerUp);
    }
    /** The rectangle as it currently stands. */
    getRect() {
      return { ...this.rect };
    }
    /**
     * Replaces the rectangle.
     *
     * @param rect New rectangle.
     */
    setRect(rect) {
      this.rect = clampRect(rect);
      this.sync();
    }
    /**
     * Constrains dragging to an aspect ratio.
     *
     * @param aspect Width divided by height, or 0 for free.
     */
    setAspect(aspect) {
      this.aspect = aspect;
    }
    /** Whether the overlay is on screen. */
    setVisible(visible) {
      this.root.style.display = visible ? "" : "none";
      this.root.title = visible ? __("Drag to crop, then apply") : "";
    }
    /** Removes the overlay. */
    destroy() {
      this.unlisten();
      this.box.removeEventListener("pointerdown", this.onPointerDown);
      this.root.remove();
    }
  }
  const MAX_CANVAS = 2e4;
  function createCanvasSizeFields(ctx) {
    let pendingWidth = ctx.getRecipe().canvas.width;
    let pendingHeight = ctx.getRecipe().canvas.height;
    const applySize = () => {
      const recipe = ctx.getRecipe();
      const next = resizeCanvas(recipe.canvas, activeLayer$1(recipe).transform, {
        width: pendingWidth || recipe.canvas.width,
        height: pendingHeight || recipe.canvas.height
      });
      ctx.setDocument(next.canvas, next.transform);
    };
    const field = (label, axis) => createNumberField({
      label,
      value: "width" === axis ? pendingWidth : pendingHeight,
      min: MIN_CANVAS,
      max: MAX_CANVAS,
      suffix: "px",
      onChange: (value) => {
        if ("width" === axis) {
          pendingWidth = value;
        } else {
          pendingHeight = value;
        }
        applySize();
      }
    });
    const width = field(__("Width"), "width");
    const height = field(__("Height"), "height");
    const el = document.createElement("div");
    el.className = "lz-size";
    el.append(width.el, height.el);
    return {
      el,
      sync: () => {
        const canvas = ctx.getRecipe().canvas;
        pendingWidth = canvas.width;
        pendingHeight = canvas.height;
        width.setValue(canvas.width);
        height.setValue(canvas.height);
      },
      handles: [width, height]
    };
  }
  const ASPECTS = [
    { value: "0", label: __("Free"), ratio: 0 },
    { value: "1", label: __("Square"), ratio: 1 },
    { value: "1.7778", label: __("16:9"), ratio: 16 / 9 },
    { value: "1.5", label: __("3:2"), ratio: 3 / 2 },
    { value: "1.3333", label: __("4:3"), ratio: 4 / 3 },
    { value: "0.8", label: __("4:5 portrait"), ratio: 4 / 5 }
  ];
  const WHOLE_CANVAS = { x: 0, y: 0, w: 1, h: 1 };
  function attachOverlay$1(host, ctx) {
    const overlay = new CropOverlay({
      stage: ctx.stage,
      getViewport: ctx.getViewport
    });
    const offViewport = ctx.onViewportChange(overlay.sync);
    overlay.setVisible("crop" === ctx.getActiveTool());
    const offTool = ctx.onActiveToolChange(
      (tool) => overlay.setVisible("crop" === tool)
    );
    const onToggle = (event) => {
      if (toggleCollapsed(event)) {
        ctx.setActiveTool("transform");
        return;
      }
      overlay.setRect({ ...WHOLE_CANVAS });
      ctx.setActiveTool("crop");
    };
    host.addEventListener("lz-panel-toggle", onToggle);
    return {
      overlay,
      detach: () => {
        host.removeEventListener("lz-panel-toggle", onToggle);
        offViewport();
        offTool();
        overlay.destroy();
      }
    };
  }
  function registerCanvasPanel() {
    registerPanel({
      id: "canvas",
      title: __("Canvas & crop"),
      order: 35,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const { overlay, detach } = attachOverlay$1(host, ctx);
        const size = createCanvasSizeFields(ctx);
        const aspectSelect = createSelect({
          label: __("Crop ratio"),
          value: "0",
          options: ASPECTS.map(({ value, label }) => ({ value, label })),
          onChange: (value) => {
            const aspect = Number(value);
            overlay.setAspect(aspect);
            if (aspect > 0) {
              const { canvas } = ctx.getRecipe();
              overlay.setRect(centredCrop(aspect, canvas.width / canvas.height));
            }
          }
        });
        const applyCropButton = createButton({
          label: __("Apply crop"),
          variant: "primary",
          onClick: () => {
            const recipe = ctx.getRecipe();
            const next = applyCrop(
              recipe.canvas,
              activeLayer$1(recipe).transform,
              overlay.getRect()
            );
            ctx.setDocument(next.canvas, next.transform, "crop");
            overlay.setRect({ ...WHOLE_CANVAS });
          }
        });
        const trim = createButton({
          label: __("Fit canvas to image"),
          variant: "secondary",
          onClick: () => {
            const recipe = ctx.getRecipe();
            const image = ctx.getImageSize();
            const transform = activeLayer$1(recipe).transform;
            ctx.setDocument(
              {
                width: Math.round(image.width * transform.scaleX),
                height: Math.round(image.height * transform.scaleY)
              },
              { ...transform, x: 0.5, y: 0.5 }
            );
          }
        });
        const offRecipe = ctx.onRecipeChange(size.sync);
        size.sync();
        host.append(
          size.el,
          aspectSelect.el,
          applyCropButton.el,
          trim.el,
          hintText(
            __(
              "Cropping resizes the canvas. The image itself is untouched — move or scale it with the Transform tool."
            )
          )
        );
        const controls = [...size.handles, aspectSelect, applyCropButton, trim];
        return () => {
          detach();
          offRecipe();
          for (const control of controls) {
            control.destroy();
          }
        };
      }
    });
  }
  const CHANNEL_COLOURS = ["#ff4d4d", "#4dff88", "#4d9dff"];
  class HistogramView {
    constructor() {
      this.last = null;
      this.resizeObserver = null;
      this.el = document.createElement("div");
      this.el.className = "lz-histogram";
      this.el.setAttribute("role", "img");
      this.el.setAttribute("aria-label", "Tone distribution of the edited image");
      this.canvas = document.createElement("canvas");
      this.canvas.className = "lz-histogram__canvas";
      this.el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => this.redraw());
        this.resizeObserver.observe(this.el);
      }
    }
    /**
     * Replaces the plotted data.
     *
     * @param histogram Bucket counts.
     */
    update(histogram) {
      this.last = histogram;
      this.redraw();
    }
    /** Re-renders the last histogram at the current element size. */
    redraw() {
      if (!this.ctx) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const rect = this.el.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const histogram = this.last;
      if (!histogram || histogram.total === 0 || histogram.peak === 0) {
        return;
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      [histogram.r, histogram.g, histogram.b].forEach((bins, index) => {
        ctx.fillStyle = CHANNEL_COLOURS[index];
        ctx.globalAlpha = 0.55;
        this.fillCurve(ctx, bins, histogram.peak, width, height);
      });
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1;
      this.strokeCurve(ctx, histogram.luma, histogram.peak, width, height);
      ctx.restore();
    }
    /**
     * Builds the path for one channel.
     *
     * Counts above `peak` are clamped to the top rather than rescaling everything,
     * so a clipping spike reads as a bar running off the plot instead of flattening
     * the whole curve. See `histogramPeak()` for why the peak excludes the extremes.
     */
    traceCurve(ctx, bins, peak, width, height) {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < 256; i++) {
        const x = i / 255 * width;
        const y = height - Math.min(1, bins[i] / peak) * height;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
    }
    /** Fills one channel's curve. */
    fillCurve(ctx, bins, peak, width, height) {
      this.traceCurve(ctx, bins, peak, width, height);
      ctx.closePath();
      ctx.fill();
    }
    /** Strokes one channel's curve. */
    strokeCurve(ctx, bins, peak, width, height) {
      this.traceCurve(ctx, bins, peak, width, height);
      ctx.stroke();
    }
    /** Releases the resize observer. */
    destroy() {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
    }
  }
  function registerHistogramPanel() {
    registerPanel({
      id: "histogram",
      title: __("Histogram"),
      order: 10,
      render: (host, ctx) => {
        const view = new HistogramView();
        host.appendChild(view.el);
        const off = ctx.onHistogram((histogram) => view.update(histogram));
        return () => {
          off();
          view.destroy();
        };
      }
    });
  }
  function layerRow(layer, ctx) {
    const row = document.createElement("div");
    row.className = "lz-layer";
    row.classList.toggle("is-active", layer.id === ctx.getActiveLayerId());
    const eye = createIconButton({
      glyph: layer.visible ? "●" : "○",
      label: layer.visible ? __("Hide layer") : __("Show layer"),
      className: "lz-layer__eye",
      onClick: () => ctx.setLayers(
        updateLayer(ctx.getLayers(), layer.id, { visible: !layer.visible })
      )
    });
    const name = document.createElement("button");
    name.type = "button";
    name.className = "lz-layer__name";
    name.textContent = layer.name;
    name.addEventListener("click", () => ctx.setLayers(ctx.getLayers(), layer.id));
    const move = (glyph, label, direction) => createIconButton({
      glyph,
      label,
      className: "lz-layer__move",
      onClick: () => ctx.setLayers(reorderLayer(ctx.getLayers(), layer.id, direction), layer.id)
    });
    const up = move("↑", __("Bring forward"), 1);
    const down = move("↓", __("Send backward"), -1);
    const handles = [eye, up, down];
    if (layer.opacity < 1) {
      const faded = document.createElement("span");
      faded.className = "lz-layer__opacity";
      faded.textContent = `${Math.round(layer.opacity * 100)}%`;
      name.appendChild(faded);
    }
    row.append(eye.el, name);
    if (layer.text) {
      row.classList.add("is-text");
      const edit = createIconButton({
        glyph: "T",
        label: __("Edit text"),
        className: "lz-layer__edit",
        onClick: () => ctx.editTextLayer(layer.id)
      });
      handles.push(edit);
      row.appendChild(edit.el);
    }
    row.append(up.el, down.el);
    if (BASE_LAYER_ID !== layer.id) {
      const remove = createIconButton({
        glyph: "×",
        label: __("Delete layer"),
        className: "lz-layer__delete",
        onClick: () => ctx.setLayers(
          ctx.getLayers().filter((entry) => entry.id !== layer.id)
        )
      });
      handles.push(remove);
      row.appendChild(remove.el);
    }
    return { el: row, handles };
  }
  function activeLayer(ctx) {
    const layers = ctx.getLayers();
    return layers.find((layer) => layer.id === ctx.getActiveLayerId()) ?? layers[0];
  }
  function activeOpacity(ctx) {
    return Math.round((activeLayer(ctx)?.opacity ?? 1) * 100);
  }
  function registerLayersPanel() {
    registerPanel({
      id: "layers",
      title: __("Layers"),
      order: 5,
      render: (host, ctx) => {
        const list = document.createElement("div");
        list.className = "lz-layers";
        let rowHandles = [];
        const releaseRows = () => {
          for (const handle of rowHandles) {
            handle.destroy();
          }
          rowHandles = [];
        };
        const draw = () => {
          list.replaceChildren();
          releaseRows();
          for (const layer of [...ctx.getLayers()].reverse()) {
            const row = layerRow(layer, ctx);
            rowHandles.push(...row.handles);
            list.appendChild(row.el);
          }
        };
        const opacity = createSlider({
          label: __("Opacity"),
          min: 0,
          max: 100,
          step: 1,
          suffix: "%",
          value: activeOpacity(ctx),
          resetTo: 100,
          onInput: (value) => ctx.setLayers(
            updateLayer(ctx.getLayers(), ctx.getActiveLayerId(), {
              opacity: Math.min(1, Math.max(0, value / 100))
            })
          )
        });
        opacity.el.classList.add("lz-layers__opacity");
        const add = createButton({
          label: __("Add layer"),
          variant: "secondary",
          onClick: () => ctx.addLayer()
        });
        const hint = document.createElement("p");
        hint.className = "lz-hint";
        hint.textContent = __(
          "Layers travel with the saved copy: open it again and they are still here to edit."
        );
        const off = ctx.onRecipeChange(() => {
          draw();
          opacity.setValue(activeOpacity(ctx));
        });
        draw();
        host.append(list, opacity.el, add.el, hint);
        return () => {
          releaseRows();
          off();
          opacity.destroy();
          add.destroy();
        };
      }
    });
  }
  function registerOutputPanel() {
    registerPanel({
      id: "output",
      title: __("Output"),
      order: 80,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const syncQuality = () => {
          quality.el.hidden = "image/png" === ctx.getRecipe().output.format;
        };
        const format = createSelect({
          label: __("Format"),
          value: ctx.getRecipe().output.format,
          options: [
            { value: "image/jpeg", label: __("JPEG — smallest, no transparency") },
            { value: "image/png", label: __("PNG — lossless, keeps transparency") },
            { value: "image/webp", label: __("WebP — small and lossless-capable") }
          ],
          onChange: (value) => {
            ctx.setOutput({ format: value });
            syncQuality();
          }
        });
        const quality = createSlider({
          label: __("Quality"),
          min: 10,
          max: 100,
          step: 1,
          suffix: "%",
          value: Math.round(ctx.getRecipe().output.quality * 100),
          resetTo: 92,
          onInput: (value) => ctx.setOutput({ quality: value / 100 })
        });
        host.append(format.el, quality.el);
        syncQuality();
        return () => {
          format.destroy();
          quality.destroy();
        };
      }
    });
  }
  function failureMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
  }
  function registerPresetsPanel() {
    registerPanel({
      id: "presets",
      title: __("Presets"),
      order: 70,
      defaultCollapsed: true,
      render: (host, ctx) => renderPresets(host, ctx)
    });
  }
  function renderPresets(host, ctx) {
    const list = document.createElement("div");
    list.className = "lz-presets";
    const status = hintText("");
    let rowHandles = [];
    let presetName = "";
    const releaseRows = () => {
      for (const handle of rowHandles) {
        handle.destroy();
      }
      rowHandles = [];
    };
    const refresh = async () => {
      list.replaceChildren();
      releaseRows();
      let presets;
      try {
        presets = await ctx.listPresets();
      } catch (error) {
        status.textContent = failureMessage(
          error,
          __("Presets could not be loaded.")
        );
        return;
      }
      if (0 === presets.length) {
        status.textContent = __(
          "No presets yet. Adjust an image, then save the look to reuse it."
        );
        return;
      }
      status.textContent = "";
      for (const preset of presets) {
        const row = document.createElement("div");
        row.className = "lz-preset";
        const apply = createButton({
          label: preset.name,
          variant: "ghost",
          onClick: () => ctx.applyPreset(preset)
        });
        apply.el.classList.add("lz-preset__apply");
        const remove = createIconButton({
          glyph: "×",
          label: sprintf(__("Delete “%s”"), preset.name),
          className: "lz-preset__delete",
          onClick: async () => {
            await ctx.deletePreset(preset.id);
            await refresh();
          }
        });
        rowHandles.push(apply, remove);
        row.append(apply.el, remove.el);
        list.appendChild(row);
      }
    };
    const name = createTextField({
      label: __("Preset name"),
      value: "",
      placeholder: __("Name this look"),
      onChange: (value) => {
        presetName = value;
      }
    });
    const save2 = createButton({
      label: __("Save look"),
      variant: "secondary",
      onClick: async () => {
        if (!presetName.trim()) {
          return;
        }
        try {
          await ctx.savePreset(presetName);
          presetName = "";
          name.setValue("");
          await refresh();
        } catch (error) {
          status.textContent = failureMessage(
            error,
            __("The preset could not be saved.")
          );
        }
      }
    });
    host.append(list, status, name.el, save2.el);
    void refresh();
    return () => {
      releaseRows();
      name.destroy();
      save2.destroy();
    };
  }
  const GRAB_RADIUS = 12;
  const DELETE_DISTANCE = 40;
  function isPointerEvent(event) {
    return !!event && "pointerId" in event;
  }
  class CurveEditor {
    constructor(options) {
      this.dragIndex = -1;
      this.dragPointer = -1;
      this.dragAt = { x: 0, y: 0 };
      this.resizeObserver = null;
      this.sync = () => this.draw();
      this.onPointerDown = (event) => {
        const points = [...this.options.getPoints()];
        const at = this.toGraph(event);
        let index = points.findIndex(
          ([px, py]) => Math.hypot(px - at.x, py - at.y) < GRAB_RADIUS
        );
        if (index === -1) {
          points.push([at.x, at.y]);
          points.sort((a, b) => a[0] - b[0]);
          index = points.findIndex((p) => p[0] === at.x && p[1] === at.y);
          this.options.onChange(points);
        }
        this.dragIndex = index;
        this.dragPointer = event.pointerId;
        this.dragAt = at;
        try {
          this.canvas.setPointerCapture(event.pointerId);
        } catch {
        }
        this.listen();
        event.preventDefault();
        this.draw();
      };
      this.onPointerMove = (event) => {
        if (this.dragIndex < 0 || event.pointerId !== this.dragPointer) {
          return;
        }
        const points = this.options.getPoints().map((p) => [...p]);
        if (!points[this.dragIndex]) {
          return;
        }
        const at = this.toGraph(event);
        this.dragAt = at;
        const isEndpoint = this.dragIndex === 0 || this.dragIndex === points.length - 1;
        points[this.dragIndex] = [
          isEndpoint ? points[this.dragIndex][0] : at.x,
          at.y
        ];
        this.options.onChange(points);
        this.draw();
      };
      this.onPointerUp = (event) => {
        if (this.dragIndex < 0) {
          return;
        }
        if (isPointerEvent(event) && -1 !== this.dragPointer && event.pointerId !== this.dragPointer) {
          return;
        }
        const points = this.options.getPoints().map((p) => [...p]);
        const index = this.dragIndex;
        this.dragIndex = -1;
        this.release();
        if (isPointerEvent(event)) {
          try {
            this.canvas.releasePointerCapture?.(event.pointerId);
          } catch {
          }
        }
        this.dragPointer = -1;
        const at = this.dragAt;
        const outside = at.x < -DELETE_DISTANCE || at.x > 255 + DELETE_DISTANCE || at.y < -DELETE_DISTANCE || at.y > 255 + DELETE_DISTANCE;
        if (outside && index > 0 && index < points.length - 1) {
          points.splice(index, 1);
          this.options.onChange(points);
        }
        this.options.onCommit();
        this.draw();
      };
      this.onDoubleClick = (event) => {
        event.preventDefault();
        this.options.onChange([
          [0, 0],
          [255, 255]
        ]);
        this.options.onCommit();
        this.draw();
      };
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "lz-curve";
      this.canvas = document.createElement("canvas");
      this.canvas.className = "lz-curve__canvas";
      this.canvas.setAttribute("role", "img");
      this.canvas.setAttribute(
        "aria-label",
        __("Tone curve. Drag to add or move control points.")
      );
      this.canvas.tabIndex = 0;
      this.el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("dblclick", this.onDoubleClick);
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => this.draw());
        this.resizeObserver.observe(this.el);
      }
      this.draw();
    }
    /** Converts a pointer event into graph coordinates, 0..255 with y up. */
    toGraph(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / rect.width * 255,
        y: (1 - (event.clientY - rect.top) / rect.height) * 255
      };
    }
    /**
     * Tracks the drag on the window, so a release anywhere ends it.
     *
     * The same rule the stage tools follow, and for the same reason: these listeners
     * used to be on the canvas, so letting go outside the graph left the point grabbed
     * and following the mouse with no button held. `pointercancel` and `blur` are here
     * too -- a gesture the browser takes over, or a window that loses focus mid-drag,
     * are both ways a `pointerup` never comes.
     */
    listen() {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
      window.addEventListener("blur", this.onPointerUp);
    }
    /** Stops tracking. Safe to call when nothing is being tracked. */
    release() {
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("pointercancel", this.onPointerUp);
      window.removeEventListener("blur", this.onPointerUp);
    }
    /** Paints the grid, the curve and its control points. */
    draw() {
      if (!this.ctx) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const rect = this.el.getBoundingClientRect();
      const size = Math.max(1, Math.round(Math.min(rect.width, rect.width)));
      if (this.canvas.width !== size * dpr) {
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = `${size}px`;
        this.canvas.style.height = `${size}px`;
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const toCanvas2 = (x, y) => ({
        cx: x / 255 * size,
        cy: (1 - y / 255) * size
      });
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const at = i / 4 * size;
        ctx.beginPath();
        ctx.moveTo(at, 0);
        ctx.lineTo(at, size);
        ctx.moveTo(0, at);
        ctx.lineTo(size, at);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.stroke();
      const points = this.options.getPoints();
      const sampled = sampleCurve(points);
      ctx.strokeStyle = "#f0f0f1";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < 256; x++) {
        const { cx, cy } = toCanvas2(x, sampled[x]);
        if (x === 0) {
          ctx.moveTo(cx, cy);
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.stroke();
      points.forEach(([x, y], index) => {
        const { cx, cy } = toCanvas2(x, y);
        ctx.beginPath();
        ctx.arc(cx, cy, index === this.dragIndex ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = index === this.dragIndex ? "#3582c4" : "#f0f0f1";
        ctx.fill();
      });
    }
    /** Releases listeners, including a drag still in progress. */
    destroy() {
      this.dragIndex = -1;
      this.dragPointer = -1;
      this.release();
      this.resizeObserver?.disconnect();
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    }
  }
  const IDENTITY_CURVE = [
    [0, 0],
    [255, 255]
  ];
  function registerCurvesPanel() {
    registerPanel({
      id: "curves",
      title: __("Curves"),
      order: 40,
      defaultCollapsed: true,
      render: (host, ctx) => {
        let channel = "rgb";
        const editor = new CurveEditor({
          getPoints: () => ctx.getRecipe().curves[channel] ?? IDENTITY_CURVE,
          onChange: (points) => ctx.setCurve(channel, points),
          onCommit: () => {
          }
        });
        const picker = createSelect({
          label: __("Channel"),
          value: "rgb",
          options: [
            { value: "rgb", label: __("RGB") },
            { value: "r", label: __("Red") },
            { value: "g", label: __("Green") },
            { value: "b", label: __("Blue") }
          ],
          onChange: (value) => {
            channel = value;
            editor.sync();
          }
        });
        const offRecipe = ctx.onRecipeChange(editor.sync);
        host.append(
          picker.el,
          editor.el,
          hintText(
            __(
              "Click to add a point, drag it well outside to remove it, double-click to reset."
            )
          )
        );
        return () => {
          offRecipe();
          editor.destroy();
          picker.destroy();
        };
      }
    });
  }
  function levelsSlider(ctx, label, key, min, max, scale) {
    return createSlider({
      label,
      min,
      max,
      step: 1,
      value: ctx.getRecipe().levels[key] * scale,
      resetTo: IDENTITY_LEVELS[key] * scale,
      onInput: (value) => ctx.setLevels({ ...ctx.getRecipe().levels, [key]: value / scale })
    });
  }
  function registerLevelsPanel() {
    registerPanel({
      id: "levels",
      title: __("Levels"),
      order: 50,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const black = levelsSlider(ctx, __("Black point"), "black", 0, 254, 1);
        const white = levelsSlider(ctx, __("White point"), "white", 1, 255, 1);
        const gamma = levelsSlider(ctx, __("Midtones"), "gamma", 10, 400, 100);
        const offRecipe = ctx.onRecipeChange((recipe) => {
          black.setValue(recipe.levels.black);
          white.setValue(recipe.levels.white);
          gamma.setValue(Math.round(recipe.levels.gamma * 100));
        });
        host.append(black.el, white.el, gamma.el);
        return () => {
          offRecipe();
          black.destroy();
          white.destroy();
          gamma.destroy();
        };
      }
    });
  }
  function registerTonePanels() {
    registerCurvesPanel();
    registerLevelsPanel();
  }
  const GRIPS = ["nw", "ne", "sw", "se", "n", "s", "w", "e"];
  function buildChrome$1(stage) {
    const root = document.createElement("div");
    root.className = "lz-transform";
    const box = document.createElement("div");
    box.className = "lz-transform__box";
    box.dataset.handle = "move";
    box.title = __(
      "Drag to move. Corners scale both axes, edges scale one, the top handle rotates. Hold Shift on a corner to scale freely."
    );
    for (const handle of GRIPS) {
      const grip = document.createElement("span");
      grip.className = `lz-transform__handle lz-transform__handle--${handle}`;
      grip.dataset.handle = handle;
      box.appendChild(grip);
    }
    const stem = document.createElement("span");
    stem.className = "lz-transform__stem";
    box.appendChild(stem);
    const rotate = document.createElement("span");
    rotate.className = "lz-transform__handle lz-transform__handle--rotate";
    rotate.dataset.handle = "rotate";
    rotate.title = __("Rotate. Hold Shift to snap.");
    box.appendChild(rotate);
    const guideX = document.createElement("span");
    guideX.className = "lz-snap lz-snap--v";
    guideX.hidden = true;
    const guideY = document.createElement("span");
    guideY.className = "lz-snap lz-snap--h";
    guideY.hidden = true;
    root.append(guideX, guideY, box);
    stage.appendChild(root);
    return { root, box, guideX, guideY };
  }
  function layOut(chrome, options) {
    const viewport = options.getViewport();
    const canvas = options.getCanvas();
    if (!viewport || canvas.width <= 0) {
      chrome.root.hidden = true;
      return;
    }
    chrome.root.hidden = false;
    chrome.root.style.insetInlineStart = `${viewport.x}px`;
    chrome.root.style.insetBlockStart = `${viewport.y}px`;
    chrome.root.style.inlineSize = `${viewport.width}px`;
    chrome.root.style.blockSize = `${viewport.height}px`;
    const transform = options.getTransform();
    const image = options.getImageSize();
    const ratio = viewport.width / canvas.width;
    const width = image.width * transform.scaleX * ratio;
    const height = image.height * transform.scaleY * ratio;
    chrome.box.style.inlineSize = `${width}px`;
    chrome.box.style.blockSize = `${height}px`;
    chrome.box.style.insetInlineStart = `${transform.x * viewport.width - width / 2}px`;
    chrome.box.style.insetBlockStart = `${transform.y * viewport.height - height / 2}px`;
    chrome.box.style.transform = `rotate(${transform.rotation}deg)`;
  }
  function showGuide(element, at, axis) {
    if (null === at) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    if ("v" === axis) {
      element.style.insetInlineStart = `${at * 100}%`;
    } else {
      element.style.insetBlockStart = `${at * 100}%`;
    }
  }
  function projectLocal(dx, dy, rotation) {
    const radians = rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      localX: Math.max(1, Math.abs(dx * cos + dy * sin)),
      localY: Math.max(1, Math.abs(-dx * sin + dy * cos))
    };
  }
  function snap(value, targets, tolerance) {
    let best = value;
    let bestDistance = tolerance;
    let hit = false;
    for (const target of targets) {
      const distance = Math.abs(value - target);
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
        hit = true;
      }
    }
    return { value: best, hit };
  }
  const SNAP_DEGREES = 15;
  const SNAP_PX = 7;
  function bound(value) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }
  function dragMove(start, event, canvas, image, snapping) {
    const dx = (event.clientX - start.pointerX) / start.pixelRatio;
    const dy = (event.clientY - start.pointerY) / start.pixelRatio;
    const x = start.transform.x + dx / canvas.width;
    const y = start.transform.y + dy / canvas.height;
    if (!snapping) {
      return {
        transform: { ...start.transform, x, y },
        guideX: null,
        guideY: null
      };
    }
    const halfW = image.width * start.transform.scaleX / 2 / canvas.width;
    const halfH = image.height * start.transform.scaleY / 2 / canvas.height;
    const snappedX = snap(x, [0.5, halfW, 1 - halfW], SNAP_PX / start.pixelRatio / canvas.width);
    const snappedY = snap(y, [0.5, halfH, 1 - halfH], SNAP_PX / start.pixelRatio / canvas.height);
    return {
      transform: { ...start.transform, x: snappedX.value, y: snappedY.value },
      guideX: snappedX.hit ? snappedX.value : null,
      guideY: snappedY.hit ? snappedY.value : null
    };
  }
  function dragRotate(start, event) {
    const angle = Math.atan2(event.clientY - start.centreY, event.clientX - start.centreX) * 180 / Math.PI;
    let rotation = start.transform.rotation + (angle - start.angle);
    if (event.shiftKey) {
      rotation = Math.round(rotation / SNAP_DEGREES) * SNAP_DEGREES;
    }
    return { ...start.transform, rotation: normaliseAngle(rotation) };
  }
  function dragScale(start, event) {
    const dx = event.clientX - start.centreX;
    const dy = event.clientY - start.centreY;
    const local = projectLocal(dx, dy, start.transform.rotation);
    const scaleX = bound(start.transform.scaleX * (local.localX / start.localX));
    const scaleY = bound(start.transform.scaleY * (local.localY / start.localY));
    if ("e" === start.handle || "w" === start.handle) {
      return { ...start.transform, scaleX };
    }
    if ("n" === start.handle || "s" === start.handle) {
      return { ...start.transform, scaleY };
    }
    if (event.shiftKey) {
      return { ...start.transform, scaleX, scaleY };
    }
    const ratio = Math.hypot(dx, dy) / start.distance;
    return {
      ...start.transform,
      scaleX: bound(start.transform.scaleX * ratio),
      scaleY: bound(start.transform.scaleY * ratio)
    };
  }
  class TransformOverlay {
    constructor(options) {
      this.start = null;
      this.sync = () => {
        layOut(this.chrome, this.options);
      };
      this.onPointerDown = (event) => {
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!viewport || canvas.width <= 0) {
          return;
        }
        const target = event.target;
        const handle = target.dataset?.handle ?? "move";
        const transform = this.options.getTransform();
        const stageRect = this.options.stage.getBoundingClientRect();
        const centreX = stageRect.left + viewport.x + transform.x * viewport.width;
        const centreY = stageRect.top + viewport.y + transform.y * viewport.height;
        const dx = event.clientX - centreX;
        const dy = event.clientY - centreY;
        this.start = {
          handle,
          pointerX: event.clientX,
          pointerY: event.clientY,
          transform: { ...transform },
          pixelRatio: viewport.width / canvas.width,
          centreX,
          centreY,
          angle: Math.atan2(dy, dx) * 180 / Math.PI,
          distance: Math.max(1, Math.hypot(dx, dy)),
          ...projectLocal(dx, dy, transform.rotation)
        };
        event.preventDefault();
        event.stopPropagation();
        this.listen();
      };
      this.onPointerMove = (event) => {
        const start = this.start;
        if (!start) {
          return;
        }
        if ("move" === start.handle) {
          const moved = dragMove(
            start,
            event,
            this.options.getCanvas(),
            this.options.getImageSize(),
            this.options.getSnapping() && !event.altKey
          );
          this.options.onChange(moved.transform);
          showGuide(this.guideX, moved.guideX, "v");
          showGuide(this.guideY, moved.guideY, "h");
          this.sync();
          return;
        }
        if ("rotate" === start.handle) {
          this.options.onChange(dragRotate(start, event));
          this.sync();
          return;
        }
        this.options.onChange(dragScale(start, event));
        this.sync();
      };
      this.onPointerUp = () => {
        this.unlisten();
        if (!this.start) {
          return;
        }
        this.start = null;
        this.guideX.hidden = true;
        this.guideY.hidden = true;
        this.options.onCommit();
      };
      this.options = options;
      this.chrome = buildChrome$1(options.stage);
      this.root = this.chrome.root;
      this.box = this.chrome.box;
      this.guideX = this.chrome.guideX;
      this.guideY = this.chrome.guideY;
      this.box.addEventListener("pointerdown", this.onPointerDown);
      this.sync();
    }
    /** Starts tracking a drag on the window. */
    listen() {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
      window.addEventListener("blur", this.onPointerUp);
    }
    /** Stops tracking. Safe to call when not tracking. */
    unlisten() {
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("pointercancel", this.onPointerUp);
      window.removeEventListener("blur", this.onPointerUp);
    }
    setVisible(visible) {
      this.root.style.display = visible ? "" : "none";
      if (!visible) {
        this.guideX.hidden = true;
        this.guideY.hidden = true;
      }
    }
    /** Removes the overlay. */
    destroy() {
      this.unlisten();
      this.box.removeEventListener("pointerdown", this.onPointerDown);
      this.root.remove();
    }
  }
  function actionRow(actions) {
    const el = buttonRow();
    const handles = actions.map((action) => {
      const button = createButton({
        label: action.label,
        title: action.title,
        variant: "secondary",
        onClick: action.run
      });
      el.appendChild(button.el);
      return button;
    });
    return { el, handles };
  }
  function rotateFlipRow(ctx) {
    const current = () => activeLayer$1(ctx.getRecipe()).transform;
    const quarter = (direction) => {
      const layer = current();
      ctx.setLayer({
        ...layer,
        rotation: normaliseAngle(layer.rotation + direction * 90)
      });
    };
    return actionRow([
      { label: "⟲", title: __("Rotate left"), run: () => quarter(-1) },
      { label: "⟳", title: __("Rotate right"), run: () => quarter(1) },
      {
        label: "↔",
        title: __("Flip horizontally"),
        run: () => ctx.setLayer({ ...current(), flipH: !current().flipH })
      },
      {
        label: "↕",
        title: __("Flip vertically"),
        run: () => ctx.setLayer({ ...current(), flipV: !current().flipV })
      }
    ]);
  }
  function fitFillRow(ctx) {
    const apply = (compute) => () => {
      const recipe = ctx.getRecipe();
      const value = compute(ctx.getImageSize(), recipe.canvas);
      ctx.setLayer({
        ...activeLayer$1(recipe).transform,
        scaleX: value,
        scaleY: value,
        x: 0.5,
        y: 0.5
      });
    };
    return actionRow([
      {
        label: __("Fit"),
        title: __("Scale the image to fit inside the canvas"),
        run: apply(fitScale$1)
      },
      {
        label: __("Fill"),
        title: __("Scale the image to cover the canvas"),
        run: apply(coverScale)
      }
    ]);
  }
  function attachOverlay(host, ctx) {
    const overlay = new TransformOverlay({
      stage: ctx.stage,
      getViewport: ctx.getViewport,
      getCanvas: () => ctx.getRecipe().canvas,
      getImageSize: ctx.getImageSize,
      getTransform: () => activeLayer$1(ctx.getRecipe()).transform,
      // One label for the whole gesture, so History collapses it into a single undo
      // step rather than one per pointer move.
      onChange: (layer) => ctx.setLayer(layer, "transform-drag"),
      onCommit: () => {
      },
      getSnapping: () => ctx.getView().snapping
    });
    const offViewport = ctx.onViewportChange(overlay.sync);
    const offRecipe = ctx.onRecipeChange(overlay.sync);
    overlay.setVisible("transform" === ctx.getActiveTool());
    const offTool = ctx.onActiveToolChange(
      (tool) => overlay.setVisible("transform" === tool)
    );
    const onToggle = (event) => {
      if (!toggleCollapsed(event)) {
        ctx.setActiveTool("transform");
      }
    };
    host.addEventListener("lz-panel-toggle", onToggle);
    return () => {
      host.removeEventListener("lz-panel-toggle", onToggle);
      offViewport();
      offRecipe();
      offTool();
      overlay.destroy();
    };
  }
  function registerTransformPanel() {
    registerPanel({
      id: "transform",
      title: __("Transform"),
      order: 30,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const detachOverlay = attachOverlay(host, ctx);
        const current = () => activeLayer$1(ctx.getRecipe()).transform;
        const rotation = createSlider({
          label: __("Rotation"),
          min: -180,
          max: 180,
          step: 0.1,
          suffix: "°",
          value: current().rotation,
          resetTo: 0,
          onInput: (value) => ctx.setLayer({ ...current(), rotation: value }, "rotation")
        });
        let linked = true;
        const axisSlider = (label, axis) => createSlider({
          label,
          min: Math.round(MIN_SCALE * 100),
          max: Math.round(MAX_SCALE * 100),
          step: 1,
          suffix: "%",
          value: Math.round(current()[axis] * 100),
          resetTo: 100,
          onInput: (value) => {
            const layer = current();
            ctx.setLayer(
              linked ? { ...layer, scaleX: value / 100, scaleY: value / 100 } : { ...layer, [axis]: value / 100 },
              "scale"
            );
          }
        });
        const scaleX = axisSlider(__("Scale X"), "scaleX");
        const scaleY = axisSlider(__("Scale Y"), "scaleY");
        const link = createCheckbox({
          label: __("Link scale axes"),
          checked: true,
          title: __("Scale both axes together. Unlink to stretch one."),
          onChange: (checked) => {
            linked = checked;
          }
        });
        const rotateFlip = rotateFlipRow(ctx);
        const fitFill = fitFillRow(ctx);
        const reset = createButton({
          label: __("Reset transform"),
          variant: "ghost",
          onClick: () => ctx.setLayer({ ...IDENTITY_TRANSFORM })
        });
        const offSliders = ctx.onRecipeChange(() => {
          const layer = current();
          rotation.setValue(Math.round(layer.rotation * 10) / 10);
          scaleX.setValue(Math.round(layer.scaleX * 100));
          scaleY.setValue(Math.round(layer.scaleY * 100));
        });
        host.append(
          rotateFlip.el,
          rotation.el,
          scaleX.el,
          scaleY.el,
          link.el,
          fitFill.el,
          reset.el
        );
        const controls = [
          rotation,
          scaleX,
          scaleY,
          link,
          reset,
          ...rotateFlip.handles,
          ...fitFill.handles
        ];
        return () => {
          detachOverlay();
          offSliders();
          for (const control of controls) {
            control.destroy();
          }
        };
      }
    });
  }
  function registerViewPanel() {
    registerPanel({
      id: "view",
      title: __("View"),
      order: 85,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const toggles = [
          ["rulers", __("Rulers"), __("Marked in canvas pixels.")],
          [
            "snapping",
            __("Snapping"),
            __(
              "Snap a moved layer to the canvas edges and centre. Hold Alt to bypass."
            )
          ]
        ].map(
          ([key, label, hint]) => createCheckbox({
            label,
            title: hint,
            checked: ctx.getView()[key],
            onChange: (checked) => ctx.setView({ [key]: checked })
          })
        );
        host.append(...toggles.map((toggle) => toggle.el));
        return () => {
          for (const toggle of toggles) {
            toggle.destroy();
          }
        };
      }
    });
  }
  function registerInfoPanel() {
    registerPanel({
      id: "info",
      title: __("Image info"),
      order: 90,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const { payload } = ctx;
        const rows = [
          [
            __("Dimensions"),
            sprintf("%1$d × %2$d", payload.width, payload.height)
          ],
          [__("Format"), payload.mime.replace("image/", "").toUpperCase()],
          [
            __("Megapixels"),
            (payload.width * payload.height / 1e6).toFixed(1)
          ]
        ];
        if (payload.sourceId !== payload.id) {
          rows.push([__("Edited from"), `#${payload.sourceId}`]);
        }
        const list = document.createElement("dl");
        list.className = "lz-info";
        for (const [term, value] of rows) {
          const dt = document.createElement("dt");
          dt.textContent = term;
          const dd = document.createElement("dd");
          dd.textContent = value;
          list.append(dt, dd);
        }
        host.appendChild(list);
      }
    });
  }
  function registerViewPanels() {
    registerViewPanel();
    registerInfoPanel();
  }
  function registerBuiltInPanels() {
    registerHistogramPanel();
    registerLayersPanel();
    registerBrushPanel();
    registerAdjustmentPanels();
    registerTransformPanel();
    registerCanvasPanel();
    registerTonePanels();
    registerPresetsPanel();
    registerOutputPanel();
    registerViewPanels();
  }
  function createPanelSection(options) {
    const { def, collapsed } = options;
    const section = document.createElement("section");
    section.className = "lz-panel";
    section.dataset.panel = def.id;
    section.classList.toggle("is-collapsed", collapsed);
    const bodyId = `lz-panel-body-${def.id}`;
    const header = document.createElement("button");
    header.type = "button";
    header.className = "lz-panel__header";
    header.setAttribute("aria-expanded", String(!collapsed));
    header.setAttribute("aria-controls", bodyId);
    const chevron = document.createElement("span");
    chevron.className = "lz-panel__chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▸";
    const title = document.createElement("span");
    title.className = "lz-panel__title";
    title.textContent = def.title;
    header.append(chevron, title);
    const body = document.createElement("div");
    body.className = "lz-panel__body";
    body.id = bodyId;
    body.hidden = collapsed;
    body.dataset.collapsed = String(collapsed);
    header.addEventListener("click", () => {
      const next = !section.classList.contains("is-collapsed");
      section.classList.toggle("is-collapsed", next);
      body.hidden = next;
      body.dataset.collapsed = String(next);
      header.setAttribute("aria-expanded", String(!next));
      options.onToggle(next);
      body.dispatchEvent(
        new CustomEvent("lz-panel-toggle", {
          detail: { collapsed: next },
          bubbles: false
        })
      );
    });
    const teardown = def.render(body, options.ctx);
    section.append(header, body);
    return {
      el: section,
      teardown: "function" === typeof teardown ? teardown : null
    };
  }
  function buildSidebarChrome(options) {
    const { root } = options;
    root.replaceChildren();
    const header = document.createElement("div");
    header.className = "lz-sidebar__header";
    const label = document.createElement("span");
    label.className = "lz-sidebar__title";
    label.textContent = __("Tools");
    const pickerToggle = document.createElement("button");
    pickerToggle.type = "button";
    pickerToggle.className = "lz-sidebar__picker-toggle";
    pickerToggle.textContent = "⋯";
    pickerToggle.title = __("Choose which tools are shown");
    pickerToggle.setAttribute("aria-label", __("Choose which tools are shown"));
    pickerToggle.setAttribute("aria-expanded", "false");
    pickerToggle.addEventListener("click", () => options.onPicker(pickerToggle));
    const actions = document.createElement("div");
    actions.className = "lz-sidebar__actions";
    actions.appendChild(pickerToggle);
    if (options.onHide) {
      const hide = document.createElement("button");
      hide.type = "button";
      hide.className = "lz-sidebar__hide";
      hide.textContent = "⟩";
      hide.title = __("Hide the tools");
      hide.setAttribute("aria-label", __("Hide the tools"));
      hide.addEventListener("click", () => options.onHide?.());
      actions.appendChild(hide);
    }
    header.append(label, actions);
    const stack = document.createElement("div");
    stack.className = "lz-panels";
    root.append(header, stack);
    return { stack, pickerToggle };
  }
  const STORAGE_KEY = "lienzo.panels.v1";
  function readState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function writeState(state2) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state2));
    } catch {
    }
  }
  function createToolPicker(options) {
    const menu = document.createElement("div");
    menu.className = "lz-picker-menu";
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", __("Tools"));
    for (const def of listPanels()) {
      const row = createCheckbox({
        label: def.title,
        checked: options.isVisible(def),
        onChange: (checked) => options.onToggle(def, checked)
      });
      row.el.classList.add("lz-picker-menu__item");
      menu.appendChild(row.el);
    }
    return menu;
  }
  class PanelHost {
    /**
     * @param root   Sidebar element to fill.
     * @param ctx    Context handed to every panel.
     * @param onHide Optional. Called when the user closes the sidebar.
     */
    constructor(root, ctx, onHide) {
      this.teardowns = [];
      this.picker = null;
      this.root = root;
      this.ctx = ctx;
      this.state = readState();
      this.stack = buildSidebarChrome({
        root,
        onPicker: (toggle) => this.togglePicker(toggle),
        ...onHide ? { onHide } : {}
      }).stack;
      this.render();
      this.unsubscribe = onPanelsChanged(() => this.render());
    }
    /**
     * Opens or closes the tool picker.
     *
     * @param toggle The button that owns it.
     */
    togglePicker(toggle) {
      if (this.picker) {
        this.picker.remove();
        this.picker = null;
        toggle.setAttribute("aria-expanded", "false");
        return;
      }
      const menu = createToolPicker({
        isVisible: (def) => this.isVisible(def),
        onToggle: (def, visible) => {
          this.setPanelState(def.id, { hidden: !visible });
          this.render();
        }
      });
      toggle.setAttribute("aria-expanded", "true");
      toggle.after(menu);
      this.picker = menu;
    }
    /**
     * Whether a panel should be on screen.
     *
     * @param def Panel definition.
     */
    isVisible(def) {
      const stored = this.state[def.id]?.hidden;
      if (stored !== void 0) {
        return !stored;
      }
      return false !== def.defaultVisible;
    }
    /**
     * Whether a panel should render collapsed.
     *
     * @param def Panel definition.
     */
    isCollapsed(def) {
      const stored = this.state[def.id]?.collapsed;
      return stored !== void 0 ? stored : true === def.defaultCollapsed;
    }
    /**
     * Merges and persists state for one panel.
     *
     * @param id    Panel id.
     * @param patch Fields to change.
     */
    setPanelState(id, patch) {
      this.state = { ...this.state, [id]: { ...this.state[id], ...patch } };
      writeState(this.state);
    }
    /** Rebuilds every visible panel. */
    render() {
      this.releasePanels();
      this.stack.replaceChildren();
      for (const def of listPanels()) {
        if (!this.isVisible(def)) {
          continue;
        }
        const section = createPanelSection({
          def,
          ctx: this.ctx,
          collapsed: this.isCollapsed(def),
          onToggle: (collapsed) => this.setPanelState(def.id, { collapsed })
        });
        if (section.teardown) {
          this.teardowns.push(section.teardown);
        }
        this.stack.appendChild(section.el);
      }
    }
    /** Runs every panel teardown. */
    releasePanels() {
      for (const teardown of this.teardowns) {
        teardown();
      }
      this.teardowns = [];
    }
    /** Releases everything the host owns. */
    destroy() {
      this.unsubscribe();
      this.releasePanels();
      this.picker = null;
      this.root.replaceChildren();
    }
  }
  const WINDOW_ID = "lienzo";
  function shellApi() {
    const wp = window.wp;
    return wp?.os ?? wp?.desktop;
  }
  function desktop() {
    const api = shellApi();
    return api?.isActive?.() ? api : void 0;
  }
  function takePending() {
    const shared = state();
    const id = shared.pending;
    shared.pending = 0;
    return id;
  }
  function takePendingOrigin() {
    const shared = state();
    const origin = shared.pendingOrigin;
    shared.pendingOrigin = null;
    return origin;
  }
  function state() {
    const holder = window;
    holder.__lienzoDesktop ?? (holder.__lienzoDesktop = {
      openers: /* @__PURE__ */ new Set(),
      pending: 0,
      pendingOrigin: null,
      previewUrl: "",
      previewTitle: "",
      peekRegistered: false,
      listenerRegistered: false,
      iconDropRegistered: false
    });
    return holder.__lienzoDesktop;
  }
  function readConfig() {
    const config = window.lienzoConfig;
    if (!config) {
      throw new Error(
        "AllTerrain Photo Editor configuration is missing. The editor script was loaded without lienzo_enqueue_editor()."
      );
    }
    return config;
  }
  const OPEN_MESSAGE = "lienzo-open";
  const OPEN_ACK = "lienzo-open-ack";
  const ACK_TIMEOUT_MS = 600;
  function openInDesktop(attachmentId, origin = null, onUnanswered) {
    const id = Number(attachmentId) || 0;
    if (!id) {
      return false;
    }
    return openDesktopWindow(id, origin, onUnanswered);
  }
  function openDesktopWindow(attachmentId = 0, origin = null, onUnanswered) {
    const id = Number(attachmentId) || 0;
    if (desktop()?.openWindow) {
      if (!id) {
        desktop()?.openWindow?.(WINDOW_ID, { source: "lienzo" });
        return true;
      }
      const live = [...state().openers].pop();
      if (live) {
        live(id, origin);
      } else {
        state().pending = id;
        state().pendingOrigin = origin;
      }
      desktop()?.openWindow?.(WINDOW_ID, { source: "lienzo" });
      return true;
    }
    if (isDesktopModeEnabled() && window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: OPEN_MESSAGE, attachmentId: id },
        window.location.origin
      );
      if (onUnanswered) {
        waitForAck(onUnanswered);
      }
      return true;
    }
    return false;
  }
  function waitForAck(onUnanswered) {
    const stop = () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === OPEN_ACK) {
        stop();
      }
    };
    const timer = window.setTimeout(() => {
      stop();
      onUnanswered();
    }, ACK_TIMEOUT_MS);
    window.addEventListener("message", onMessage);
  }
  function isShellPage() {
    return void 0 !== desktop()?.openWindow || isDesktopModeEnabled();
  }
  function listenForOpenRequests() {
    if (state().listenerRegistered) {
      return;
    }
    state().listenerRegistered = true;
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data;
      if (!data || data.type !== OPEN_MESSAGE) {
        return;
      }
      const opened = openDesktopWindow(Number(data.attachmentId) || 0);
      if (opened) {
        acknowledge(event);
      }
    });
  }
  function acknowledge(event) {
    const source = event.source;
    source?.postMessage?.({ type: OPEN_ACK }, event.origin);
  }
  async function openPostInDesktop(postId) {
    const id = Number(postId) || 0;
    if (!id) {
      return false;
    }
    try {
      const image = await new RestClient(readConfig()).getPostImage(id);
      return openInDesktop(image.attachmentId, {
        postId: image.postId,
        postTitle: image.postTitle,
        postType: image.postType,
        postTypeLabel: image.postTypeLabel,
        slot: image.slot,
        canAttach: image.canAttach
      });
    } catch (error) {
      toast(
        error instanceof Error ? error.message : __("That post has no image AllTerrain Photo Editor can open."),
        "error"
      );
      return false;
    }
  }
  function registerFileOpener() {
    const files = desktop()?.files;
    if (!files?.registerOpener) {
      return;
    }
    files.registerOpener({
      id: "lienzo",
      label: __("Edit in AllTerrain Photo Editor"),
      types: ["attachment"],
      isDefault: false,
      sort: 15,
      handler: {
        kind: "js",
        open: (file) => openInDesktop(Number(file.ref()) || 0)
      }
    });
  }
  const ACCEPTED = ["attachment", "shortcut"];
  function isLienzoIcon(ctx) {
    return WINDOW_ID === ctx.placement?.file?.ref;
  }
  function attachmentFrom(data) {
    const kind = String(data.kind ?? "");
    if ("" !== kind && "attachment" !== kind && "media" !== kind) {
      return 0;
    }
    return Number(data.ref ?? data.id ?? data.mediaId ?? 0) || 0;
  }
  function postFrom(data) {
    if ("post" !== String(data.kind ?? "")) {
      return 0;
    }
    return Number(data.ref ?? data.id ?? 0) || 0;
  }
  function openDropped(data) {
    const attachment = attachmentFrom(data);
    if (attachment) {
      openInDesktop(attachment);
      return;
    }
    const post = postFrom(data);
    if (post) {
      void openPostInDesktop(post);
    }
  }
  function registerIconDrop() {
    const files = desktop()?.files;
    const shared = state();
    if (!files?.registerTilePayloadHandler || shared.iconDropRegistered) {
      return;
    }
    shared.iconDropRegistered = true;
    const handler = {
      appliesTo: isLienzoIcon,
      accept: (data) => !!(attachmentFrom(data) || postFrom(data)),
      acceptLabel: __("Open in AllTerrain Photo Editor"),
      onDrop: (session) => openDropped(session.payload.data ?? {})
    };
    for (const type of ACCEPTED) {
      files.registerTilePayloadHandler(type, handler);
    }
  }
  const MEDIA_FIELDS = "id,mime_type,title,source_url,media_details";
  const PAGE_SIZE = 60;
  const MAX_LOOKAHEAD = 5;
  class MediaPager {
    /**
     * @param config Runtime configuration.
     */
    constructor(config) {
      this.page = 0;
      this.pages = null;
      this.seen = 0;
      this.passed = 0;
      this.config = config;
    }
    /** Whether the server has pages the picker has not asked for yet. */
    get hasMore() {
      return null === this.pages || this.page < this.pages;
    }
    /** How many editable images have been handed out so far. */
    get count() {
      return this.seen;
    }
    /**
     * How many images were read and passed over, of the pages fetched so far.
     *
     * Of the pages *fetched*, not of the library: with pages left this is a running
     * total and not a final one, which is why the picker phrases it as what it is
     * passing over rather than as what the library contains.
     */
    get skipped() {
      return this.passed;
    }
    /**
     * Fetches the next page or pages, until something editable turns up.
     *
     * @return Editable items, which is empty only when the library ran out or the
     *         lookahead cap was reached.
     * @throws {Error} When the library could not be read.
     */
    async next() {
      for (let look = 0; look < MAX_LOOKAHEAD && this.hasMore; look++) {
        const editable = await this.fetchPage(this.page + 1);
        this.page++;
        if (editable.length > 0) {
          this.seen += editable.length;
          return editable;
        }
      }
      return [];
    }
    /**
     * Fetches one page and keeps only what AllTerrain Photo Editor can open.
     *
     * @param page Page number, one-based.
     * @throws {Error} When the library could not be read.
     */
    async fetchPage(page) {
      const url = new URL(this.config.mediaUrl);
      url.searchParams.set("media_type", "image");
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));
      url.searchParams.set("orderby", "date");
      url.searchParams.set("order", "desc");
      url.searchParams.set("_fields", MEDIA_FIELDS);
      const response = await request(url.toString(), {
        credentials: "same-origin",
        headers: { "X-WP-Nonce": this.config.restNonce }
      });
      if (!response.ok) {
        throw new Error(__("Your media library could not be loaded."));
      }
      const total = Number(response.headers.get("X-WP-TotalPages"));
      if (Number.isFinite(total) && total > 0) {
        this.pages = total;
      }
      const items = await response.json();
      const editable = items.filter(
        (item) => this.config.supportedMimes.includes(item.mime_type)
      );
      this.passed += items.length - editable.length;
      return editable;
    }
  }
  function thumbnailFor(item) {
    const sizes = item.media_details?.sizes ?? {};
    for (const name of ["thumbnail", "medium", "medium_large", "large"]) {
      const url = sizes[name]?.source_url;
      if (url) {
        return url;
      }
    }
    return item.source_url ?? "";
  }
  function renderTile(item, onPick) {
    const title = item.title?.rendered?.replace(/<[^>]*>/g, "") || __("Untitled image");
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "lz-picker__tile";
    tile.setAttribute("role", "listitem");
    const image = document.createElement("img");
    image.className = "lz-picker__thumb";
    image.src = thumbnailFor(item);
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    const caption = document.createElement("span");
    caption.className = "lz-picker__caption";
    caption.textContent = title;
    const { width, height } = item.media_details ?? {};
    tile.title = width && height ? sprintf("%s — %d × %d", title, width, height) : title;
    tile.addEventListener("click", () => onPick?.(item.id));
    tile.append(image, caption);
    return tile;
  }
  const PICKER_CLASS = "lz-picker";
  async function renderPicker(root, config, onPick, isStale) {
    if (isStale?.()) {
      return;
    }
    const pager = new MediaPager(config);
    const ui = buildChrome(root);
    const more = hasObserver() ? null : createButton({
      label: __("Load more"),
      variant: "secondary",
      onClick: () => void load()
    });
    ui.footer.append(ui.count);
    if (more) {
      ui.footer.appendChild(more.el);
    }
    let loading = false;
    let unwatch = () => {
    };
    async function load() {
      if (loading || isStale?.()) {
        return;
      }
      loading = true;
      more?.setDisabled(true);
      let items;
      try {
        items = await pager.next();
      } catch (error) {
        loading = false;
        if (!isStale?.()) {
          fail$1(ui, error);
          more?.setDisabled(false);
        }
        return;
      }
      loading = false;
      if (isStale?.()) {
        unwatch();
        return;
      }
      for (const item of items) {
        ui.grid.appendChild(renderTile(item, onPick));
      }
      if (0 === pager.count && !pager.hasMore) {
        unwatch();
        showEmpty(ui, pager.skipped);
        return;
      }
      ui.status.remove();
      root.append(ui.grid, ui.footer);
      ui.count.textContent = countLabel(
        pager.count,
        pager.skipped,
        pager.hasMore
      );
      if (pager.hasMore) {
        more?.setDisabled(false);
        watch();
        return;
      }
      unwatch();
      more?.destroy();
      more?.el.remove();
    }
    function watch() {
      if (!hasObserver()) {
        return;
      }
      unwatch();
      const observer = new IntersectionObserver((entries) => {
        if (isStale?.() || !ui.footer.isConnected || !pager.hasMore) {
          observer.disconnect();
          return;
        }
        if (entries.some((entry) => entry.isIntersecting)) {
          void load();
        }
      });
      unwatch = () => {
        observer.disconnect();
        unwatch = () => {
        };
      };
      observer.observe(ui.footer);
    }
    await load();
  }
  function hasObserver() {
    return "undefined" !== typeof IntersectionObserver;
  }
  function buildChrome(root) {
    root.classList.add(PICKER_CLASS);
    const heading = document.createElement("h2");
    heading.className = "lz-picker__heading";
    heading.textContent = __("Choose a photo to edit");
    const status = document.createElement("p");
    status.className = "lz-picker__status";
    status.textContent = __("Loading your photos…");
    const grid = document.createElement("div");
    grid.className = "lz-picker__grid";
    grid.setAttribute("role", "list");
    const footer = document.createElement("div");
    footer.className = "lz-picker__footer";
    const count = document.createElement("p");
    count.className = "lz-picker__count";
    count.setAttribute("aria-live", "polite");
    root.replaceChildren(heading, status);
    return { root, grid, footer, status, count };
  }
  function countLabel(shown, skipped, hasMore) {
    let label = __("No photos to show yet.");
    if (shown > 0) {
      label = hasMore ? sprintf(
        /* translators: %d: number of photos shown so far. */
        __("Showing the %d most recent photos."),
        shown
      ) : sprintf(
        /* translators: %d: total number of photos. */
        __("Showing all %d photos."),
        shown
      );
    }
    if (skipped < 1) {
      return label;
    }
    return `${label} ${sprintf(
      /* translators: %d: number of images that cannot be edited. */
      _n(
        "Passing over %d image AllTerrain Photo Editor cannot open.",
        "Passing over %d images AllTerrain Photo Editor cannot open.",
        skipped
      ),
      skipped
    )}`;
  }
  function fail$1(ui, error) {
    ui.status.textContent = error instanceof Error ? error.message : __("Your media library could not be loaded.");
    ui.status.classList.add("lz-picker__status--error");
    if (!ui.status.isConnected) {
      ui.root.appendChild(ui.status);
    }
  }
  function showEmpty(ui, skipped) {
    ui.status.textContent = skipped > 0 ? sprintf(
      /* translators: %d: number of images that cannot be edited. */
      _n(
        "Your library has %d image, and it is not one AllTerrain Photo Editor can open. AllTerrain Photo Editor edits JPEG, PNG, WebP and AVIF; an animated GIF is left alone because a canvas would flatten it to a single frame.",
        "Your library has %d images, and none of them are ones AllTerrain Photo Editor can open. AllTerrain Photo Editor edits JPEG, PNG, WebP and AVIF; animated GIFs are left alone because a canvas would flatten them to a single frame.",
        skipped
      ),
      skipped
    ) : __(
      "No editable images yet. Upload a JPEG, PNG, WebP or AVIF to get started."
    );
    const link = document.createElement("a");
    link.className = "button button-primary";
    link.href = "media-new.php";
    link.textContent = __("Upload a photo");
    ui.root.appendChild(link);
  }
  function readBridgeImage(record) {
    if (!record || typeof record !== "object") {
      return null;
    }
    const data = record;
    const kind = data.kind;
    if (kind !== "attachment" && kind !== "media" && kind !== "upload") {
      return null;
    }
    const mime = data.mime;
    if (typeof mime === "string" && mime && (!mime.startsWith("image/") || window.lienzoConfig && !window.lienzoConfig.supportedMimes.includes(mime))) {
      return null;
    }
    if (kind === "upload" && (typeof mime !== "string" || !mime)) {
      return null;
    }
    const id = Number(kind === "upload" ? data.fileId ?? data.ref : data.id ?? data.ref ?? data.mediaId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return null;
    }
    return {
      kind: kind === "upload" ? "upload" : "attachment",
      id,
      ...typeof data.title === "string" ? { title: data.title } : {}
    };
  }
  function readDesktopImage(payload) {
    const data = payload.data ?? {};
    if (data.bridgePayload) {
      return readBridgeImage(data.bridgePayload);
    }
    if (payload.type === "desktop-file") {
      const placement = data.placement;
      const file = placement?.file;
      return file ? readBridgeImage({ ...file, kind: file.type }) : null;
    }
    if (payload.type === "shortcut" || payload.type === "attachment") {
      return readBridgeImage({ ...data, kind: data.kind ?? payload.type });
    }
    return null;
  }
  const targetPrefix = `lienzo-window-${Math.random().toString(36).slice(2)}`;
  let nextTarget = 0;
  function registerDropTarget(element, drop) {
    const manager = desktop()?.dragManager;
    if (!manager?.registerDropTarget) {
      return null;
    }
    let disposed = false;
    const release = manager.registerDropTarget({
      id: `${targetPrefix}-${++nextTarget}`,
      element,
      accept: (payload) => {
        const image = readDesktopImage(payload);
        return !!image && (image.kind === "attachment" || !!desktop()?.files?.rest?.addUploadToMediaLibrary);
      },
      acceptLabel: __("Add as a layer"),
      onDrop: async (session, at) => {
        const image = readDesktopImage(session.payload);
        if (!image || disposed) {
          return;
        }
        try {
          let attachmentId = image.id;
          let title = image.title;
          if (image.kind === "upload") {
            const rest = desktop()?.files?.rest;
            if (!rest?.addUploadToMediaLibrary) {
              return;
            }
            const attachment = await rest.addUploadToMediaLibrary(image.id);
            attachmentId = attachment.attachmentId;
            title = attachment.title || title;
          }
          if (!disposed) {
            drop({ attachmentId, title, clientX: at?.clientX, clientY: at?.clientY });
          }
        } catch (error) {
          if (!disposed) {
            toast(error instanceof Error ? error.message : __("That image could not be added."), "error");
          }
        }
      }
    });
    return () => {
      disposed = true;
      release();
    };
  }
  const ATTACHMENT_TYPE = "application/x-lienzo-attachment";
  const CANDIDATES = [
    // Grid mode and the media modal.
    ".attachment[data-id]",
    "[data-id]",
    // List mode rows.
    'tr[id^="post-"]'
  ];
  function attachmentIdFor(start) {
    if (!start) {
      return 0;
    }
    for (const selector of CANDIDATES) {
      const match = start.closest(selector);
      if (!match) {
        continue;
      }
      const raw = match.getAttribute("data-id") ?? /post-(\d+)/.exec(match.id)?.[1] ?? "";
      const id = Number(raw);
      if (id > 0) {
        return id;
      }
    }
    return 0;
  }
  function bootMediaDrag() {
    document.addEventListener(
      "dragstart",
      (event) => {
        const transfer = event.dataTransfer;
        if (!transfer || !(event.target instanceof Element)) {
          return;
        }
        const id = attachmentIdFor(event.target);
        if (!id) {
          return;
        }
        try {
          transfer.setData(ATTACHMENT_TYPE, String(id));
        } catch {
        }
      },
      true
    );
  }
  const IMAGE_URL = /\.(?:jpe?g|png|gif|webp|avif|bmp)(?:\?|#|$)/i;
  function readDroppedImage(transfer) {
    if (!transfer) {
      return null;
    }
    const file = Array.from(transfer.files).find(
      (entry) => entry.type.startsWith("image/")
    );
    if (file) {
      return { file };
    }
    const tagged = Number(transfer.getData(ATTACHMENT_TYPE));
    if (Number.isSafeInteger(tagged) && tagged > 0) {
      return { attachmentId: tagged };
    }
    const record = readMediaRecord(transfer);
    if (record) {
      return record;
    }
    const html = transfer.getData("text/html");
    const id = /wp-image-(\d+)/.exec(html)?.[1] ?? /data-id=["']?(\d+)/.exec(html)?.[1];
    if (id) {
      return { attachmentId: Number(id) };
    }
    const list = transfer.getData("text/uri-list") || transfer.getData("text/plain");
    const url = list.split(/[\r\n]+/).map((line) => line.trim()).find((line) => line && !line.startsWith("#") && (IMAGE_URL.test(line) || /^data:image\//i.test(line) || /^blob:/i.test(line)));
    if (url) {
      return { url };
    }
    const src = html ? new DOMParser().parseFromString(html, "text/html").querySelector("img[src]")?.getAttribute("src") : null;
    return src ? { url: src } : null;
  }
  const WP_MEDIA_TYPE = "application/x-wp-media-attachment";
  function readMediaRecord(transfer) {
    const raw = transfer.getData(WP_MEDIA_TYPE);
    if (!raw) {
      return null;
    }
    try {
      const record = JSON.parse(raw);
      if (record.mime && !record.mime.startsWith("image/")) {
        return null;
      }
      if (Number(record.id) > 0) {
        return { attachmentId: Number(record.id), title: record.title };
      }
      return record.url ? { url: record.url, title: record.title } : null;
    } catch {
      return null;
    }
  }
  function attachFileDrop(element, drop) {
    const doc = element.ownerDocument;
    const bridgeImage = () => {
      const image = readBridgeImage(desktop()?.dragBridge?.getPayload?.());
      return image?.kind === "attachment" ? image : null;
    };
    const looksLikeImage = (event) => {
      const types = Array.from(event.dataTransfer?.types ?? []);
      return !!bridgeImage() || types.includes(ATTACHMENT_TYPE) || types.includes(WP_MEDIA_TYPE) || types.includes("Files") || types.includes("text/uri-list") || types.includes("text/html") || types.includes("text/plain");
    };
    const inside = (event) => {
      const box = element.getBoundingClientRect();
      const hit = doc.elementFromPoint(event.clientX, event.clientY);
      return element.isConnected && !!hit && element.contains(hit) && box.width > 0 && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    };
    const onOver = (event) => {
      if (!looksLikeImage(event) || !inside(event)) {
        element.classList.remove("is-drop-target");
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      element.classList.add("is-drop-target");
    };
    const onLeave = (event) => {
      if (inside(event)) {
        return;
      }
      element.classList.remove("is-drop-target");
    };
    const onDrop = (event) => {
      element.classList.remove("is-drop-target");
      if (!looksLikeImage(event) || !inside(event)) {
        return;
      }
      const bridge = bridgeImage();
      const dropped = bridge ? { attachmentId: bridge.id, title: bridge.title } : readDroppedImage(event.dataTransfer);
      event.preventDefault();
      event.stopPropagation();
      if (!dropped) {
        toast(
          sprintf(
            __("That drag carried no image AllTerrain Photo Editor could read (%s)."),
            Array.from(event.dataTransfer?.types ?? []).join(", ") || __("no data")
          ),
          "info"
        );
        return;
      }
      drop({ ...dropped, clientX: event.clientX, clientY: event.clientY });
    };
    doc.addEventListener("dragover", onOver, true);
    doc.addEventListener("dragleave", onLeave, true);
    doc.addEventListener("drop", onDrop, true);
    doc.addEventListener("dragend", clearHighlight, true);
    function clearHighlight() {
      element.classList.remove("is-drop-target");
    }
    return () => {
      doc.removeEventListener("dragover", onOver, true);
      doc.removeEventListener("dragleave", onLeave, true);
      doc.removeEventListener("drop", onDrop, true);
      doc.removeEventListener("dragend", clearHighlight, true);
      clearHighlight();
    };
  }
  function attachDragOut(root, result) {
    const bridge = desktop()?.dragBridge;
    if (!bridge?.start) {
      return;
    }
    const banner = root.querySelector(".lz-saved a");
    if (!banner) {
      return;
    }
    banner.draggable = true;
    banner.title = __("Drag into another window to insert it");
    banner.addEventListener("dragstart", () => {
      bridge.start?.({
        kind: "attachment",
        id: result.id,
        url: result.url,
        title: __("Edited image"),
        alt: "",
        mime: result.mime,
        thumbnailUrl: result.url
      });
    });
    banner.addEventListener("dragend", () => bridge.end?.());
  }
  function registerNativeWindow() {
    const render2 = (body, ctx) => renderWindow(body, ctx);
    for (const key of [
      "openStationNativeWindows",
      "desktopModeNativeWindows"
    ]) {
      const holder = window;
      holder[key] ?? (holder[key] = {});
      holder[key][WINDOW_ID] = render2;
    }
  }
  function renderWindow(body, ctx) {
    const root = body.querySelector("[data-lienzo-root]") ?? body;
    const config = window.lienzoConfig;
    let editor = null;
    let releaseDrop = null;
    let session = 0;
    const open2 = (attachmentId2, origin = null) => {
      session++;
      editor?.destroy();
      root.replaceChildren();
      ctx?.markLoading?.();
      editor = mount(root, {
        attachmentId: attachmentId2,
        host: "window",
        ...origin ? { origin } : {},
        onSave: (result) => {
          attachDragOut(root, result);
          state().previewUrl = result.url;
        },
        onReady: (payload) => {
          state().previewUrl = payload?.url ?? "";
          state().previewTitle = payload?.title ?? "";
          ctx?.markReady?.();
        }
      });
    };
    state().openers.add(open2);
    const attachmentId = takePending();
    const pendingOrigin = takePendingOrigin();
    if (attachmentId) {
      open2(attachmentId, pendingOrigin);
    } else if (config) {
      const mine = session;
      void renderPicker(
        root,
        config,
        (id) => open2(id),
        () => session !== mine
      );
    }
    const drop = (dropped) => {
      if (editor) {
        void editor.addImageLayer(dropped);
      } else if (dropped.attachmentId) {
        open2(dropped.attachmentId);
      }
    };
    try {
      releaseDrop = registerDropTarget(root, drop);
    } catch (error) {
      console.warn("[lienzo] drag-and-drop unavailable:", error);
    }
    const releaseFiles = attachFileDrop(root, drop);
    return () => {
      releaseFiles();
      state().openers.delete(open2);
      state().previewUrl = "";
      state().previewTitle = "";
      releaseDrop?.();
      editor?.destroy();
    };
  }
  registerNativeWindow();
  function registerPeekThumbnail() {
    const hooks = window.wp?.hooks;
    if (!hooks?.addFilter || state().peekRegistered) {
      return;
    }
    state().peekRegistered = true;
    hooks.addFilter(
      "desktop-mode.dock.peek-card-content",
      "lienzo/thumbnail",
      (body, context) => {
        const win = context?.window;
        const shared = state();
        if (!win?.id?.startsWith(WINDOW_ID) || !shared.previewUrl) {
          return body;
        }
        const image = document.createElement("img");
        image.className = "lz-peek-thumb";
        image.src = shared.previewUrl;
        image.alt = shared.previewTitle;
        image.loading = "lazy";
        image.decoding = "async";
        return image;
      }
    );
  }
  const SHELL_WAIT_MS = 4e3;
  const SHELL_POLL_MS = 100;
  function bootDesktopMode() {
    listenForOpenRequests();
    whenShellReady(registerShellIntegrations);
  }
  function registerShellIntegrations() {
    registerPeekThumbnail();
    try {
      registerFileOpener();
    } catch (error) {
      console.warn("[lienzo] file opener unavailable:", error);
    }
    try {
      registerIconDrop();
    } catch (error) {
      console.warn("[lienzo] icon drop unavailable:", error);
    }
  }
  function whenShellReady(run) {
    if (desktop()) {
      run();
      return;
    }
    const ready = shellApi()?.whenReady;
    if (ready) {
      ready(() => {
        if (desktop()) {
          run();
        }
      });
      return;
    }
    let waited = 0;
    const timer = window.setInterval(() => {
      waited += SHELL_POLL_MS;
      if (desktop()) {
        window.clearInterval(timer);
        run();
        return;
      }
      if (waited >= SHELL_WAIT_MS) {
        window.clearInterval(timer);
      }
    }, SHELL_POLL_MS);
  }
  function announceSave(host, result, onOpen) {
    host.querySelector(".lz-saved")?.remove();
    const banner = document.createElement("p");
    banner.className = "lz-saved";
    const open2 = createButton({
      label: __("Open the saved copy"),
      variant: "secondary",
      onClick: onOpen
    });
    banner.append(
      document.createTextNode(
        result.flattened ? __(
          "Saved a copy. Its painted layers were too large to keep, so they were baked in; re-opening shows those pixels rather than the layers. "
        ) : __("Saved a copy. Open it again and every layer is still there to edit. ")
      ),
      open2.el
    );
    host.prepend(banner);
    return () => {
      open2.destroy();
      banner.remove();
    };
  }
  function askSaveChoice(root, origin) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "lz-choice";
      const dialog = document.createElement("div");
      dialog.className = "lz-choice__dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "lz-choice-title");
      const title = document.createElement("h2");
      title.className = "lz-choice__title";
      title.id = "lz-choice-title";
      title.textContent = sprintf(
        /* translators: %s: post title. */
        __("Save your edit of “%s”"),
        origin.postTitle
      );
      const body = document.createElement("p");
      body.className = "lz-choice__body";
      body.textContent = sprintf(
        /* translators: %s: singular post type label, e.g. "product". */
        __(
          "Either way the original image stays in your library untouched — this saves a new copy. The only question is whether the %s should start using it."
        ),
        origin.postTypeLabel.toLowerCase()
      );
      const actions = document.createElement("div");
      actions.className = "lz-choice__actions";
      const handles = [];
      const finish = (choice) => {
        document.removeEventListener("keydown", onKey);
        for (const handle of handles) {
          handle.destroy();
        }
        overlay.remove();
        resolve(choice);
      };
      const onKey = (event) => {
        if ("Escape" === event.key) {
          event.preventDefault();
          finish("cancel");
        }
      };
      const attach = createButton({
        label: sprintf(
          /* translators: %s: singular post type label, e.g. "Product". */
          __("Update the %s"),
          origin.postTypeLabel.toLowerCase()
        ),
        title: sprintf(
          /* translators: %s: singular post type label. */
          __("Save a copy and point the %s at it."),
          origin.postTypeLabel.toLowerCase()
        ),
        variant: "primary",
        onClick: () => finish("attach")
      });
      const copy = createButton({
        label: __("Just save a copy"),
        title: __("Save a copy and leave this post as it is."),
        variant: "secondary",
        onClick: () => finish("copy")
      });
      const cancel = createButton({
        label: __("Cancel"),
        variant: "ghost",
        onClick: () => finish("cancel")
      });
      handles.push(attach, copy, cancel);
      actions.append(attach.el, copy.el, cancel.el);
      dialog.append(title, body, actions);
      overlay.appendChild(dialog);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          finish("cancel");
        }
      });
      document.addEventListener("keydown", onKey);
      root.appendChild(overlay);
      copy.el.focus?.();
    });
  }
  function undo(editor) {
    if (!editor.store.canUndo) {
      return;
    }
    editor.strokes?.restore();
    editor.store.undo("all");
  }
  function redo(editor) {
    if (!editor.store.canRedo) {
      return;
    }
    editor.store.redo("all");
    editor.strokes?.restore();
  }
  function resetAll(editor) {
    if (editor.store.reset(editor.renderer?.imageSize)) {
      toast(__("Adjustments reset."), "info");
    }
  }
  function addLayer(editor) {
    const recipe = editor.store.current;
    const layer = createRasterLayer(
      /* translators: %d: layer number. */
      sprintf(__("Layer %d"), recipe.layers.length)
    );
    const index = recipe.layers.findIndex(
      (entry) => entry.id === recipe.activeLayerId
    );
    const layers = [...recipe.layers];
    layers.splice(index + 1, 0, layer);
    editor.renderer?.paint.ensurePaintTexture(layer.id);
    editor.store.setLayers(layers, layer.id);
  }
  async function save(editor) {
    const origin = editor.options.origin;
    const choice = origin && origin.canAttach ? await askSaveChoice(editor.shell.root, origin) : "copy";
    if ("cancel" === choice) {
      return;
    }
    const result = await editor.output.save();
    if (!result) {
      return;
    }
    if ("attach" === choice && origin) {
      await attachResult(editor, origin, result.id);
    }
    editor.onTeardown(
      announceSave(editor.shell.sidebar, result, () => openInDesktop(result.id))
    );
    editor.options.onSave?.(result);
  }
  async function attachResult(editor, origin, saved) {
    try {
      await editor.client.attachToPost(
        origin.postId,
        saved,
        origin.slot || "thumbnail",
        editor.options.attachmentId
      );
      toast(
        sprintf(
          /* translators: %s: post title. */
          __("“%s” now uses the edited image."),
          origin.postTitle
        ),
        "success"
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : __("The copy was saved, but the post could not be updated."),
        "error"
      );
    }
  }
  function buildPanelContext(deps) {
    const { store } = deps;
    return {
      payload: deps.getPayload(),
      getRecipe: () => store.current,
      setOp: (type, value) => store.setOp(type, value),
      setOutput: (patch) => store.setOutput(patch),
      setSpace: (space) => store.setSpace(space),
      setLayer: (layer, label) => store.setLayerTransform(layer, label),
      setDocument: (canvas, layer, label) => store.setDocument(canvas, layer, label),
      getImageSize: deps.getImageSize,
      getActiveTool: deps.getActiveTool,
      setActiveTool: deps.setActiveTool,
      onActiveToolChange: (listener) => deps.toolListeners.add(listener),
      setCurve: (channel, points) => store.setCurve(channel, points),
      setLevels: (levels) => store.setLevels(levels),
      stage: deps.stage,
      getViewport: deps.getViewport,
      onViewportChange: deps.onViewportChange,
      onHistogram: deps.onHistogram,
      onRecipeChange: (listener) => store.subscribe((recipe) => listener(recipe)),
      listPresets: () => deps.client.getPresets(),
      savePreset: (name) => deps.client.createPreset(name, store.current),
      deletePreset: (id) => deps.client.deletePreset(id),
      applyPreset: (preset) => store.applyPreset(preset),
      getLayers: () => store.current.layers,
      getActiveLayerId: () => store.current.activeLayerId,
      setLayers: (layers, activeId) => store.setLayers(layers, activeId),
      addLayer: deps.addLayer,
      editTextLayer: deps.editTextLayer,
      getBrush: deps.getBrush,
      setBrush: deps.setBrush,
      getView: deps.getView,
      setView: deps.setView,
      onBrushChange: (listener) => deps.brushListeners.add(listener)
    };
  }
  function importTarget(editor) {
    return {
      store: editor.store,
      client: editor.client,
      renderer: editor.renderer?.paint ?? null,
      stage: editor.shell.stage,
      getViewport: () => editor.renderer?.view.viewport() ?? null,
      getTextStyle: () => {
        const brush = editor.state.getBrush();
        return {
          size: brush.fontSize,
          family: brush.fontFamily,
          colour: brush.colour,
          bold: brush.bold,
          italic: brush.italic,
          strokeWidth: "stroke" === brush.shapeStyle ? brush.strokeWidth : 0
        };
      },
      isDestroyed: () => editor.isDestroyed,
      setActiveTool: (tool) => editor.state.setTool(tool)
    };
  }
  function shortcutTarget(editor) {
    return {
      undo: () => undo(editor),
      redo: () => redo(editor),
      copy: () => editor.clipboard?.copy(),
      paste: () => editor.clipboard?.paste(),
      selectAll: () => editor.selection?.selectAll(),
      deselect: () => {
        editor.stage?.tools.clearPath();
        editor.selection?.set(null);
      },
      stepSelectionBack: () => void editor.selection?.stepBack(),
      hasSelection: () => true === editor.selection?.isActive,
      hasPendingPath: () => true === editor.stage?.tools.hasPath,
      getTool: () => editor.state.getTool(),
      getSelectionShape: () => editor.selectionShape,
      commitPath: () => true === editor.stage?.tools.commitPath(),
      closeShape: () => void editor.stage?.tools.closeShape(),
      undoAnchor: () => true === editor.stage?.tools.undoAnchor(),
      clearPath: () => editor.stage?.tools.clearPath(),
      resetView: () => editor.renderer?.view.reset()
    };
  }
  function panelContext(editor) {
    return buildPanelContext({
      store: editor.store,
      client: editor.client,
      // Only ever called once an image is loaded, so the non-null assertion is
      // carrying a real invariant rather than papering over one.
      getPayload: () => editor.payload,
      stage: editor.shell.stage,
      getImageSize: () => editor.activeLayerSize(),
      getActiveTool: () => editor.state.getTool(),
      setActiveTool: (tool) => editor.state.setTool(tool),
      getBrush: () => editor.state.getBrush(),
      setBrush: (patch) => editor.state.setBrush(patch),
      getView: () => editor.state.getView(),
      setView: (patch) => editor.state.setView(patch),
      addLayer: () => addLayer(editor),
      editTextLayer: (layerId) => void editor.editText(layerId),
      getViewport: () => editor.renderer?.view.viewport() ?? null,
      onViewportChange: (listener) => editor.renderer?.view.onChange(listener) ?? (() => {
      }),
      onHistogram: (listener) => editor.renderer?.onHistogram(listener) ?? (() => {
      }),
      toolListeners: editor.state.tools,
      brushListeners: editor.state.brushes
    });
  }
  function attachPasteboard(stage, getRenderer) {
    const onWheel = (event) => {
      const renderer = getRenderer();
      if (!renderer) {
        return;
      }
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const bounds = stage.getBoundingClientRect();
        renderer.zoomAt(
          Math.exp(-event.deltaY * 2e-3),
          event.clientX - bounds.left,
          event.clientY - bounds.top
        );
        return;
      }
      renderer.pan(-event.deltaX, -event.deltaY);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }
  function pushToRenderer(renderer, recipe, scope) {
    const all = "all" === scope;
    if (all || "ops" === scope) {
      renderer.setOps(recipe.ops, recipe.space);
    }
    if (all || "document" === scope) {
      renderer.setDocument(recipe.canvas, recipe.layers, recipe.activeLayerId);
    }
    if (all || "tone" === scope) {
      renderer.setTone(recipe.curves, recipe.levels);
    }
  }
  function retainTextures(renderer, states) {
    const reachable = /* @__PURE__ */ new Set();
    for (const state2 of states) {
      for (const layer of state2.layers) {
        reachable.add(layer.id);
      }
    }
    renderer.retainLayers(reachable);
  }
  const SELECTION_SHAPES = [
    { value: "rect", label: "Rectangle" },
    { value: "ellipse", label: "Ellipse" },
    { value: "lasso", label: "Freeform" },
    { value: "polygon", label: "Polygon" },
    { value: "magnetic", label: "Magnetic" }
  ];
  function isPlacedShape(shape) {
    return "polygon" === shape || "magnetic" === shape;
  }
  const SELECTION_MODES = [
    { value: "new", label: "New selection", glyph: "◻", title: "New selection" },
    { value: "add", label: "Add", glyph: "⊞", title: "Add to selection (Shift)" },
    {
      value: "subtract",
      label: "Subtract",
      glyph: "⊟",
      title: "Subtract from selection (Alt)"
    },
    {
      value: "intersect",
      label: "Intersect",
      glyph: "▣",
      title: "Intersect with selection (Shift+Alt)"
    }
  ];
  function effectiveMode(mode, modifiers) {
    if (modifiers.shiftKey && modifiers.altKey) {
      return "intersect";
    }
    if (modifiers.shiftKey) {
      return "add";
    }
    if (modifiers.altKey) {
      return "subtract";
    }
    return mode;
  }
  const MAX_LASSO_POINTS = 600;
  function isEmptySelection(selection) {
    if (!selection || selection.points.length < 2) {
      return true;
    }
    const bounds = selectionBounds(selection);
    return bounds.w < 2e-3 || bounds.h < 2e-3;
  }
  function selectionBounds(selection) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const contour of [selection.points, ...selection.holes ?? []]) {
      for (const point of contour) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
    if (!Number.isFinite(minX)) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  function buildSelectionMask(selection, width, height) {
    if (!selection || isEmptySelection(selection) || width < 1 || height < 1) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    const bounds = selectionBounds(selection);
    if (selection.shape === "ellipse") {
      ctx.ellipse(
        (bounds.x + bounds.w / 2) * canvas.width,
        (bounds.y + bounds.h / 2) * canvas.height,
        bounds.w / 2 * canvas.width,
        bounds.h / 2 * canvas.height,
        0,
        0,
        Math.PI * 2
      );
    } else if (selection.shape === "rect") {
      ctx.rect(
        bounds.x * canvas.width,
        bounds.y * canvas.height,
        bounds.w * canvas.width,
        bounds.h * canvas.height
      );
    } else {
      addContour(ctx, selection.points, canvas);
      for (const hole of selection.holes ?? []) {
        addContour(ctx, hole, canvas);
      }
    }
    ctx.fill("evenodd");
    return canvas;
  }
  function addContour(ctx, points, canvas) {
    points.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
  }
  function clipToSelection(region, selection, canvas, origin) {
    const mask = buildSelectionMask(selection, canvas.width, canvas.height);
    const ctx = region.getContext("2d");
    if (!mask || !ctx) {
      return false;
    }
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, -Math.round(origin.x), -Math.round(origin.y));
    ctx.restore();
    return true;
  }
  function selectionToPath(selection, width, height) {
    const at = (point) => `${point.x * width} ${point.y * height}`;
    if (selection.shape === "rect" || selection.shape === "ellipse") {
      const b = selectionBounds(selection);
      const x = b.x * width;
      const y = b.y * height;
      const w = b.w * width;
      const h = b.h * height;
      if (selection.shape === "rect") {
        return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      }
      const rx = w / 2;
      const ry = h / 2;
      return `M ${x} ${y + ry} a ${rx} ${ry} 0 1 0 ${w} 0 a ${rx} ${ry} 0 1 0 ${-w} 0 Z`;
    }
    if (selection.points.length < 2) {
      return "";
    }
    const contour = (points) => `M ${at(points[0])} ` + points.slice(1).map((point) => `L ${at(point)}`).join(" ") + " Z";
    return [selection.points, ...selection.holes ?? []].filter((points) => points.length > 1).map(contour).join(" ");
  }
  function thinPath(contour, maxPoints, width, height) {
    const stride = Math.max(1, Math.ceil(contour.length / Math.max(3, maxPoints)));
    const out = [];
    for (let i = 0; i < contour.length; i += stride) {
      out.push({
        x: contour[i].x / width,
        y: contour[i].y / height
      });
    }
    return out;
  }
  function anchorMarks(anchors, width, height, size) {
    const half = size / 2;
    return anchors.map((anchor) => {
      const x = anchor.point.x * width - half;
      const y = anchor.point.y * height - half;
      return `M ${x} ${y} h ${size} v ${size} h ${-size} Z`;
    }).join(" ");
  }
  function simplifyPath(points, tolerance) {
    if (points.length < 3 || tolerance <= 0) {
      return points;
    }
    const keep = new Uint8Array(points.length);
    const stack = [[0, points.length - 1]];
    const limit = tolerance * tolerance;
    keep[0] = 1;
    keep[points.length - 1] = 1;
    while (stack.length > 0) {
      const [first, last] = stack.pop();
      let worst = -1;
      let at = -1;
      for (let i = first + 1; i < last; i++) {
        const distance = squaredDistanceToSegment(
          points[i],
          points[first],
          points[last]
        );
        if (distance > worst) {
          worst = distance;
          at = i;
        }
      }
      if (at < 0 || worst <= limit) {
        continue;
      }
      keep[at] = 1;
      stack.push([first, at], [at, last]);
    }
    return points.filter((_, i) => 1 === keep[i]);
  }
  function squaredDistanceToSegment(point, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = dx * dx + dy * dy;
    const t = 0 === length ? 0 : Math.max(
      0,
      Math.min(
        1,
        ((point.x - from.x) * dx + (point.y - from.y) * dy) / length
      )
    );
    const ox = point.x - (from.x + t * dx);
    const oy = point.y - (from.y + t * dy);
    return ox * ox + oy * oy;
  }
  function selectionFromDrag(shape, from, to) {
    return {
      shape,
      points: [
        { x: clamp01(Math.min(from.x, to.x)), y: clamp01(Math.min(from.y, to.y)) },
        { x: clamp01(Math.max(from.x, to.x)), y: clamp01(Math.max(from.y, to.y)) }
      ]
    };
  }
  function appendPathPoint(points, point, minStep = 4e-3) {
    const last = points[points.length - 1];
    if (last && Math.abs(last.x - point.x) < minStep && Math.abs(last.y - point.y) < minStep) {
      return points;
    }
    const next = [...points, { x: clamp01(point.x), y: clamp01(point.y) }];
    return next.length > MAX_LASSO_POINTS ? next.slice(next.length - MAX_LASSO_POINTS) : next;
  }
  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }
  const MAX_HOLES = 63;
  const MIN_HOLE_AREA = 4;
  const MAX_LOOPS = 4096;
  const STEP = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1]
  ];
  function traceMask(mask, maxPoints = 400) {
    const { width, height, data } = mask;
    if (width < 1 || height < 1) {
      return { outer: [], holes: [] };
    }
    const stride = data.length >= width * height * 4 ? 4 : 1;
    const last = stride - 1;
    const filled = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * stride + last] > 127;
    const contours = walkContours(filled, width, height, mask.bounds);
    if (contours.length === 0) {
      return { outer: [], holes: [] };
    }
    const budgets = shareBudget(contours, maxPoints);
    const paths = contours.map(
      (contour, index) => thinPath(contour, budgets[index], width, height)
    );
    return { outer: paths[0], holes: paths.slice(1) };
  }
  function walkContours(filled, width, height, bounds) {
    const cols = width + 1;
    const visited = new Uint8Array(cols * (height + 1));
    const contours = [];
    const fromX = Math.max(0, bounds ? bounds.x : 0);
    const fromY = Math.max(0, bounds ? bounds.y : 0);
    const toX = Math.min(width, bounds ? bounds.x + bounds.width : width);
    const toY = Math.min(height, bounds ? bounds.y + bounds.height : height);
    const leaves = (x, y, direction) => {
      switch (direction) {
        case 0:
          return filled(x, y) && !filled(x, y - 1);
        case 1:
          return filled(x - 1, y) && !filled(x, y);
        case 2:
          return filled(x - 1, y - 1) && !filled(x - 1, y);
        default:
          return filled(x, y - 1) && !filled(x - 1, y - 1);
      }
    };
    for (let y = fromY; y <= toY && contours.length < MAX_LOOPS; y++) {
      for (let x = fromX; x <= toX && contours.length < MAX_LOOPS; x++) {
        const corner = y * cols + x;
        for (let d = 0; d < 4; d++) {
          if (visited[corner] & 1 << d || !leaves(x, y, d)) {
            continue;
          }
          contours.push(walkLoop(x, y, d, leaves, visited, cols, width, height));
        }
      }
    }
    return rank(contours);
  }
  function rank(contours) {
    if (contours.length < 2) {
      return contours;
    }
    const holes = contours.slice(1).map((contour) => ({ contour, area: contourArea(contour) })).filter((hole) => hole.area >= MIN_HOLE_AREA).sort((a, b) => b.area - a.area).slice(0, MAX_HOLES).map((hole) => hole.contour);
    return [contours[0], ...holes];
  }
  function contourArea(contour) {
    let sum = 0;
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i];
      const b = contour[(i + 1) % contour.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }
  function walkLoop(startX, startY, startD, leaves, visited, cols, width, height) {
    const points = [];
    const limit = (width + 1) * (height + 1) * 4;
    let x = startX;
    let y = startY;
    let d = startD;
    let lastD = -1;
    for (let step = 0; step < limit; step++) {
      visited[y * cols + x] |= 1 << d;
      if (d !== lastD) {
        points.push({ x, y });
        lastD = d;
      }
      x += STEP[d][0];
      y += STEP[d][1];
      let next = -1;
      for (const candidate of [(d + 1) % 4, d, (d + 3) % 4]) {
        if (leaves(x, y, candidate)) {
          next = candidate;
          break;
        }
      }
      if (next < 0) {
        break;
      }
      d = next;
      if (x === startX && y === startY && d === startD) {
        break;
      }
    }
    if (points.length > 2 && lastD === startD) {
      points.shift();
    }
    return points;
  }
  function shareBudget(contours, maxPoints) {
    const budget = Math.max(3, maxPoints);
    if (contours.length === 1) {
      return [budget];
    }
    const outer = Math.max(4, Math.round(budget / 2));
    const holes = contours.slice(1);
    const total = holes.reduce((sum, hole) => sum + hole.length, 0) || 1;
    const spare = budget - outer;
    return [
      outer,
      ...holes.map(
        (hole) => Math.max(4, Math.round(spare * hole.length / total))
      )
    ];
  }
  const MAX_COMBINE_PIXELS = 4e6;
  const MAX_COMBINE_POINTS = 600;
  const OPERATIONS = {
    add: "source-over",
    subtract: "destination-out",
    intersect: "source-in"
  };
  function combineSelections(base, incoming, mode, canvas, maxPixels = MAX_COMBINE_PIXELS) {
    const from = isEmptySelection(base) ? null : base;
    const next = isEmptySelection(incoming) ? null : incoming;
    if ("new" === mode) {
      return next;
    }
    if (!from) {
      return "add" === mode ? next : null;
    }
    if (!next) {
      return from;
    }
    return traceCombined(from, next, mode, canvas, maxPixels);
  }
  function traceCombined(base, incoming, mode, canvas, maxPixels) {
    const size = workingSize(canvas, maxPixels);
    const baseMask = buildSelectionMask(base, size.width, size.height);
    const nextMask = buildSelectionMask(incoming, size.width, size.height);
    const surface = document.createElement("canvas");
    surface.width = size.width;
    surface.height = size.height;
    const ctx = surface.getContext("2d", { willReadFrequently: true });
    if (!baseMask || !nextMask || !ctx) {
      return base;
    }
    ctx.drawImage(baseMask, 0, 0);
    ctx.globalCompositeOperation = OPERATIONS[mode];
    ctx.drawImage(nextMask, 0, 0);
    const pixels = ctx.getImageData(0, 0, size.width, size.height);
    const traced = traceMask(
      { data: pixels.data, width: size.width, height: size.height },
      MAX_COMBINE_POINTS
    );
    if (traced.outer.length < 3) {
      return null;
    }
    return { shape: "lasso", points: traced.outer, holes: traced.holes };
  }
  function workingSize(canvas, maxPixels) {
    const width = Math.max(1, Math.round(canvas.width));
    const height = Math.max(1, Math.round(canvas.height));
    const ceiling = maxPixels >= 1 ? maxPixels : MAX_COMBINE_PIXELS;
    const scale = Math.sqrt(ceiling / (width * height));
    if (scale >= 1) {
      return { width, height };
    }
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }
  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  }
  function onEditorKey(type, handler) {
    const listener = (event) => {
      if (!isTypingTarget(event.target)) {
        handler(event);
      }
    };
    document.addEventListener(type, listener);
    return () => document.removeEventListener(type, listener);
  }
  function hasCommandKey(event) {
    return event.metaKey || event.ctrlKey;
  }
  function attachEditorShortcuts(target) {
    const detach = [
      onEditorKey("keydown", (event) => {
        if (hasCommandKey(event)) {
          handleCommand(event, target);
          return;
        }
        handlePlain(event, target);
      })
    ];
    return () => {
      for (const off of detach) {
        off();
      }
    };
  }
  function handleCommand(event, target) {
    const key = event.key.toLowerCase();
    if ("z" === key && !event.shiftKey) {
      event.preventDefault();
      target.undo();
    } else if ("z" === key && event.shiftKey || "y" === key) {
      event.preventDefault();
      target.redo();
    } else if ("a" === key) {
      event.preventDefault();
      target.selectAll();
    } else if ("d" === key && !event.shiftKey) {
      event.preventDefault();
      target.deselect();
    } else if ("d" === key && event.shiftKey) {
      event.preventDefault();
      target.stepSelectionBack();
    } else if ("c" === key) {
      event.preventDefault();
      target.copy();
    } else if ("v" === key) {
      event.preventDefault();
      target.paste();
    }
  }
  function handlePlain(event, target) {
    if ("Escape" === event.key && (target.hasSelection() || target.hasPendingPath())) {
      event.preventDefault();
      target.deselect();
      return;
    }
    if ("Enter" === event.key) {
      if ("path" === target.getTool()) {
        event.preventDefault();
        if (target.commitPath()) {
          target.deselect();
        }
        return;
      }
      if (isPlacedShape(target.getSelectionShape())) {
        event.preventDefault();
        target.closeShape();
      }
      return;
    }
    if (("Backspace" === event.key || "Delete" === event.key) && target.undoAnchor()) {
      event.preventDefault();
      return;
    }
    if ("0" === event.key) {
      target.resetView();
    }
  }
  const TILE_SIZE = 256;
  const MAX_TILES = 96;
  function tilesCovering(rect, width, height) {
    if (width < 1 || height < 1 || rect.width <= 0 || rect.height <= 0) {
      return [];
    }
    const left = Math.max(0, Math.floor(rect.x / TILE_SIZE));
    const top = Math.max(0, Math.floor(rect.y / TILE_SIZE));
    const right = Math.min(
      Math.ceil(width / TILE_SIZE),
      Math.ceil((rect.x + rect.width) / TILE_SIZE)
    );
    const bottom = Math.min(
      Math.ceil(height / TILE_SIZE),
      Math.ceil((rect.y + rect.height) / TILE_SIZE)
    );
    const tiles = [];
    for (let ty = top; ty < bottom; ty++) {
      for (let tx = left; tx < right; tx++) {
        tiles.push({
          x: tx * TILE_SIZE,
          y: ty * TILE_SIZE,
          // Clipped, so the last row and column do not run past the canvas.
          width: Math.min(TILE_SIZE, width - tx * TILE_SIZE),
          height: Math.min(TILE_SIZE, height - ty * TILE_SIZE)
        });
      }
    }
    return tiles;
  }
  function tileKey(rect) {
    return `${Math.floor(rect.x / TILE_SIZE)},${Math.floor(
      rect.y / TILE_SIZE
    )}`;
  }
  function dabRegion(x, y, size) {
    const radius = Math.max(1, size / 2) + 1;
    return {
      x: Math.floor(x - radius),
      y: Math.floor(y - radius),
      width: Math.ceil(radius * 2),
      height: Math.ceil(radius * 2)
    };
  }
  class TileCollector {
    /**
     * @param width  Canvas width.
     * @param height Canvas height.
     */
    constructor(width, height) {
      this.tiles = /* @__PURE__ */ new Map();
      this.overflowed = false;
      this.width = width;
      this.height = height;
    }
    /**
     * Captures whatever tiles a region touches and has not been captured yet.
     *
     * @param rect    Region about to change.
     * @param capture Reads a tile's current pixels, or returns null when it is empty.
     */
    add(rect, capture) {
      if (this.overflowed) {
        return;
      }
      for (const tile of tilesCovering(rect, this.width, this.height)) {
        const key = tileKey(tile);
        if (this.tiles.has(key)) {
          continue;
        }
        if (this.tiles.size >= MAX_TILES) {
          this.overflowed = true;
          this.tiles.clear();
          return;
        }
        this.tiles.set(key, { rect: tile, pixels: capture(tile) });
      }
    }
    /** Whether anything has been captured. */
    get size() {
      return this.tiles.size;
    }
    /**
     * The finished patch.
     *
     * @param layerId Layer the tiles belong to.
     */
    toPatch(layerId) {
      return {
        layerId,
        tiles: [...this.tiles.values()],
        complete: !this.overflowed
      };
    }
  }
  class StrokeRecorder {
    /**
     * @param store  Document store, which the finished stroke is filed against.
     * @param pixels Renderer access for reading and writing layer regions.
     */
    constructor(store, pixels) {
      this.tiles = null;
      this.layerId = "";
      this.store = store;
      this.pixels = pixels;
    }
    /**
     * Remembers a region's pixels before a paint operation overwrites them.
     *
     * @param layerId Layer about to change.
     * @param rect    Region about to change, in canvas pixels.
     */
    capture(layerId, rect) {
      const canvas = this.store.current.canvas;
      if (!this.tiles || this.layerId !== layerId) {
        this.tiles = new TileCollector(canvas.width, canvas.height);
        this.layerId = layerId;
      }
      this.tiles.add(
        rect,
        (tile) => this.pixels.extractLayerRegion(layerId, tile)
      );
    }
    /**
     * Closes the stroke in progress and files it as one undo step.
     *
     * Exactly one entry per stroke. Pushing a copy of the current recipe on its own
     * would produce an entry identical to the one below it -- so the first undo would
     * restore a state indistinguishable from the one already showing, and it would
     * take two presses before anything happened.
     *
     * @return True when a stroke was filed.
     */
    commit() {
      const collector = this.tiles;
      const layerId = this.layerId;
      this.tiles = null;
      this.layerId = "";
      if (!collector || 0 === collector.size) {
        return false;
      }
      this.store.pushStroke(collector.toPatch(layerId));
      return true;
    }
    /**
     * Swaps the pixels the current entry carries for the ones currently there.
     *
     * The entry's patch holds the tiles as they were before the stroke; putting them
     * back means the tiles as they are *now* become the way forward, so the two are
     * exchanged in place. That is what makes redo work without storing both directions
     * of every stroke -- the cost is paid only when someone actually undoes something.
     */
    restore() {
      const patch = this.store.meta;
      if (!patch || !patch.complete) {
        return;
      }
      const swapped = [];
      for (const tile of patch.tiles) {
        swapped.push({
          rect: tile.rect,
          pixels: this.pixels.extractLayerRegion(patch.layerId, tile.rect)
        });
        this.pixels.restoreLayerRegion(patch.layerId, tile.rect, tile.pixels);
      }
      this.store.setMeta({ ...patch, tiles: swapped });
    }
  }
  const GRADIENT_KINDS = [
    { value: "linear", label: "Linear" },
    { value: "radial", label: "Radial" }
  ];
  const SHAPE_KINDS = [
    { value: "rect", label: "Rectangle" },
    { value: "rounded", label: "Rounded" },
    { value: "ellipse", label: "Ellipse" },
    { value: "line", label: "Line" },
    { value: "triangle", label: "Triangle" },
    { value: "star", label: "Star" }
  ];
  function rectFromDrag(from, to) {
    return {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y)
    };
  }
  function squareDrag(from, to) {
    const size = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    return {
      x: from.x + Math.sign(to.x - from.x || 1) * size,
      y: from.y + Math.sign(to.y - from.y || 1) * size
    };
  }
  function starPoints(rect, points = 5, inner = 0.5) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const rx = rect.width / 2;
    const ry = rect.height / 2;
    const out = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = i / (points * 2) * Math.PI * 2 - Math.PI / 2;
      const scale = i % 2 === 0 ? 1 : inner;
      out.push({
        x: cx + Math.cos(angle) * rx * scale,
        y: cy + Math.sin(angle) * ry * scale
      });
    }
    return out;
  }
  function withAlpha(colour, alpha) {
    const rgb = hexToRgb(colour);
    if (!rgb) {
      return colour;
    }
    return `rgba( ${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha} )`;
  }
  function hexToRgb(colour) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
    if (!match) {
      return null;
    }
    const hex = match[1];
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16)
    ];
  }
  function rgbToHex(r, g, b) {
    const byte = (value) => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0");
    return `#${byte(r)}${byte(g)}${byte(b)}`;
  }
  function makeCanvas(width, height) {
    if (width < 1 || height < 1) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext("2d");
    return ctx ? { canvas, ctx } : null;
  }
  function shapeCanvas(width, height, from, to, options) {
    const surface = makeCanvas(width, height);
    if (!surface) {
      return null;
    }
    const { canvas, ctx } = surface;
    const rect = rectFromDrag(from, to);
    if (options.kind !== "line" && (rect.width < 1 || rect.height < 1)) {
      return null;
    }
    ctx.beginPath();
    switch (options.kind) {
      case "rect":
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        break;
      case "rounded": {
        const radius = Math.min(
          options.radius ?? 16,
          rect.width / 2,
          rect.height / 2
        );
        roundedRect(ctx, rect, radius);
        break;
      }
      case "ellipse":
        ctx.ellipse(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          rect.width / 2,
          rect.height / 2,
          0,
          0,
          Math.PI * 2
        );
        break;
      case "line":
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        break;
      case "triangle":
        ctx.moveTo(rect.x + rect.width / 2, rect.y);
        ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
        ctx.lineTo(rect.x, rect.y + rect.height);
        ctx.closePath();
        break;
      case "star":
        starPoints(rect).forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.closePath();
        break;
    }
    if (options.style === "fill" && options.kind !== "line") {
      ctx.fillStyle = options.colour;
      ctx.fill();
    } else {
      ctx.strokeStyle = options.colour;
      ctx.lineWidth = Math.max(1, options.strokeWidth);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }
    return canvas;
  }
  function roundedRect(ctx, rect, radius) {
    const r = Math.max(0, radius);
    ctx.moveTo(rect.x + r, rect.y);
    ctx.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, r);
    ctx.arcTo(
      rect.x + rect.width,
      rect.y + rect.height,
      rect.x,
      rect.y + rect.height,
      r
    );
    ctx.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, r);
    ctx.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, r);
    ctx.closePath();
  }
  function gradientCanvas(width, height, kind, from, to, start, end, fade = false) {
    const surface = makeCanvas(width, height);
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (!surface || span < 1) {
      return null;
    }
    const { canvas, ctx } = surface;
    const ramp = kind === "linear" ? ctx.createLinearGradient(from.x, from.y, to.x, to.y) : ctx.createRadialGradient(from.x, from.y, 0, from.x, from.y, span);
    ramp.addColorStop(0, start);
    ramp.addColorStop(1, fade ? withAlpha(start, 0) : end);
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }
  function textCanvas(options) {
    const text = options.text.trim();
    if (!text) {
      return null;
    }
    const font = cssFont(options);
    const measure = makeCanvas(1, 1);
    if (!measure) {
      return null;
    }
    measure.ctx.font = font;
    const lines = options.text.split("\n");
    const lineHeight = Math.ceil(options.size * 1.25);
    const pad = Math.ceil((options.strokeWidth ?? 0) + options.size * 0.35);
    const widest = Math.max(
      1,
      ...lines.map((line) => measure.ctx.measureText(line).width)
    );
    const surface = makeCanvas(
      Math.ceil(widest) + pad * 2,
      lineHeight * lines.length + pad * 2
    );
    if (!surface) {
      return null;
    }
    const { canvas, ctx } = surface;
    ctx.font = font;
    ctx.textBaseline = "top";
    ctx.fillStyle = options.colour;
    ctx.strokeStyle = options.colour;
    ctx.lineWidth = Math.max(1, options.strokeWidth ?? 1);
    ctx.lineJoin = "round";
    lines.forEach((line, index) => {
      const y = pad + index * lineHeight;
      if (options.strokeWidth) {
        ctx.strokeText(line, pad, y);
      } else {
        ctx.fillText(line, pad, y);
      }
    });
    return { canvas, offsetX: -pad, offsetY: -pad };
  }
  function cssFont(options) {
    return [
      options.italic ? "italic" : "",
      options.bold ? "700" : "400",
      `${Math.max(1, Math.round(options.size))}px`,
      options.family || "sans-serif"
    ].filter(Boolean).join(" ");
  }
  const FONT_STACKS = [
    { value: "system-ui, sans-serif", label: "System" },
    { value: "Helvetica, Arial, sans-serif", label: "Sans" },
    { value: 'Georgia, "Times New Roman", serif', label: "Serif" },
    { value: "ui-monospace, Menlo, Consolas, monospace", label: "Mono" }
  ];
  async function loadFullSize(url) {
    const full = url.replace(/-\d+x\d+(\.[a-z0-9]+)(\?|#|$)/i, "$1$2");
    if (full !== url) {
      try {
        return await loadImageUrl(full);
      } catch {
      }
    }
    return loadImageUrl(url);
  }
  function fileNameFromUrl(url) {
    try {
      const path = new URL(url, window.location.href).pathname;
      return decodeURIComponent(path.split("/").pop() ?? "").replace(
        /\.[^.]+$/,
        ""
      ) || "Image";
    } catch {
      return "Image";
    }
  }
  async function resolveDroppedImage(dropped, client) {
    if (dropped.attachmentId) {
      const payload = await client.getMedia(dropped.attachmentId);
      const loaded = await loadSourceImage(payload, client);
      return { ...loaded, title: dropped.title || payload.title };
    }
    if (dropped.file) {
      const loaded = await loadImageFile(dropped.file);
      return {
        ...loaded,
        title: dropped.title || dropped.file.name.replace(/\.[^.]+$/, "")
      };
    }
    if (dropped.url) {
      const loaded = await loadFullSize(dropped.url);
      return { ...loaded, title: dropped.title || fileNameFromUrl(dropped.url) };
    }
    return null;
  }
  function textLayerName(text) {
    const first = text.split("\n")[0].trim();
    if (!first) {
      return __("Text");
    }
    return first.length > 24 ? `${first.slice(0, 23)}…` : first;
  }
  function render(source) {
    return textCanvas({
      text: source.text,
      size: source.size,
      family: source.family,
      colour: source.colour,
      bold: source.bold,
      italic: source.italic,
      strokeWidth: source.strokeWidth
    });
  }
  function sourceFromBrush(target, text) {
    const style = target.getTextStyle();
    return {
      text,
      size: style.size,
      family: style.family,
      colour: style.colour,
      bold: style.bold,
      italic: style.italic,
      strokeWidth: style.strokeWidth
    };
  }
  function centreFor(point, rendered, scale, canvas) {
    return {
      x: (point.x + rendered.offsetX * scale.x + rendered.canvas.width * scale.x / 2) / canvas.width,
      y: (point.y + rendered.offsetY * scale.y + rendered.canvas.height * scale.y / 2) / canvas.height
    };
  }
  function textPlacement(layer, canvas) {
    if (!layer.text) {
      return null;
    }
    const rendered = render(layer.text);
    if (!rendered || canvas.width < 1) {
      return null;
    }
    const scale = { x: layer.transform.scaleX, y: layer.transform.scaleY };
    return {
      point: {
        x: layer.transform.x * canvas.width - rendered.canvas.width * scale.x / 2 - rendered.offsetX * scale.x,
        y: layer.transform.y * canvas.height - rendered.canvas.height * scale.y / 2 - rendered.offsetY * scale.y
      },
      scale
    };
  }
  function drawTextLayer(target, text, point) {
    const renderer = target.renderer;
    const source = sourceFromBrush(target, text);
    const rendered = render(source);
    if (!renderer || !rendered) {
      return false;
    }
    const recipe = target.store.current;
    const canvas = recipe.canvas;
    if (canvas.width < 1 || canvas.height < 1) {
      return false;
    }
    const layer = createTextLayer(
      textLayerName(text),
      source,
      centreFor(point, rendered, { x: 1, y: 1 }, canvas)
    );
    renderer.addRasterTexture(layer.id, rendered.canvas);
    target.store.setLayers([...recipe.layers, layer], layer.id);
    return true;
  }
  function replaceTextLayer(target, layerId, text, point) {
    const recipe = target.store.current;
    const existing = findLayer(recipe.layers, layerId);
    if (!existing || !existing.text) {
      return false;
    }
    if (!text.trim()) {
      target.store.setLayers(
        recipe.layers.filter((layer2) => layer2.id !== layerId),
        void 0,
        true,
        "text"
      );
      return true;
    }
    const renderer = target.renderer;
    const source = sourceFromBrush(target, text);
    const rendered = render(source);
    const canvas = recipe.canvas;
    if (!renderer || !rendered || canvas.width < 1 || canvas.height < 1) {
      return false;
    }
    const scale = { x: existing.transform.scaleX, y: existing.transform.scaleY };
    const layer = {
      ...createTextLayer(textLayerName(text), source, {
        ...existing.transform,
        ...centreFor(point, rendered, scale, canvas)
      }),
      visible: existing.visible,
      opacity: existing.opacity
    };
    renderer.addRasterTexture(layer.id, rendered.canvas);
    target.store.setLayers(
      replaceLayer(recipe.layers, layerId, layer),
      layer.id,
      true,
      "text"
    );
    return true;
  }
  function rasteriseTextLayer(renderer, layer) {
    if (!layer.text) {
      return false;
    }
    const rendered = render(layer.text);
    if (!rendered) {
      return false;
    }
    renderer.addRasterTexture(layer.id, rendered.canvas);
    return true;
  }
  function hitTextLayer(recipe, renderer, point) {
    const canvas = recipe.canvas;
    for (let index = recipe.layers.length - 1; index >= 0; index--) {
      const layer = recipe.layers[index];
      if ("text" !== layer.kind || !layer.visible) {
        continue;
      }
      const size = renderer.layerTextureSize(layer.id);
      if (size.width < 1) {
        continue;
      }
      const bounds = layerBounds(size, layer.transform, canvas);
      if (point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) {
        return layer;
      }
    }
    return null;
  }
  const SIZED_TOOLS = [
    "brush",
    "eraser",
    "retouch",
    "tone",
    "clone",
    "history"
  ];
  const MIN_RADIUS$1 = 2;
  class BrushCursor {
    constructor(options) {
      this.at = null;
      this.altDown = false;
      this.onMove = (event) => {
        const rect = this.options.stage.getBoundingClientRect();
        this.at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        this.draw();
      };
      this.onLeave = () => {
        this.at = null;
        this.el.style.display = "none";
        this.draw();
      };
      this.onKey = (event) => {
        if ("Alt" !== event.key) {
          return;
        }
        const down = "keydown" === event.type;
        if (down === this.altDown) {
          return;
        }
        this.altDown = down;
        this.draw();
      };
      this.onBlur = () => {
        if (!this.altDown) {
          return;
        }
        this.altDown = false;
        this.draw();
      };
      this.draw = () => {
        const tool = this.options.getTool();
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        const sampling = this.altDown && "clone" === tool;
        this.options.stage.classList.toggle("is-sampling", sampling);
        this.drawSource(tool, viewport, canvas);
        if (!this.at || !viewport || sampling || !SIZED_TOOLS.includes(tool) || canvas.width < 1 || viewport.width < 1) {
          this.el.style.display = "none";
          return;
        }
        const brush = this.options.getBrush();
        const scale = viewport.width / canvas.width;
        const size = Math.max(MIN_RADIUS$1 * 2, brush.size * scale);
        this.el.style.display = "";
        this.el.style.inlineSize = `${size}px`;
        this.el.style.blockSize = `${size}px`;
        this.el.style.insetInlineStart = `${this.at.x}px`;
        this.el.style.insetBlockStart = `${this.at.y}px`;
        this.el.dataset.shape = brush.shape;
        this.el.classList.toggle("is-soft", brush.hardness < 0.5);
      };
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "lz-brush-cursor";
      this.el.setAttribute("aria-hidden", "true");
      this.el.style.display = "none";
      this.source = document.createElement("div");
      this.source.className = "lz-clone-source";
      this.source.setAttribute("aria-hidden", "true");
      this.source.style.display = "none";
      options.stage.appendChild(this.el);
      options.stage.appendChild(this.source);
      options.stage.addEventListener("pointermove", this.onMove);
      options.stage.addEventListener("pointerleave", this.onLeave);
      window.addEventListener("keydown", this.onKey);
      window.addEventListener("keyup", this.onKey);
      window.addEventListener("blur", this.onBlur);
    }
    /**
     * Marks where the clone stamp is copying from.
     *
     * Pinned on the Alt-clicked point until the first stroke, then moving with the
     * pointer at the stroke's fixed offset -- which is where every dab after that
     * actually reads. Off the stage the pointer says nothing, so the marker falls back
     * to the picked point rather than jumping around.
     *
     * @param tool     Active tool.
     * @param viewport Where the canvas sits inside the stage, or null before layout.
     * @param canvas   Canvas size in its own pixels.
     */
    drawSource(tool, viewport, canvas) {
      const source = this.options.getCloneSource();
      if ("clone" !== tool || !source || !viewport || canvas.width < 1 || viewport.width < 1) {
        this.source.style.display = "none";
        return;
      }
      const scale = viewport.width / canvas.width;
      const offset = this.options.getCloneOffset();
      const x = offset && this.at ? this.at.x - offset.x * scale : viewport.x + source.x * scale;
      const y = offset && this.at ? this.at.y - offset.y * scale : viewport.y + source.y * scale;
      this.source.style.display = "";
      this.source.style.insetInlineStart = `${x}px`;
      this.source.style.insetBlockStart = `${y}px`;
    }
    /** Removes the cursor. */
    destroy() {
      this.options.stage.removeEventListener("pointermove", this.onMove);
      this.options.stage.removeEventListener("pointerleave", this.onLeave);
      window.removeEventListener("keydown", this.onKey);
      window.removeEventListener("keyup", this.onKey);
      window.removeEventListener("blur", this.onBlur);
      this.options.stage.classList.remove("is-sampling");
      this.el.remove();
      this.source.remove();
    }
  }
  class OptionsBuilder {
    /**
     * @param el       Element to append to.
     * @param options  Bar configuration.
     * @param rerender Rebuilds the whole bar, for a setting that changes which
     *                 controls exist at all.
     */
    constructor(el, options, rerender) {
      this.fields = [];
      this.syncers = [];
      this.el = el;
      this.options = options;
      this.rerender = rerender;
    }
    /** The shared brush settings. */
    get brush() {
      return this.options.ctx.getBrush();
    }
    /**
     * Changes a brush setting.
     *
     * @param patch    Fields to change.
     * @param rebuild  Whether the change alters which controls belong on the bar.
     */
    setBrush(patch, rebuild = false) {
      this.options.ctx.setBrush(patch);
      if (rebuild) {
        this.rerender();
      }
    }
    /** Rebuilds the bar from scratch. */
    rebuild() {
      this.rerender();
    }
    /**
     * Adds a control and remembers it for teardown.
     *
     * @param handle The control.
     * @param sync   Optional. Pushes the current setting into it.
     */
    add(handle, sync) {
      this.fields.push(handle);
      if (sync) {
        this.syncers.push(sync);
      }
      this.el.appendChild(handle.el);
    }
    /** A separator between groups of controls. */
    divider() {
      const rule = document.createElement("span");
      rule.className = "lz-options__divider";
      rule.setAttribute("aria-hidden", "true");
      this.el.appendChild(rule);
    }
    /**
     * Appends a muted hint.
     *
     * @param text Guidance text. An empty string appends nothing.
     */
    hint(text) {
      if (!text) {
        return;
      }
      const hint = document.createElement("span");
      hint.className = "lz-options__hint";
      hint.textContent = text;
      hint.title = text;
      this.el.appendChild(hint);
    }
    /** Pushes the current settings into the controls on the bar. */
    sync() {
      for (const syncer of this.syncers) {
        syncer();
      }
    }
    /** Releases every control and forgets them. */
    release() {
      for (const field of this.fields) {
        field.destroy();
      }
      this.fields = [];
      this.syncers = [];
    }
  }
  function sizeField(bar) {
    const field = createNumberField({
      compact: true,
      label: __("Size"),
      value: bar.brush.size,
      min: 1,
      max: 400,
      suffix: "px",
      onChange: (value) => bar.setBrush({ size: value })
    });
    bar.add(field, () => field.setValue(bar.brush.size));
  }
  function toleranceField(bar) {
    const field = createNumberField({
      compact: true,
      label: __("Tolerance"),
      value: bar.brush.tolerance,
      min: 0,
      max: 128,
      onChange: (value) => bar.setBrush({ tolerance: value })
    });
    bar.add(field, () => field.setValue(bar.brush.tolerance));
  }
  function percentField(bar, key, label, min) {
    const read = () => Math.round(bar.brush[key] * 100);
    const field = createNumberField({
      compact: true,
      label,
      value: read(),
      min,
      max: 100,
      suffix: "%",
      onChange: (value) => bar.setBrush({ [key]: value / 100 })
    });
    bar.add(field, () => field.setValue(read()));
  }
  function colourField(bar, label = __("Colour")) {
    const field = createColourField({
      compact: true,
      label,
      value: bar.brush.colour,
      onChange: (value) => bar.setBrush({ colour: value })
    });
    bar.add(field, () => field.setValue(bar.brush.colour));
  }
  function selectionButtons(bar) {
    bar.add(
      createButton({
        label: __("Select all"),
        variant: "secondary",
        onClick: () => bar.options.selectAll()
      })
    );
    const back = createButton({
      label: __("Step back"),
      title: __("Put the selection back as it was before the last change"),
      variant: "ghost",
      onClick: () => {
        bar.options.stepSelectionBack();
        bar.rebuild();
      }
    });
    back.setDisabled(!bar.options.canStepSelectionBack());
    bar.add(back);
    const deselect = createButton({
      label: __("Deselect"),
      variant: "ghost",
      onClick: () => {
        bar.options.deselect();
        bar.rebuild();
      }
    });
    deselect.setDisabled(!bar.options.hasSelection());
    bar.add(deselect);
  }
  function renderBrushOptions(bar, erasing) {
    const shape = createSegmented({
      label: __("Shape"),
      value: bar.brush.shape,
      options: BRUSH_SHAPES.map((entry) => ({
        value: entry.value,
        label: __(entry.label)
      })),
      onChange: (value) => bar.setBrush({ shape: value })
    });
    bar.add(shape, () => shape.setValue(bar.brush.shape));
    bar.divider();
    sizeField(bar);
    percentField(bar, "hardness", __("Hardness"), 0);
    percentField(bar, "opacity", __("Opacity"), 1);
    if (!erasing) {
      bar.divider();
      colourField(bar);
    }
  }
  function renderPixelToolOptions(bar, tool) {
    const modes = "retouch" === tool ? RETOUCH_MODES : TONE_MODES;
    bar.add(
      createSegmented({
        label: __("Mode"),
        value: bar.brush[tool],
        options: modes.map((entry) => ({
          value: entry.value,
          label: __(entry.label)
        })),
        onChange: (value) => bar.setBrush({ [tool]: value })
      })
    );
    bar.divider();
    sizeField(bar);
    percentField(bar, "strength", __("Strength"), 1);
    percentField(bar, "hardness", __("Hardness"), 0);
    bar.hint(
      "retouch" === tool && "heal" === bar.brush.retouch ? __("Dab over a blemish; it fills from the pixels around it.") : ""
    );
  }
  function renderHistoryOptions(bar) {
    sizeField(bar);
    percentField(bar, "strength", __("Strength"), 1);
    percentField(bar, "hardness", __("Hardness"), 0);
    bar.hint(
      __("Paint the original image back, wherever it has been painted over.")
    );
  }
  function renderCloneOptions(bar) {
    sizeField(bar);
    percentField(bar, "strength", __("Strength"), 1);
    percentField(bar, "hardness", __("Hardness"), 0);
    bar.divider();
    const clear = createButton({
      label: __("Clear source"),
      variant: "ghost",
      onClick: () => {
        bar.options.clearCloneSource();
        bar.rebuild();
      }
    });
    clear.setDisabled(!bar.options.hasCloneSource());
    bar.add(clear);
    bar.hint(
      bar.options.hasCloneSource() ? __("Drag to paint from the sample point. Alt-click to move it.") : __("Alt-click to set the point you want to copy from.")
    );
  }
  function renderFillOptions(bar) {
    toleranceField(bar);
    percentField(bar, "opacity", __("Opacity"), 1);
    bar.divider();
    colourField(bar);
  }
  function styleToggle(bar) {
    bar.add(
      createSegmented({
        label: __("Style"),
        value: bar.brush.shapeStyle,
        options: [
          { value: "fill", label: __("Fill") },
          { value: "stroke", label: __("Outline") }
        ],
        onChange: (value) => bar.setBrush({ shapeStyle: value }, true)
      })
    );
  }
  function widthField(bar) {
    bar.add(
      createNumberField({
        compact: true,
        label: __("Width"),
        value: bar.brush.strokeWidth,
        min: 1,
        max: 200,
        suffix: "px",
        onChange: (value) => bar.setBrush({ strokeWidth: value })
      })
    );
  }
  function renderPathOptions(bar) {
    styleToggle(bar);
    if ("stroke" === bar.brush.shapeStyle) {
      widthField(bar);
    }
    bar.divider();
    colourField(bar);
    percentField(bar, "opacity", __("Opacity"), 1);
    bar.hint(__("Click to place points, Enter to close and draw it."));
  }
  function renderGradientOptions(bar) {
    bar.add(
      createSegmented({
        label: __("Ramp"),
        value: bar.brush.gradient,
        options: GRADIENT_KINDS.map((entry) => ({
          value: entry.value,
          label: __(entry.label)
        })),
        onChange: (value) => bar.setBrush({ gradient: value })
      })
    );
    bar.divider();
    colourField(bar);
    if (!bar.brush.gradientFade) {
      const to = createColourField({
        compact: true,
        label: __("To"),
        value: bar.brush.background,
        onChange: (value) => bar.setBrush({ background: value })
      });
      bar.add(to, () => to.setValue(bar.brush.background));
    }
    bar.add(
      createCheckbox({
        label: __("Fade out"),
        checked: bar.brush.gradientFade,
        title: __("End transparent instead of at the background colour."),
        onChange: (checked) => bar.setBrush({ gradientFade: checked }, true)
      })
    );
    percentField(bar, "opacity", __("Opacity"), 1);
    bar.hint(__("Drag to set the direction and length of the ramp."));
  }
  function renderShapeOptions(bar) {
    bar.add(
      createSelect({
        compact: true,
        label: __("Shape"),
        value: bar.brush.shapeKind,
        options: SHAPE_KINDS.map((entry) => ({
          value: entry.value,
          label: __(entry.label)
        })),
        onChange: (value) => bar.setBrush({ shapeKind: value }, true)
      })
    );
    if ("line" !== bar.brush.shapeKind) {
      styleToggle(bar);
    }
    if ("line" === bar.brush.shapeKind || "stroke" === bar.brush.shapeStyle) {
      widthField(bar);
    }
    bar.divider();
    colourField(bar);
    percentField(bar, "opacity", __("Opacity"), 1);
    bar.hint(__("Drag on the image. Hold Shift to keep it square."));
  }
  const TOOL_NAMES = {
    transform: "Move & transform",
    select: "Select",
    wand: "Magic wand",
    crop: "Crop",
    eyedropper: "Eyedropper",
    retouch: "Retouch",
    brush: "Brush",
    history: "History brush",
    clone: "Clone stamp",
    eraser: "Eraser",
    fill: "Fill",
    gradient: "Gradient",
    tone: "Dodge & burn",
    text: "Text",
    shape: "Shape",
    path: "Path",
    hand: "Hand",
    zoom: "Zoom"
  };
  const TOOL_HINTS = {
    transform: "Drag to move, corners scale, edges scale one axis, top handle rotates. Alt bypasses snapping.",
    crop: "Drag a rectangle, then apply it from the Canvas & crop panel.",
    eyedropper: "Click or drag to sample a colour into the foreground swatch.",
    hand: "Drag to move the view. Scrolling does the same thing from any tool."
  };
  const MODIFIER_HINT = "Shift adds, Alt subtracts, Shift+Alt intersects.";
  function modePicker(bar) {
    const field = createSegmented({
      label: __("Selection mode"),
      value: bar.options.getSelectionMode(),
      icons: true,
      options: SELECTION_MODES.map((mode) => ({
        value: mode.value,
        label: mode.glyph,
        title: __(mode.title)
      })),
      onChange: (value) => bar.options.setSelectionMode(value)
    });
    bar.add(field, () => field.setValue(bar.options.getSelectionMode()));
  }
  function magneticFields(bar) {
    const width = createNumberField({
      compact: true,
      label: __("Width"),
      value: bar.brush.magneticWidth,
      min: 4,
      max: 80,
      suffix: "px",
      onChange: (value) => bar.setBrush({ magneticWidth: value })
    });
    bar.add(width, () => width.setValue(bar.brush.magneticWidth));
    const contrast = createNumberField({
      compact: true,
      label: __("Contrast"),
      value: bar.brush.magneticContrast,
      min: 0,
      max: 95,
      suffix: "%",
      onChange: (value) => bar.setBrush({ magneticContrast: value })
    });
    bar.add(contrast, () => contrast.setValue(bar.brush.magneticContrast));
    const frequency = createNumberField({
      compact: true,
      label: __("Frequency"),
      value: bar.brush.magneticFrequency,
      min: 0,
      max: 100,
      onChange: (value) => bar.setBrush({ magneticFrequency: value })
    });
    bar.add(frequency, () => frequency.setValue(bar.brush.magneticFrequency));
  }
  function shapeHint(shape) {
    if ("polygon" === shape) {
      return __("Click to add points, Enter to close, Escape to abandon.");
    }
    if ("magnetic" === shape) {
      return __(
        "Trace an edge and it follows it. Click to pin a point, Backspace undoes one, click the start or press Enter to close. Lower Frequency pins fewer points for you."
      );
    }
    return __(MODIFIER_HINT);
  }
  function renderSelectOptions(bar) {
    modePicker(bar);
    bar.divider();
    bar.add(
      createSegmented({
        label: __("Shape"),
        hideLabel: true,
        value: bar.options.getSelectionShape(),
        options: SELECTION_SHAPES.map((entry) => ({
          value: entry.value,
          label: __(entry.label)
        })),
        onChange: (value) => {
          bar.options.setSelectionShape(value);
          bar.rebuild();
        }
      })
    );
    if ("magnetic" === bar.options.getSelectionShape()) {
      bar.divider();
      magneticFields(bar);
    }
    bar.divider();
    selectionButtons(bar);
    bar.hint(shapeHint(bar.options.getSelectionShape()));
  }
  function renderWandOptions(bar) {
    modePicker(bar);
    bar.divider();
    toleranceField(bar);
    bar.divider();
    selectionButtons(bar);
    bar.hint(__(MODIFIER_HINT));
  }
  function renderTextOptions(bar) {
    bar.add(
      createSelect({
        compact: true,
        label: __("Font"),
        value: bar.brush.fontFamily,
        options: FONT_STACKS.map((entry) => ({
          value: entry.value,
          label: __(entry.label)
        })),
        onChange: (value) => bar.setBrush({ fontFamily: value })
      })
    );
    bar.add(
      createNumberField({
        compact: true,
        label: __("Size"),
        value: bar.brush.fontSize,
        min: 6,
        max: 1200,
        suffix: "px",
        onChange: (value) => bar.setBrush({ fontSize: value })
      })
    );
    bar.add(
      createCheckbox({
        label: __("Bold"),
        checked: bar.brush.bold,
        onChange: (checked) => bar.setBrush({ bold: checked })
      })
    );
    bar.add(
      createCheckbox({
        label: __("Italic"),
        checked: bar.brush.italic,
        onChange: (checked) => bar.setBrush({ italic: checked })
      })
    );
    bar.divider();
    colourField(bar);
    bar.hint(
      bar.options.isTypingText() ? __("Enter for a new line. Cmd/Ctrl+Enter finishes, Escape cancels.") : __("Click on the image and type.")
    );
  }
  function renderZoomOptions(bar) {
    bar.add(
      createButton({
        label: __("Fit"),
        variant: "secondary",
        onClick: () => bar.options.setZoom("fit")
      })
    );
    bar.add(
      createButton({
        label: __("100%"),
        variant: "secondary",
        onClick: () => bar.options.setZoom("actual")
      })
    );
    bar.hint(__("Click to zoom in, Alt-click to zoom out."));
  }
  function renderTool(tool, bar) {
    switch (tool) {
      case "select":
        renderSelectOptions(bar);
        return true;
      case "wand":
        renderWandOptions(bar);
        return true;
      case "brush":
      case "eraser":
        renderBrushOptions(bar, "eraser" === tool);
        return true;
      case "history":
        renderHistoryOptions(bar);
        return true;
      case "path":
        renderPathOptions(bar);
        return true;
      case "retouch":
      case "tone":
        renderPixelToolOptions(bar, tool);
        return true;
      case "clone":
        renderCloneOptions(bar);
        return true;
      case "fill":
        renderFillOptions(bar);
        return true;
      case "gradient":
        renderGradientOptions(bar);
        return true;
      case "shape":
        renderShapeOptions(bar);
        return true;
      case "text":
        renderTextOptions(bar);
        return true;
      case "zoom":
        renderZoomOptions(bar);
        return true;
      default:
        return false;
    }
  }
  class OptionsBar {
    /**
     * @param options Bar configuration.
     */
    constructor(options) {
      this.render = () => {
        const tool = this.options.getTool();
        this.builder.release();
        this.el.replaceChildren();
        const name = document.createElement("span");
        name.className = "lz-options__tool";
        name.textContent = TOOL_NAMES[tool] ? __(TOOL_NAMES[tool]) : "";
        this.el.appendChild(name);
        if (!renderTool(tool, this.builder)) {
          this.builder.hint(TOOL_HINTS[tool] ? __(TOOL_HINTS[tool]) : "");
        }
      };
      this.sync = () => {
        this.builder.sync();
      };
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "lz-options";
      this.el.setAttribute("role", "toolbar");
      this.el.setAttribute("aria-label", __("Tool options"));
      this.builder = new OptionsBuilder(this.el, options, () => this.render());
      this.offBrush = options.ctx.onBrushChange(() => this.sync());
      this.render();
    }
    /** Releases listeners. */
    destroy() {
      this.offBrush();
      this.builder.release();
      this.el.remove();
    }
  }
  const RULER_SIZE = 20;
  const MIN_LABEL_GAP = 56;
  function tickStep(scale) {
    const wanted = MIN_LABEL_GAP / Math.max(scale, 1e-6) / 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(wanted, 1e-6))));
    for (const multiple of [1, 2, 5, 10]) {
      if (magnitude * multiple >= wanted) {
        return magnitude * multiple;
      }
    }
    return magnitude * 10;
  }
  function paintRuler(canvas, width, height, axis, origin, scale, marker) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1a1f24";
    ctx.fillRect(0, 0, w, h);
    const length = axis === "h" ? w : h;
    const step = tickStep(scale);
    ctx.font = "9px -apple-system, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#8f979e";
    ctx.strokeStyle = "#4a5259";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const firstValue = Math.floor(-origin / scale / step) * step;
    for (let value = firstValue; ; value += step) {
      const at = origin + value * scale;
      if (at > length) {
        break;
      }
      if (at < 0) {
        continue;
      }
      const major = value % (step * 5) === 0;
      const size = major ? RULER_SIZE : RULER_SIZE * 0.4;
      if (axis === "h") {
        ctx.moveTo(Math.round(at) + 0.5, RULER_SIZE - size);
        ctx.lineTo(Math.round(at) + 0.5, RULER_SIZE);
      } else {
        ctx.moveTo(RULER_SIZE - size, Math.round(at) + 0.5);
        ctx.lineTo(RULER_SIZE, Math.round(at) + 0.5);
      }
      if (major) {
        if (axis === "h") {
          ctx.fillText(String(value), at + 2, 2);
        } else {
          ctx.save();
          ctx.translate(2, at + 2);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(String(value), 0, -RULER_SIZE + 4);
          ctx.restore();
        }
      }
    }
    ctx.stroke();
    if (marker) {
      const at = origin + (axis === "h" ? marker.x : marker.y) * scale;
      ctx.strokeStyle = "#3582c4";
      ctx.beginPath();
      if (axis === "h") {
        ctx.moveTo(Math.round(at) + 0.5, 0);
        ctx.lineTo(Math.round(at) + 0.5, RULER_SIZE);
      } else {
        ctx.moveTo(0, Math.round(at) + 0.5);
        ctx.lineTo(RULER_SIZE, Math.round(at) + 0.5);
      }
      ctx.stroke();
    }
  }
  class Rulers {
    constructor(options) {
      this.marker = null;
      this.onPointerMove = (event) => {
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!viewport || viewport.width === 0) {
          return;
        }
        const rect = this.options.stage.getBoundingClientRect();
        this.marker = {
          x: (event.clientX - rect.left - viewport.x) / viewport.width * canvas.width,
          y: (event.clientY - rect.top - viewport.y) / viewport.height * canvas.height
        };
        this.draw();
      };
      this.draw = () => {
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!viewport || canvas.width <= 0) {
          this.root.hidden = true;
          return;
        }
        this.root.hidden = false;
        const bounds = this.options.stage.getBoundingClientRect();
        const scale = viewport.width / canvas.width;
        paintRuler(
          this.horizontal,
          bounds.width - RULER_SIZE,
          RULER_SIZE,
          "h",
          viewport.x - RULER_SIZE,
          scale,
          this.marker
        );
        paintRuler(
          this.vertical,
          RULER_SIZE,
          bounds.height - RULER_SIZE,
          "v",
          viewport.y - RULER_SIZE,
          scale,
          this.marker
        );
      };
      this.options = options;
      this.root = document.createElement("div");
      this.root.className = "lz-rulers";
      this.root.setAttribute("aria-hidden", "true");
      this.horizontal = document.createElement("canvas");
      this.horizontal.className = "lz-ruler lz-ruler--h";
      this.vertical = document.createElement("canvas");
      this.vertical.className = "lz-ruler lz-ruler--v";
      const corner = document.createElement("div");
      corner.className = "lz-ruler__corner";
      this.root.append(corner, this.horizontal, this.vertical);
      options.stage.appendChild(this.root);
      options.stage.addEventListener("pointermove", this.onPointerMove);
      this.draw();
    }
    /** Shows or hides the rulers. */
    setVisible(visible) {
      this.root.style.display = visible ? "" : "none";
    }
    /** Removes the rulers. */
    destroy() {
      this.options.stage.removeEventListener("pointermove", this.onPointerMove);
      this.root.remove();
    }
  }
  function toCanvas(source, event) {
    const viewport = source.getViewport();
    const canvas = source.getCanvas();
    if (!viewport || 0 === viewport.width || 0 === canvas.width) {
      return null;
    }
    const stageRect = source.stage.getBoundingClientRect();
    const x = event.clientX - stageRect.left - viewport.x;
    const y = event.clientY - stageRect.top - viewport.y;
    return {
      x: x / viewport.width * canvas.width,
      y: y / viewport.height * canvas.height
    };
  }
  function normalise$1(canvas, point) {
    return { x: point.x / canvas.width, y: point.y / canvas.height };
  }
  function toStage(stage, event) {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  class DragPreview {
    /**
     * @param stage The canvas area to draw over.
     */
    constructor(stage) {
      this.svg = null;
      this.path = null;
      this.origin = null;
      this.stage = stage;
    }
    /**
     * Begins an outline at a pointer position.
     *
     * @param event Pointer event the drag began with.
     * @param shape What the outline should look like.
     */
    start(event, shape) {
      if (!this.svg) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "lz-drag-preview");
        svg.setAttribute("aria-hidden", "true");
        this.path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        svg.appendChild(this.path);
        this.stage.appendChild(svg);
        this.svg = svg;
      }
      this.origin = { x: event.clientX, y: event.clientY };
      this.svg.style.display = "";
      this.update(event, shape);
    }
    /**
     * Redraws the outline.
     *
     * @param event Current pointer position.
     * @param shape What the outline should look like.
     */
    update(event, shape) {
      if (!this.path || !this.origin) {
        return;
      }
      const rect = this.stage.getBoundingClientRect();
      const from = {
        x: this.origin.x - rect.left,
        y: this.origin.y - rect.top
      };
      let to = toStage(this.stage, event);
      if (shape.square && "shape" === shape.tool) {
        to = squareDrag(from, to);
      }
      this.path.setAttribute("d", outlineFor(from, to, shape));
    }
    /** Hides the outline. */
    hide() {
      if (this.svg) {
        this.svg.style.display = "none";
        this.path?.setAttribute("d", "");
      }
      this.origin = null;
    }
    /** Takes the outline off the stage. */
    destroy() {
      this.svg?.remove();
      this.svg = null;
      this.path = null;
      this.origin = null;
    }
  }
  function outlineFor(from, to, shape) {
    if ("gradient" === shape.tool || "line" === shape.shapeKind) {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
    const box = rectFromDrag(from, to);
    if ("ellipse" === shape.shapeKind) {
      const rx = box.width / 2;
      const ry = box.height / 2;
      return `M ${box.x} ${box.y + ry} a ${rx} ${ry} 0 1 0 ${box.width} 0 a ${rx} ${ry} 0 1 0 ${-box.width} 0 Z`;
    }
    return `M ${box.x} ${box.y} h ${box.width} v ${box.height} h ${-box.width} Z`;
  }
  const MAX_FIELD_PIXELS = 2e6;
  const HISTOGRAM_BINS = 256;
  const MAX_SOBEL = 1443;
  const PERCENTILE = 0.99;
  function buildEdgeField(pixels, width, height, contrast = 0, maxPixels = MAX_FIELD_PIXELS) {
    if (width < 3 || height < 3) {
      return null;
    }
    const ceiling = maxPixels >= 1 ? maxPixels : MAX_FIELD_PIXELS;
    const step = Math.max(
      1,
      Math.ceil(Math.sqrt(width * height / ceiling))
    );
    const fw = Math.floor(width / step);
    const fh = Math.floor(height / step);
    if (fw < 3 || fh < 3) {
      return null;
    }
    const count = fw * fh;
    const magnitude = new Uint16Array(count);
    const tangentX = new Int8Array(count);
    const tangentY = new Int8Array(count);
    const histogram = new Uint32Array(HISTOGRAM_BINS);
    const row = width * 4;
    const col = step * 4;
    const band = step * row;
    const shift = Math.ceil(Math.log2(MAX_SOBEL / HISTOGRAM_BINS));
    for (let y = 0; y < fh; y++) {
      const sy = Math.min(height - 1 - step, Math.max(step, y * step));
      for (let x = 0; x < fw; x++) {
        const sx = Math.min(width - 1 - step, Math.max(step, x * step));
        const centre = (sy * width + sx) * 4;
        let best = -1;
        let bestX = 0;
        let bestY = 0;
        for (let channel = 0; channel < 3; channel++) {
          const i = centre + channel;
          const tl = pixels[i - band - col];
          const tc = pixels[i - band];
          const tr = pixels[i - band + col];
          const ml = pixels[i - col];
          const mr = pixels[i + col];
          const bl = pixels[i + band - col];
          const bc = pixels[i + band];
          const br = pixels[i + band + col];
          const gx = tr + 2 * mr + br - tl - 2 * ml - bl;
          const gy = bl + 2 * bc + br - tl - 2 * tc - tr;
          const squared = gx * gx + gy * gy;
          if (squared > best) {
            best = squared;
            bestX = gx;
            bestY = gy;
          }
        }
        const mag = Math.round(Math.sqrt(best));
        const index = y * fw + x;
        magnitude[index] = mag;
        histogram[Math.min(HISTOGRAM_BINS - 1, mag >> shift)]++;
        if (mag > 0) {
          tangentX[index] = Math.round(bestY / mag * 127);
          tangentY[index] = Math.round(-bestX / mag * 127);
        }
      }
    }
    return {
      width: fw,
      height: fh,
      step,
      strength: normalise(magnitude, histogram, shift, count, contrast),
      tangentX,
      tangentY
    };
  }
  function normalise(magnitude, histogram, shift, count, contrast) {
    const target = count * PERCENTILE;
    let seen = 0;
    let bin = 0;
    for (; bin < HISTOGRAM_BINS - 1; bin++) {
      seen += histogram[bin];
      if (seen >= target) {
        break;
      }
    }
    const peak = Math.max(1, bin + 1 << shift);
    const floor = Math.min(0.95, Math.max(0, contrast));
    const strength = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const scaled = magnitude[i] / peak;
      strength[i] = scaled <= floor ? 0 : Math.min(255, Math.round((scaled - floor) / (1 - floor) * 255));
    }
    return strength;
  }
  const EDGE_WEIGHT = 0.82;
  const DIRECTION_WEIGHT = 1 - EDGE_WEIGHT;
  const COST_SCALE = 256;
  const MAX_LINK = 1 + Math.ceil(Math.SQRT2 * COST_SCALE);
  const BUCKETS = MAX_LINK + 1;
  const NEIGHBOUR_X = [1, -1, 0, 0, 1, 1, -1, -1];
  const NEIGHBOUR_Y = [0, 0, 1, -1, 1, -1, 1, -1];
  const UNIT = NEIGHBOUR_X.map((dx, i) => Math.hypot(dx, NEIGHBOUR_Y[i]));
  const UNIT_X = NEIGHBOUR_X.map((dx, i) => dx / UNIT[i]);
  const UNIT_Y = NEIGHBOUR_Y.map((dy, i) => dy / UNIT[i]);
  const ACOS_STEPS = 512;
  const ACOS = (() => {
    const table = new Float32Array(ACOS_STEPS + 1);
    for (let i = 0; i <= ACOS_STEPS; i++) {
      table[i] = Math.acos(i / ACOS_STEPS * 2 - 1);
    }
    return table;
  })();
  function acos(value) {
    const clamped = value < -1 ? -1 : value > 1 ? 1 : value;
    return ACOS[Math.round((clamped + 1) * 0.5 * ACOS_STEPS)];
  }
  class LiveWire {
    /**
     * @param field The edge field to search.
     */
    constructor(field) {
      this.buckets = [];
      this.generation = 0;
      this.queued = 0;
      this.sweep = 0;
      this.seedIndex = -1;
      this.minX = 0;
      this.minY = 0;
      this.maxX = 0;
      this.maxY = 0;
      const count = field.width * field.height;
      this.field = field;
      this.cost = new Int32Array(count);
      this.parent = new Int32Array(count);
      this.stamp = new Int32Array(count);
      this.settled = new Int32Array(count);
      for (let i = 0; i < BUCKETS; i++) {
        this.buckets.push([]);
      }
    }
    /**
     * Anchors the wire at a point, and bounds how far from it the search may go.
     *
     * The bound is the tool's Width setting, and it is what makes the wire predictable:
     * inside it the pointer is a suggestion and the boundary decides, outside it there
     * is no boundary on offer and the caller draws a straight line instead. A search
     * with no bound would eventually find *some* route to anywhere, and the further away
     * the pointer got the less that route would resemble anything the user pointed at.
     *
     * @param x      Field coordinates.
     * @param y      Field coordinates.
     * @param radius How far the search may travel, in field pixels.
     */
    seed(x, y, radius) {
      const { width, height } = this.field;
      const sx = clamp$1(Math.round(x), 0, width - 1);
      const sy = clamp$1(Math.round(y), 0, height - 1);
      for (const bucket of this.buckets) {
        bucket.length = 0;
      }
      this.generation++;
      this.queued = 0;
      this.sweep = 0;
      this.minX = Math.max(0, sx - radius);
      this.minY = Math.max(0, sy - radius);
      this.maxX = Math.min(width - 1, sx + radius);
      this.maxY = Math.min(height - 1, sy + radius);
      this.seedIndex = sy * width + sx;
      this.cost[this.seedIndex] = 0;
      this.parent[this.seedIndex] = -1;
      this.stamp[this.seedIndex] = this.generation;
      this.buckets[0].push(this.seedIndex);
      this.queued++;
    }
    /** Where the wire is currently anchored, in field pixels. */
    get anchor() {
      if (this.seedIndex < 0) {
        return null;
      }
      return {
        x: this.seedIndex % this.field.width,
        y: Math.floor(this.seedIndex / this.field.width)
      };
    }
    /**
     * The cheapest route from the anchor to a point.
     *
     * @param x Field coordinates.
     * @param y Field coordinates.
     * @return The route, anchor first, or null when the point is out of reach.
     */
    pathTo(x, y) {
      const px = Math.round(x);
      const py = Math.round(y);
      if (this.seedIndex < 0 || px < this.minX || px > this.maxX || py < this.minY || py > this.maxY) {
        return null;
      }
      const target = py * this.field.width + px;
      if (!this.expandTo(target)) {
        return null;
      }
      const route = [];
      for (let i = target; i >= 0; i = this.parent[i]) {
        route.push({
          x: i % this.field.width,
          y: Math.floor(i / this.field.width)
        });
        if (i === this.seedIndex) {
          break;
        }
      }
      return route.reverse();
    }
    /**
     * Settles nodes in cost order until the target is one of them.
     *
     * @param target Node to reach.
     * @return Whether it was reached.
     */
    expandTo(target) {
      if (this.settled[target] === this.generation) {
        return true;
      }
      while (this.queued > 0) {
        const bucket = this.buckets[this.sweep % BUCKETS];
        if (0 === bucket.length) {
          this.sweep++;
          continue;
        }
        const index = bucket.pop();
        this.queued--;
        if (this.stamp[index] !== this.generation || this.cost[index] !== this.sweep || this.settled[index] === this.generation) {
          continue;
        }
        this.settled[index] = this.generation;
        if (index === target) {
          return true;
        }
        this.relax(index);
      }
      return this.settled[target] === this.generation;
    }
    /**
     * Offers a cheaper route to each of a settled node's eight neighbours.
     *
     * @param index Node to expand from.
     */
    relax(index) {
      const { width, strength, tangentX, tangentY } = this.field;
      const x = index % width;
      const y = (index - x) / width;
      const base = this.cost[index];
      const fromX = tangentX[index] / 127;
      const fromY = tangentY[index] / 127;
      for (let n = 0; n < 8; n++) {
        const nx = x + NEIGHBOUR_X[n];
        const ny = y + NEIGHBOUR_Y[n];
        if (nx < this.minX || nx > this.maxX || ny < this.minY || ny > this.maxY) {
          continue;
        }
        const next = ny * width + nx;
        if (this.settled[next] === this.generation) {
          continue;
        }
        let stepX = UNIT_X[n];
        let stepY = UNIT_Y[n];
        if (fromX * stepX + fromY * stepY < 0) {
          stepX = -stepX;
          stepY = -stepY;
        }
        const turn = acos(fromX * stepX + fromY * stepY) + acos(stepX * (tangentX[next] / 127) + stepY * (tangentY[next] / 127));
        const local = EDGE_WEIGHT * (1 - strength[next] / 255) + DIRECTION_WEIGHT * turn * (2 / (3 * Math.PI));
        const link = 1 + Math.round(local * UNIT[n] * COST_SCALE);
        const total = base + link;
        if (this.stamp[next] === this.generation && this.cost[next] <= total) {
          continue;
        }
        this.stamp[next] = this.generation;
        this.cost[next] = total;
        this.parent[next] = index;
        this.buckets[total % BUCKETS].push(next);
        this.queued++;
      }
    }
  }
  function clamp$1(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }
  const CLOSE_DISTANCE = 12;
  const MIN_RADIUS = 6;
  const MAX_RADIUS = 120;
  const MAX_SPACING = 200;
  const MAX_REACH = 220;
  const SIMPLIFY_TOLERANCE = 0.7;
  const SNAP_WINDOW = 6;
  const MIN_EDGE = 32;
  class MagneticTrace {
    /**
     * @param options Tool wiring.
     */
    constructor(options) {
      this.field = null;
      this.wire = null;
      this.document = { width: 0, height: 0 };
      this.traced = [];
      this.anchors = [];
      this.live = [];
      this.radius = MIN_RADIUS;
      this.spacing = 20;
      this.reach = MIN_RADIUS;
      this.closeWithin = CLOSE_DISTANCE;
      this.options = options;
    }
    /** Whether a trace is in progress. */
    get isTracing() {
      return null !== this.field;
    }
    /** How many anchors are pinned. */
    get anchorCount() {
      return this.anchors.length;
    }
    /**
     * Reads the document, finds its edges, and drops the first anchor.
     *
     * The edge field is built once here and kept for the whole trace. It is the one
     * expensive thing this tool does -- a Sobel over the composed document, plus the
     * read-back from the GPU that feeds it -- and rebuilding it per anchor would put
     * that cost on every click instead of on the first.
     *
     * @param point Canvas coordinates.
     * @return Whether a trace could be started. False when there are no pixels to follow,
     *         and the caller should fall back to an ordinary freeform lasso.
     */
    begin(point) {
      const source = this.options.readDocument();
      if (!source) {
        return false;
      }
      const brush = this.options.getBrush();
      const field = buildEdgeField(
        source.pixels,
        source.width,
        source.height,
        brush.magneticContrast / 100,
        this.options.maxEdgePixels
      );
      if (!field) {
        return false;
      }
      const zoom = this.documentPerScreenPixel() / field.step;
      this.field = field;
      this.wire = new LiveWire(field);
      this.document = { width: source.width, height: source.height };
      this.radius = clamp(
        Math.round(brush.magneticWidth * zoom),
        MIN_RADIUS,
        MAX_RADIUS
      );
      this.spacing = clamp(
        Math.round(anchorSpacing(brush.magneticFrequency) * zoom),
        3,
        MAX_SPACING
      );
      this.closeWithin = Math.max(3, CLOSE_DISTANCE * zoom);
      const start = this.toField(point);
      this.traced = [start];
      this.anchors = [{ at: 0, manual: true }];
      this.live = [start];
      this.reach = Math.min(MAX_REACH, this.radius + this.spacing);
      this.wire.seed(start.x, start.y, this.reach);
      return true;
    }
    /**
     * Follows the pointer, pinning boundary behind it as it goes.
     *
     * Anchors are dropped inside this loop rather than on a timer, and they are dropped
     * at a point *on the traced boundary* rather than under the pointer. That difference
     * is most of why this feels magnetic: the pointer is allowed to be sloppy, and every
     * anchor it leaves behind still lands on the edge.
     *
     * @param point Canvas coordinates.
     */
    moveTo(point) {
      if (!this.wire || !this.field) {
        return;
      }
      const target = this.toField(point);
      for (let pass = 0; pass < 8; pass++) {
        const route = this.wire.pathTo(target.x, target.y);
        if (!route) {
          if (this.advance(target)) {
            continue;
          }
          return;
        }
        const cut = cutAt(route, this.spacing);
        if (cut < 0) {
          this.live = route;
          return;
        }
        this.pin(route.slice(0, this.pinIndex(route, cut) + 1), false);
      }
    }
    /**
     * Walks one straight step towards a pointer the wire cannot reach.
     *
     * Someone moving faster than the search can follow, or deliberately cutting across
     * open sky, leaves the anchor behind -- and an anchor that can no longer see the
     * pointer can never find the boundary near it again, so without this the trace would
     * stall the first time anyone flicked their wrist and rubber-band forever after.
     * Stepping the anchor towards the pointer keeps the search where the pointer is, and
     * the straight line it lays down is the honest record of a stretch where the tool
     * was following the hand rather than the picture.
     *
     * @param target Field coordinates of the pointer.
     * @return Whether an anchor was moved, and the caller should search again.
     */
    advance(target) {
      const from = this.traced[this.traced.length - 1];
      const gap = Math.hypot(target.x - from.x, target.y - from.y);
      if (gap <= this.spacing) {
        this.live = [from, target];
        return false;
      }
      const reach = this.spacing / gap;
      this.pin(
        [
          from,
          {
            x: Math.round(from.x + (target.x - from.x) * reach),
            y: Math.round(from.y + (target.y - from.y) * reach)
          }
        ],
        false
      );
      return true;
    }
    /**
     * Pins an anchor where the pointer is.
     *
     * @param point Canvas coordinates.
     */
    anchorAt(point) {
      if (!this.wire) {
        return;
      }
      this.moveTo(point);
      this.pinLive(true);
    }
    /**
     * Takes back the last anchor.
     *
     * @return Whether the trace is still alive. False once the first anchor has gone,
     *         and the caller should abandon it.
     */
    undoAnchor() {
      if (!this.wire || this.anchors.length < 2) {
        return false;
      }
      this.anchors.pop();
      const { at } = this.anchors[this.anchors.length - 1];
      const anchor = this.traced[at];
      this.traced.length = at + 1;
      this.live = [anchor];
      this.wire.seed(anchor.x, anchor.y, this.reach);
      return true;
    }
    /**
     * Closes the loop and hands back what was traced.
     *
     * Whatever the wire is showing is included first, because what is on screen when
     * someone presses Enter is what they think they are selecting. The segment from
     * there back to the first anchor is traced too where the wire can reach it, which is
     * exactly the case that matters: closing by clicking near where you started should
     * follow the boundary round the last few pixels rather than cutting the corner.
     *
     * @return The region, or null when too little was traced to enclose anything.
     */
    close() {
      if (!this.field || this.anchors.length < 1) {
        return null;
      }
      this.pinLive(true);
      const start = this.traced[0];
      const closing = this.wire?.pathTo(start.x, start.y);
      if (closing && closing.length > 2) {
        this.traced.push(...closing.slice(1, -1));
      }
      const points = this.normalise(this.traced);
      return points.length > 2 ? { shape: "lasso", points } : null;
    }
    /**
     * The anchors to mark right now.
     *
     * Shown because an anchor is the only irreversible thing this tool does while it is
     * running: everything behind one is fixed for the rest of the trace, and only the
     * stretch in front of it still moves with the hand. Somebody deciding whether to
     * click needs to know where the last one landed, and somebody deciding whether to
     * press Backspace needs to know what it would take back.
     *
     * @return Anchors in normalised coordinates, or an empty list when nothing is traced.
     */
    anchorPoints() {
      if (!this.field) {
        return [];
      }
      return this.anchors.map((anchor) => ({
        point: this.toNormalised(this.traced[anchor.at]),
        manual: anchor.manual
      }));
    }
    /**
     * The outline to draw right now: everything pinned, plus the live wire.
     *
     * @return The outline, or null when there is not enough of it to draw.
     */
    outline() {
      if (!this.field) {
        return null;
      }
      const points = this.normalise([...this.traced, ...this.live.slice(1)]);
      return points.length > 1 ? { shape: "lasso", points } : null;
    }
    /**
     * Whether a press at a point should be read as "close the loop".
     *
     * @param point Canvas coordinates.
     */
    nearStart(point) {
      if (!this.field || this.anchors.length < 2) {
        return false;
      }
      const at = this.toField(point);
      const start = this.traced[0];
      return Math.hypot(at.x - start.x, at.y - start.y) <= this.closeWithin;
    }
    /** Abandons the trace and releases the edge field. */
    clear() {
      this.field = null;
      this.wire = null;
      this.traced = [];
      this.anchors = [];
      this.live = [];
    }
    /**
     * Pins whatever the wire is currently showing, ending it on the boundary.
     *
     * @param manual Whether a click asked for this.
     */
    pinLive(manual) {
      if (this.live.length < 2) {
        return;
      }
      this.pin(
        this.live.slice(0, this.pinIndex(this.live, this.live.length - 1) + 1),
        manual
      );
    }
    /**
     * Where along a wire an anchor may safely be pinned.
     *
     * The last stretch of any wire is the hop out to wherever the pointer actually is,
     * which is off the boundary by however sloppily the user is pointing. Pinning there
     * is the single most visible way this tool can go wrong: the slop is baked in
     * permanently, and because the next wire starts from the anchor and has to climb
     * back onto the boundary, what the user gets is a *spike* out to where their hand
     * happened to be and straight back again.
     *
     * So the anchor goes to the last point that is genuinely on an edge -- the moment
     * before the wire let go of it -- measured against the strongest edge this particular
     * wire found rather than against a fixed number, because "strong" on a foggy morning
     * and "strong" on a studio cut-out are two different quantities. A wire that found no
     * edge at all is pinned exactly where the spacing rule asked, since there is nothing
     * better on offer and moving it would only be guessing.
     *
     * @param route Wire path.
     * @param cut   Where the spacing rule wants the anchor.
     */
    pinIndex(route, cut) {
      const field = this.field;
      const last = Math.min(route.length - 1, cut + SNAP_WINDOW);
      const strength = (i) => field.strength[route[i].y * field.width + route[i].x];
      let peak = 0;
      for (let i = 1; i <= last; i++) {
        peak = Math.max(peak, strength(i));
      }
      if (peak < MIN_EDGE) {
        return cut;
      }
      for (let i = last; i >= 1; i--) {
        if (strength(i) * 2 >= peak) {
          return i;
        }
      }
      return cut;
    }
    /**
     * Adds a stretch of traced boundary and reseeds the wire at the end of it.
     *
     * @param route  Wire path, starting at the current anchor.
     * @param manual Whether a click asked for this, rather than the Frequency setting.
     */
    pin(route, manual) {
      const end = route[route.length - 1];
      this.traced.push(...route.slice(1));
      this.anchors.push({ at: this.traced.length - 1, manual });
      this.live = [end];
      this.wire?.seed(end.x, end.y, this.reach);
    }
    /**
     * Field coordinates for a point on the canvas.
     *
     * @param point Canvas coordinates.
     */
    toField(point) {
      const field = this.field;
      return {
        x: clamp(Math.round(point.x / field.step), 0, field.width - 1),
        y: clamp(Math.round(point.y / field.step), 0, field.height - 1)
      };
    }
    /**
     * A traced path as normalised vertices, simplified to fit a `Selection`.
     *
     * The tolerance is loosened until the path fits rather than the path being
     * decimated to length: dropping every third vertex of a boundary would spend the
     * budget evenly over straights and corners, and the corners are the only part of a
     * traced outline anyone can see.
     *
     * @param route Field coordinates.
     */
    normalise(route) {
      let simplified = simplifyPath(route, SIMPLIFY_TOLERANCE);
      for (let tolerance = SIMPLIFY_TOLERANCE * 2; simplified.length > MAX_LASSO_POINTS && tolerance < 64; tolerance *= 2) {
        simplified = simplifyPath(route, tolerance);
      }
      return simplified.map((at) => this.toNormalised(at));
    }
    /**
     * One field point as a normalised canvas coordinate.
     *
     * Half a field pixel is added, so a vertex sits in the middle of the pixel it names
     * rather than on its leading corner -- which matters at a stride of four, where the
     * difference is two document pixels of consistent bias.
     *
     * @param at Field coordinates.
     */
    toNormalised(at) {
      const { step } = this.field;
      return {
        x: clamp((at.x * step + step / 2) / this.document.width, 0, 1),
        y: clamp((at.y * step + step / 2) / this.document.height, 0, 1)
      };
    }
    /** How many document pixels one screen pixel currently covers. */
    documentPerScreenPixel() {
      const viewport = this.options.getViewport();
      const canvas = this.options.getCanvas();
      if (!viewport || viewport.width < 1 || canvas.width < 1) {
        return 1;
      }
      return canvas.width / viewport.width;
    }
  }
  function anchorSpacing(frequency) {
    return 4 + (100 - clamp(frequency, 0, 100)) * 0.9;
  }
  function cutAt(route, spacing) {
    let travelled = 0;
    for (let i = 1; i < route.length; i++) {
      travelled += Math.hypot(
        route[i].x - route[i - 1].x,
        route[i].y - route[i - 1].y
      );
      if (travelled >= spacing) {
        return i;
      }
    }
    return -1;
  }
  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }
  function cutPatch(buffer, rect) {
    const patch = document.createElement("canvas");
    patch.width = rect.width;
    patch.height = rect.height;
    const ctx = patch.getContext("2d");
    if (!ctx) {
      return null;
    }
    const region = ctx.createImageData(rect.width, rect.height);
    for (let row = 0; row < rect.height; row++) {
      const from = ((rect.y + row) * buffer.width + rect.x) * 4;
      region.data.set(
        buffer.data.subarray(from, from + rect.width * 4),
        row * rect.width * 4
      );
    }
    ctx.putImageData(region, 0, 0);
    return patch;
  }
  const RETOUCH_SPACING = 0.25;
  const PIXEL_TOOLS = ["retouch", "tone", "clone", "history"];
  const PIXEL_OPS = {
    clone: "clone",
    history: "restore",
    tone: void 0
  };
  function isPixelTool(tool) {
    return PIXEL_TOOLS.includes(tool);
  }
  class PixelStroke {
    /**
     * @param options Tool wiring.
     */
    constructor(options) {
      this.work = null;
      this.carry = null;
      this.pristine = null;
      this.offset = null;
      this.options = options;
    }
    /**
     * Fixes where the clone stamp copies from for this stroke.
     *
     * @param offset Distance from the stroke to the sample point, in canvas pixels.
     */
    setCloneOffset(offset) {
      this.offset = offset;
    }
    /**
     * Where the clone stamp copies from, relative to the stroke.
     *
     * @return The fixed offset, or null before any stroke has fixed one.
     */
    getCloneOffset() {
      return this.offset;
    }
    /**
     * Prepares a stroke.
     *
     * @param tool Active tool.
     */
    begin(tool) {
      if (!isPixelTool(tool)) {
        return;
      }
      const source = this.options.readDocument();
      this.carry = null;
      this.work = source ? {
        data: new Uint8ClampedArray(source.pixels),
        width: source.width,
        height: source.height
      } : null;
      if ("history" !== tool) {
        this.pristine = null;
        return;
      }
      const pristine = this.options.readPristine();
      this.pristine = pristine ? {
        data: pristine.pixels,
        width: pristine.width,
        height: pristine.height
      } : null;
    }
    /**
     * Applies one dab and composites the changed pixels back.
     *
     * @param point Canvas coordinates.
     * @param tool  Active tool.
     */
    dab(point, tool) {
      const work = this.work;
      if (!work) {
        return;
      }
      const brush = this.options.getBrush();
      const op = PIXEL_OPS[tool] ?? ("tone" === tool ? brush.tone : brush.retouch);
      if ("restore" === op && !this.pristine) {
        return;
      }
      const result = applyPixelDab({
        op,
        target: work,
        source: "restore" === op ? this.pristine : void 0,
        x: point.x,
        y: point.y,
        radius: brush.size,
        strength: brush.strength,
        hardness: brush.hardness,
        offsetX: this.offset?.x ?? 0,
        offsetY: this.offset?.y ?? 0,
        carry: this.carry
      });
      if (!result) {
        return;
      }
      this.carry = result.carry ?? this.carry;
      const patch = cutPatch(work, result.rect);
      if (!patch) {
        return;
      }
      this.options.composite(
        this.options.getTargetLayerId(),
        patch,
        result.rect.x,
        result.rect.y,
        1
      );
    }
    /** Drops the stroke's buffers. */
    reset() {
      this.work = null;
      this.carry = null;
      this.pristine = null;
    }
  }
  class SelectionGesture {
    constructor() {
      this.from = null;
      this.points = [];
    }
    /** Whether a drag is currently extending a marquee. */
    get isDragging() {
      return null !== this.from;
    }
    /** The vertices placed so far. */
    get vertices() {
      return this.points;
    }
    /**
     * Places one vertex, for the shapes built click by click.
     *
     * @param point Normalised coordinates.
     * @return The selection to show.
     */
    addVertex(point) {
      this.points = appendPathPoint(this.points, point, 0);
      return { shape: "polygon", points: this.points };
    }
    /**
     * Starts a marquee.
     *
     * @param point Normalised coordinates.
     * @param shape Which shape the marquee tool draws.
     * @return The selection to show, or null to clear it.
     */
    begin(point, shape) {
      if ("polygon" === this.drawn(shape)) {
        return this.addVertex(point);
      }
      this.from = point;
      this.points = [point];
      return null;
    }
    /**
     * The shape a gesture actually draws.
     *
     * Only ever different for the magnetic lasso, which reaches this class at all when
     * it could not read the document to find an edge in. What it falls back to is a
     * freeform drag -- the same tool with the magnetism switched off -- so that is what
     * gets drawn.
     *
     * @param shape Shape the marquee tool is set to.
     */
    drawn(shape) {
      return "magnetic" === shape ? "lasso" : shape;
    }
    /**
     * Extends a marquee.
     *
     * @param point Normalised coordinates.
     * @param shape Which shape the marquee tool draws.
     * @return The selection to show, or null when there is no drag to extend.
     */
    extend(point, shape) {
      if (!this.from) {
        return null;
      }
      const drawn = this.drawn(shape);
      if ("lasso" === drawn) {
        this.points = appendPathPoint(this.points, point);
        return { shape: "lasso", points: this.points };
      }
      return selectionFromDrag(drawn, this.from, point);
    }
    /** Ends a drag, leaving whatever it produced in place. */
    endDrag() {
      this.from = null;
    }
    /** Abandons a half-placed polygon or path. */
    clear() {
      this.points = [];
      this.from = null;
    }
  }
  function newGesture(options) {
    return {
      selection: new SelectionGesture(),
      magnetic: new MagneticTrace(options),
      preview: new DragPreview(options.stage),
      stroke: new PixelStroke(options),
      drawing: false,
      last: null,
      dragFrom: null,
      cloneSource: null,
      selectionMode: "new",
      pendingSelection: null
    };
  }
  function endGesture(gesture) {
    gesture.drawing = false;
    gesture.last = null;
    gesture.dragFrom = null;
    gesture.selection.endDrag();
    gesture.stroke.reset();
    gesture.preview.hide();
  }
  function previewShape(options, event) {
    return {
      tool: options.getTool(),
      shapeKind: options.getBrush().shapeKind,
      square: event.shiftKey
    };
  }
  function pressMagnetic(options, gesture, point, event) {
    const trace = gesture.magnetic;
    if (trace.isTracing) {
      if (trace.nearStart(point)) {
        closeMagnetic(options, gesture);
      } else {
        trace.anchorAt(point);
        show(options, gesture);
      }
      return true;
    }
    gesture.selectionMode = effectiveMode(options.getSelectionMode(), event);
    if (!trace.begin(point)) {
      return false;
    }
    show(options, gesture);
    return true;
  }
  function show(options, gesture) {
    options.previewSelection(gesture.magnetic.outline());
    options.previewAnchors(gesture.magnetic.anchorPoints());
  }
  function moveMagnetic(options, gesture, point) {
    if (!gesture.magnetic.isTracing) {
      return;
    }
    gesture.magnetic.moveTo(point);
    show(options, gesture);
  }
  function closeMagnetic(options, gesture) {
    if (!gesture.magnetic.isTracing) {
      return false;
    }
    const selection = gesture.magnetic.close();
    gesture.magnetic.clear();
    options.previewSelection(null);
    options.previewAnchors([]);
    if (selection) {
      options.commitSelection(selection, gesture.selectionMode);
    }
    return true;
  }
  function undoMagneticAnchor(options, gesture) {
    if (!gesture.magnetic.isTracing) {
      return false;
    }
    if (!gesture.magnetic.undoAnchor()) {
      gesture.magnetic.clear();
    }
    show(options, gesture);
    return true;
  }
  function paintPath(options, points) {
    const canvas = options.getCanvas();
    const brush = options.getBrush();
    if (points.length < 3) {
      return false;
    }
    const surface = document.createElement("canvas");
    surface.width = canvas.width;
    surface.height = canvas.height;
    const ctx = surface.getContext("2d");
    if (!ctx) {
      return false;
    }
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (0 === index) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    if ("fill" === brush.shapeStyle) {
      ctx.fillStyle = brush.colour;
      ctx.fill();
    } else {
      ctx.strokeStyle = brush.colour;
      ctx.lineWidth = Math.max(1, brush.strokeWidth);
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    options.composite(options.getTargetLayerId(), surface, 0, 0, brush.opacity);
    options.onStrokeEnd();
    return true;
  }
  function pickColour(options, point) {
    const source = options.readDocument();
    if (!source) {
      return;
    }
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (x < 0 || y < 0 || x >= source.width || y >= source.height) {
      return;
    }
    const index = (y * source.width + x) * 4;
    options.setBrush({
      colour: rgbToHex(
        source.pixels[index],
        source.pixels[index + 1],
        source.pixels[index + 2]
      )
    });
  }
  function zoomAtPointer(options, event) {
    const at = toStage(options.stage, event);
    options.zoomAt(event.altKey ? 1 / 1.4 : 1.4, at.x, at.y);
  }
  function matchRegion(options, point) {
    const source = options.readDocument();
    if (!source) {
      return null;
    }
    return floodFillRegion(
      source.pixels,
      source.width,
      source.height,
      point.x,
      point.y,
      options.getBrush().tolerance
    );
  }
  function floodFill(options, point) {
    const source = options.readDocument();
    if (!source) {
      return;
    }
    const filled = floodFillMask(
      source.pixels,
      source.width,
      source.height,
      point.x,
      point.y,
      options.getBrush().tolerance
    );
    if (!filled) {
      return;
    }
    const brush = options.getBrush();
    options.fillMask(
      options.getTargetLayerId(),
      filled.mask,
      brush.colour,
      brush.opacity,
      filled.region.bounds
    );
    options.onStrokeEnd();
  }
  function magicWand(options, point, event) {
    const region = matchRegion(options, point);
    if (!region) {
      return;
    }
    const traced = traceMask({
      data: region.state,
      width: region.width,
      height: region.height,
      bounds: region.bounds
    });
    options.commitSelection(
      traced.outer.length > 2 ? { shape: "lasso", points: traced.outer, holes: traced.holes } : null,
      effectiveMode(options.getSelectionMode(), event)
    );
  }
  function routePress(options, gesture, tool, point, event) {
    const norm = () => normalise$1(options.getCanvas(), point);
    switch (tool) {
      case "zoom":
        zoomAtPointer(options, event);
        return "done";
      case "fill":
        floodFill(options, point);
        return "done";
      case "wand":
        magicWand(options, point, event);
        return "done";
      case "text":
        options.onPlaceText(point);
        return "done";
      case "path":
        options.previewSelection(gesture.selection.addVertex(norm()));
        return "done";
      case "eyedropper":
        pickColour(options, point);
        gesture.last = point;
        return "drag";
      case "select":
        return beginSelection(options, gesture, point, norm(), event);
      case "gradient":
      case "shape":
        gesture.dragFrom = point;
        gesture.preview.start(event, previewShape(options, event));
        return "drag";
      case "clone":
        return routeClonePress(options, gesture, point, event);
      default:
        return "stroke";
    }
  }
  function beginSelection(options, gesture, at, point, event) {
    const shape = options.getSelectionShape();
    if ("magnetic" === shape && pressMagnetic(options, gesture, at, event)) {
      return "done";
    }
    const starting = "polygon" !== shape || 0 === gesture.selection.vertices.length;
    if (starting) {
      gesture.selectionMode = effectiveMode(options.getSelectionMode(), event);
    }
    gesture.pendingSelection = gesture.selection.begin(point, shape);
    options.previewSelection(gesture.pendingSelection);
    return "polygon" === shape ? "done" : "drag";
  }
  function routeClonePress(options, gesture, point, event) {
    if (event.altKey) {
      gesture.cloneSource = point;
      gesture.stroke.setCloneOffset(null);
      options.onToolStateChange?.();
      return "done";
    }
    if (!gesture.cloneSource) {
      return "done";
    }
    gesture.stroke.setCloneOffset({
      x: point.x - gesture.cloneSource.x,
      y: point.y - gesture.cloneSource.y
    });
    return "stroke";
  }
  function commitRegion(options, from, event) {
    const to = toCanvas(options, event);
    if (!to) {
      return;
    }
    const tool = options.getTool();
    const brush = options.getBrush();
    const canvas = options.getCanvas();
    const end = event.shiftKey && "shape" === tool ? squareDrag(from, to) : to;
    const bitmap = "gradient" === tool ? gradientCanvas(
      canvas.width,
      canvas.height,
      brush.gradient,
      from,
      end,
      brush.colour,
      brush.background,
      brush.gradientFade
    ) : shapeCanvas(canvas.width, canvas.height, from, end, {
      kind: brush.shapeKind,
      style: brush.shapeStyle,
      colour: brush.colour,
      strokeWidth: brush.strokeWidth
    });
    if (!bitmap) {
      return;
    }
    options.composite(options.getTargetLayerId(), bitmap, 0, 0, brush.opacity);
    options.onStrokeEnd();
  }
  function stampDab(options, point, erasing) {
    const brush = options.getBrush();
    options.stamp(
      options.getTargetLayerId(),
      brushStamp(brush.shape, brush.size, brush.hardness),
      point.x,
      point.y,
      brush.size,
      brush.colour,
      brush.opacity,
      erasing
    );
  }
  function strokeDab(options, gesture, point, tool) {
    if (isPixelTool(tool)) {
      gesture.stroke.dab(point, tool);
      return;
    }
    stampDab(options, point, "eraser" === tool);
  }
  function continueStroke(options, gesture, point, tool) {
    const last = gesture.last;
    if (!gesture.drawing || !last) {
      return;
    }
    const spacing = isPixelTool(tool) ? RETOUCH_SPACING : STAMP_SPACING;
    const step = options.getBrush().size * spacing;
    for (const at of interpolateStroke(last, point, step)) {
      strokeDab(options, gesture, at, tool);
    }
    gesture.last = point;
  }
  function panBy(options, gesture, event) {
    const last = gesture.last;
    if (!last) {
      return;
    }
    options.pan(event.clientX - last.x, event.clientY - last.y);
    gesture.last = { x: event.clientX, y: event.clientY };
  }
  function defaultBrush() {
    return {
      shape: "soft",
      size: 40,
      hardness: 0.6,
      opacity: 1,
      colour: "#000000",
      background: "#ffffff",
      tolerance: 32,
      magneticWidth: 20,
      magneticContrast: 10,
      // Below Photoshop's 57, deliberately. An anchor is permanent, and the stretch
      // between the last one and the pointer is the part still being reconsidered --
      // so the default errs towards leaving more of the trace live and letting a click
      // be what commits it.
      magneticFrequency: 40,
      retouch: "blur",
      tone: "dodge",
      strength: 0.5,
      gradient: "linear",
      gradientFade: false,
      shapeKind: "rect",
      shapeStyle: "fill",
      strokeWidth: 4,
      fontSize: 72,
      fontFamily: "system-ui, sans-serif",
      bold: false,
      italic: false
    };
  }
  class StageTools {
    /**
     * @param options Tool wiring.
     */
    constructor(options) {
      this.tracking = false;
      this.onPointerDown = (event) => {
        const tool = this.options.getTool();
        if ("transform" === tool || "crop" === tool) {
          return;
        }
        if ("hand" === tool) {
          event.preventDefault();
          this.gesture.last = { x: event.clientX, y: event.clientY };
          this.listen();
          return;
        }
        const point = toCanvas(this.options, event);
        if (!point) {
          return;
        }
        event.preventDefault();
        const outcome = routePress(this.options, this.gesture, tool, point, event);
        this.syncMagnetic();
        if ("done" === outcome) {
          return;
        }
        if ("stroke" === outcome) {
          this.gesture.drawing = true;
          this.gesture.last = point;
          this.gesture.stroke.begin(tool);
          strokeDab(this.options, this.gesture, point, tool);
        }
        this.listen();
      };
      this.onTraceMove = (event) => {
        const stage = this.options.stage.getBoundingClientRect();
        if (event.clientX < stage.left || event.clientX > stage.right || event.clientY < stage.top || event.clientY > stage.bottom) {
          return;
        }
        const point = toCanvas(this.options, event);
        if (point) {
          moveMagnetic(this.options, this.gesture, point);
        }
      };
      this.onTraceDoubleClick = () => {
        this.closeShape();
      };
      this.onPointerMove = (event) => {
        const tool = this.options.getTool();
        if ("hand" === tool) {
          panBy(this.options, this.gesture, event);
          return;
        }
        const point = toCanvas(this.options, event);
        if (!point) {
          return;
        }
        if ("eyedropper" === tool) {
          pickColour(this.options, point);
          return;
        }
        if (this.gesture.dragFrom) {
          this.gesture.preview.update(event, previewShape(this.options, event));
          return;
        }
        if (this.gesture.selection.isDragging) {
          this.gesture.pendingSelection = this.gesture.selection.extend(
            normalise$1(this.options.getCanvas(), point),
            this.options.getSelectionShape()
          );
          this.options.previewSelection(this.gesture.pendingSelection);
          return;
        }
        continueStroke(this.options, this.gesture, point, tool);
      };
      this.onPointerUp = (event) => {
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.removeEventListener("pointercancel", this.onPointerUp);
        window.removeEventListener("blur", this.onPointerUp);
        const wasDrawing = this.gesture.drawing;
        const dragFrom = this.gesture.dragFrom;
        const wasSelecting = this.gesture.selection.isDragging;
        endGesture(this.gesture);
        if (wasSelecting) {
          this.options.commitSelection(
            this.gesture.pendingSelection,
            this.gesture.selectionMode
          );
          this.gesture.pendingSelection = null;
        }
        if (dragFrom && event instanceof PointerEvent) {
          commitRegion(this.options, dragFrom, event);
        }
        if (wasDrawing) {
          this.options.onStrokeEnd();
        }
      };
      this.options = options;
      this.gesture = newGesture(options);
      options.stage.addEventListener("pointerdown", this.onPointerDown);
    }
    /**
     * Follows the pointer while a magnetic trace is open, and stops when it closes.
     *
     * Called after anything that could have started or finished one. Idempotent, so
     * every caller can simply say "make this match" rather than knowing which of the two
     * just happened.
     *
     * The listener is on `window` rather than on the stage, because a trace is not a
     * drag: there is no button held, nothing has pointer capture, and a pointer crossing
     * the marquee overlay or a ruler would otherwise be lost mid-gesture.
     */
    syncMagnetic() {
      const wanted = this.gesture.magnetic.isTracing;
      if (wanted === this.tracking) {
        return;
      }
      this.tracking = wanted;
      if (wanted) {
        window.addEventListener("pointermove", this.onTraceMove);
        this.options.stage.addEventListener("dblclick", this.onTraceDoubleClick);
        return;
      }
      window.removeEventListener("pointermove", this.onTraceMove);
      this.options.stage.removeEventListener("dblclick", this.onTraceDoubleClick);
    }
    /** Starts tracking a drag on the window, so a release anywhere ends it. */
    listen() {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
      window.addEventListener("blur", this.onPointerUp);
    }
    /** Whether a polygon, a pen path or a magnetic trace is half-placed on the canvas. */
    get hasPath() {
      return this.gesture.selection.vertices.length > 0 || this.gesture.magnetic.isTracing;
    }
    /** Where the clone stamp is currently sampling from, if anywhere. */
    getCloneSource() {
      return this.gesture.cloneSource;
    }
    /** Offset from the stroke to the clone sample point, once a stroke fixed one. */
    getCloneOffset() {
      return this.gesture.stroke.getCloneOffset();
    }
    /** Forgets the clone sample point. */
    clearCloneSource() {
      this.gesture.cloneSource = null;
      this.gesture.stroke.setCloneOffset(null);
      this.options.onToolStateChange?.();
    }
    /**
     * Paints the placed path with the current colour and style.
     *
     * @return Whether anything was drawn.
     */
    commitPath() {
      if (!paintPath(this.options, this.gesture.selection.vertices)) {
        return false;
      }
      this.clearPath();
      return true;
    }
    /**
     * Closes whatever is being placed click by click, and folds it into the selection.
     *
     * A polygon marquee or a magnetic trace. Both are finished by an explicit "done"
     * rather than by a pointer release, and one method answers for both because the
     * keyboard, the options bar and a double-click all mean the same thing by it.
     *
     * @return Whether there was a shape worth closing.
     */
    closeShape() {
      if (this.gesture.magnetic.isTracing) {
        const closed = closeMagnetic(this.options, this.gesture);
        this.syncMagnetic();
        return closed;
      }
      const points = this.gesture.selection.vertices;
      if (points.length < 3) {
        this.clearPath();
        return false;
      }
      this.options.commitSelection(
        { shape: "polygon", points: [...points] },
        this.gesture.selectionMode
      );
      this.clearPath();
      return true;
    }
    /**
     * Takes back the last anchor of a magnetic trace.
     *
     * The trace's own undo, and deliberately not the editor's: nothing has been folded
     * into the selection yet, so there is no history entry to step back through, and
     * Backspace here has to mean "that anchor was in the wrong place" rather than "undo
     * whatever I did before I picked up this tool".
     *
     * @return Whether there was a trace to act on.
     */
    undoAnchor() {
      const acted = undoMagneticAnchor(this.options, this.gesture);
      this.syncMagnetic();
      return acted;
    }
    /** Abandons a half-placed polygon, pen path or magnetic trace, and takes it down. */
    clearPath() {
      this.gesture.selection.clear();
      this.gesture.magnetic.clear();
      this.gesture.pendingSelection = null;
      this.options.previewSelection(null);
      this.syncMagnetic();
    }
    /** Removes the listeners. */
    destroy() {
      this.onPointerUp();
      this.gesture.magnetic.clear();
      this.syncMagnetic();
      this.gesture.preview.destroy();
      this.options.stage.removeEventListener("pointerdown", this.onPointerDown);
    }
  }
  class TextEditor {
    constructor(options) {
      this.field = null;
      this.anchor = null;
      this.layerId = null;
      this.scale = { x: 1, y: 1 };
      this.pressingChrome = false;
      this.detachChrome = [];
      this.onInput = () => {
        this.resize();
      };
      this.onBlur = (event) => {
        if (this.pressingChrome || this.isChrome(event.relatedTarget)) {
          return;
        }
        this.commit();
      };
      this.onKeyDown = (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          this.cancel();
          return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          this.commit();
        }
      };
      this.restyle = () => {
        const field = this.field;
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!field || !this.anchor || !viewport || canvas.width < 1) {
          return;
        }
        const style = this.options.getStyle();
        const zoom = viewport.width / canvas.width;
        field.style.font = cssFont({
          size: Math.max(1, style.size * zoom * this.scale.x),
          family: style.family,
          colour: style.colour,
          bold: style.bold,
          italic: style.italic
        });
        field.style.lineHeight = "1.25";
        field.style.color = style.colour;
        field.style.insetInlineStart = `${viewport.x + this.anchor.x / canvas.width * viewport.width}px`;
        field.style.insetBlockStart = `${viewport.y + this.anchor.y / canvas.height * viewport.height}px`;
        this.resize();
      };
      this.options = options;
    }
    /** Whether something is being typed right now. */
    get isEditing() {
      return this.field !== null;
    }
    /** The layer being retyped, or null when the caret is over new text or closed. */
    get editingLayerId() {
      return this.field ? this.layerId : null;
    }
    /**
     * What a press on the canvas means while the text tool is active.
     *
     * One press does one thing. Clicking away from a caret finishes the text and stops
     * there -- it does not also start the next one, because "I am done writing this" and
     * "here is where the next paragraph goes" are two different intentions and a single
     * click cannot be both. Typing then clicking away would otherwise leave an empty
     * caret sitting wherever you happened to click to get rid of the last one.
     *
     * Press again and, with nothing being typed, a new caret opens where you clicked.
     *
     * @param point Canvas coordinates for the top-left of the first line.
     */
    place(point) {
      if (this.isEditing) {
        this.commit();
        return;
      }
      this.open(point);
    }
    /**
     * Opens a caret at a point on the canvas.
     *
     * Anything already being typed is committed first, so no caller can end up with two
     * carets open at once.
     *
     * @param point   Canvas coordinates for the top-left of the first line.
     * @param options Optional. Existing words to start from, and the layer they belong to.
     */
    open(point, options = {}) {
      this.commit();
      const field = document.createElement("textarea");
      field.className = "lz-text-editor";
      field.rows = 1;
      field.spellcheck = false;
      field.setAttribute("aria-label", "Text");
      field.value = options.initial ?? "";
      field.addEventListener("pointerdown", (event) => event.stopPropagation());
      field.addEventListener("input", this.onInput);
      field.addEventListener("keydown", this.onKeyDown);
      field.addEventListener("blur", this.onBlur);
      this.watchChrome();
      this.anchor = point;
      this.layerId = options.layerId ?? null;
      this.scale = options.scale ?? { x: 1, y: 1 };
      this.field = field;
      this.options.stage.appendChild(field);
      this.restyle();
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
      this.options.onStateChange?.();
    }
    /**
     * Whether an element belongs to the chrome that restyles rather than finishes.
     *
     * @param target What received focus.
     */
    isChrome(target) {
      return target instanceof Node && (this.options.chrome ?? []).some((host) => host.contains(target));
    }
    /** Notices presses on the chrome, so a blur they cause is not a commit. */
    watchChrome() {
      const down = () => {
        this.pressingChrome = true;
      };
      const up = () => {
        this.pressingChrome = false;
      };
      for (const host of this.options.chrome ?? []) {
        host.addEventListener("pointerdown", down, true);
        this.detachChrome.push(
          () => host.removeEventListener("pointerdown", down, true)
        );
      }
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", up, true);
      this.detachChrome.push(() => {
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", up, true);
      });
    }
    /** Sizes the field to its contents, in both directions. */
    resize() {
      const field = this.field;
      if (!field) {
        return;
      }
      field.style.blockSize = "auto";
      field.style.inlineSize = "0";
      field.style.inlineSize = `${field.scrollWidth + 4}px`;
      field.style.blockSize = `${field.scrollHeight}px`;
    }
    /**
     * Rasterises what was typed and closes the caret.
     *
     * Over an existing layer the commit always fires, even with the field emptied:
     * deleting every word of a text layer is how you delete the layer.
     */
    commit() {
      const field = this.field;
      const anchor = this.anchor;
      const layerId = this.layerId;
      if (!field || !anchor) {
        return;
      }
      const text = field.value;
      this.close();
      if (text.trim() || layerId) {
        this.options.onCommit(text, anchor, layerId);
      }
    }
    /** Closes the caret, discarding what was typed. */
    cancel() {
      this.close();
    }
    /** Removes the field. */
    close() {
      const field = this.field;
      this.field = null;
      this.anchor = null;
      this.layerId = null;
      this.scale = { x: 1, y: 1 };
      this.pressingChrome = false;
      for (const off of this.detachChrome) {
        off();
      }
      this.detachChrome = [];
      field?.remove();
      this.options.onStateChange?.();
    }
    /** Removes the editor entirely. */
    destroy() {
      this.close();
    }
  }
  const DEFAULT_FOREGROUND = "#000000";
  const DEFAULT_BACKGROUND = "#ffffff";
  const PALETTE = [
    "#000000",
    "#404040",
    "#808080",
    "#c0c0c0",
    "#ffffff",
    "#d63638",
    "#e06d1f",
    "#dba617",
    "#00a32a",
    "#2271b1",
    "#3858e9",
    "#8c1eb0"
  ];
  class Swatches {
    constructor(options) {
      this.popover = null;
      this.release = [];
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "lz-swatches";
      this.foreground = this.makeSwatch("colour", __("Foreground colour"));
      this.background = this.makeSwatch("background", __("Background colour"));
      this.swapButton = createIconButton({
        glyph: "⇄",
        label: __("Swap colours (X)"),
        className: "lz-swatches__action",
        onClick: () => this.swap()
      });
      this.resetButton = createIconButton({
        glyph: "◨",
        label: __("Reset to black and white (D)"),
        className: "lz-swatches__action",
        onClick: () => this.reset()
      });
      const stack = document.createElement("div");
      stack.className = "lz-swatches__stack";
      stack.append(this.foreground, this.background);
      this.el.append(stack, this.swapButton.el, this.resetButton.el);
      this.off = options.onColoursChange(() => this.sync());
      this.sync();
    }
    /**
     * Builds one swatch button.
     *
     * @param which Which colour it shows.
     * @param label Accessible name.
     */
    makeSwatch(which, label) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `lz-swatches__chip lz-swatches__chip--${which}`;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-haspopup", "dialog");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openPicker(which, button, label);
      });
      return button;
    }
    /**
     * Opens the colour picker for one swatch.
     *
     * @param which  Which colour is being edited.
     * @param anchor The swatch the popover hangs from.
     * @param label  Accessible name.
     */
    openPicker(which, anchor, label) {
      const already = this.popover?.dataset.which === which;
      this.closePicker();
      if (already) {
        return;
      }
      const popover = document.createElement("div");
      popover.className = "lz-swatch-popover";
      popover.dataset.which = which;
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-label", label);
      const field = createColourField({
        label,
        value: this.options.getColours()[which],
        onChange: (value) => {
          this.options.setColours({ [which]: value });
          this.sync();
        }
      });
      const palette = createSwatchGrid({
        label: __("Palette"),
        colours: PALETTE,
        value: this.options.getColours()[which],
        onChange: (colour) => {
          this.options.setColours({ [which]: colour });
          field.setValue(colour);
          palette.setValue(colour);
          this.sync();
        }
      });
      const done = createButton({
        label: __("Done"),
        variant: "secondary",
        onClick: () => this.closePicker()
      });
      popover.append(field.el, palette.el, done.el);
      floatingHost(anchor).appendChild(popover);
      positionFloating(popover, anchor, "block-end");
      this.popover = popover;
      this.release = [field.destroy, palette.destroy, done.destroy];
      const onAway = (event) => {
        if (event.target instanceof Node && !popover.contains(event.target)) {
          this.closePicker();
        }
      };
      const onKey = (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          this.closePicker();
        }
      };
      window.setTimeout(() => document.addEventListener("click", onAway), 0);
      popover.addEventListener("keydown", onKey);
      this.release.push(() => document.removeEventListener("click", onAway));
    }
    /** Closes the picker, if one is open. */
    closePicker() {
      for (const off of this.release) {
        off();
      }
      this.release = [];
      this.popover?.remove();
      this.popover = null;
    }
    /** Exchanges the two colours. */
    swap() {
      const { colour, background } = this.options.getColours();
      this.options.setColours({ colour: background, background: colour });
      this.sync();
    }
    /** Restores black on white. */
    reset() {
      this.options.setColours({
        colour: DEFAULT_FOREGROUND,
        background: DEFAULT_BACKGROUND
      });
      this.sync();
    }
    /** Repaints both chips from the current settings. */
    sync() {
      const { colour, background } = this.options.getColours();
      this.foreground.style.background = colour;
      this.background.style.background = background;
      this.foreground.title = `${__("Foreground colour")}: ${colour}`;
      this.background.title = `${__("Background colour")}: ${background}`;
    }
    /** Releases listeners. */
    destroy() {
      this.closePicker();
      this.swapButton.destroy();
      this.resetButton.destroy();
      this.off();
      this.el.remove();
    }
  }
  const TOOLS = [
    { id: "transform", glyph: "✥", label: "Move & transform", key: "v", group: 1 },
    { id: "select", glyph: "⬚", label: "Select", key: "m", group: 1 },
    { id: "wand", glyph: "✧", label: "Magic wand", key: "w", group: 1 },
    { id: "crop", glyph: "⌗", label: "Crop", key: "c", group: 1 },
    { id: "eyedropper", glyph: "⌖", label: "Eyedropper", key: "i", group: 2 },
    { id: "retouch", glyph: "◌", label: "Retouch", key: "r", group: 2 },
    { id: "clone", glyph: "⎗", label: "Clone stamp", key: "s", group: 2 },
    { id: "tone", glyph: "◐", label: "Dodge & burn", key: "o", group: 2 },
    { id: "brush", glyph: "✎", label: "Brush", key: "b", group: 3 },
    { id: "history", glyph: "↺", label: "History brush", key: "y", group: 3 },
    { id: "eraser", glyph: "◻", label: "Eraser", key: "e", group: 3 },
    { id: "fill", glyph: "◧", label: "Fill", key: "g", group: 3 },
    { id: "gradient", glyph: "▨", label: "Gradient", key: "n", group: 4 },
    { id: "shape", glyph: "▬", label: "Shape", key: "u", group: 4 },
    { id: "path", glyph: "✒", label: "Path", key: "p", group: 4 },
    { id: "text", glyph: "T", label: "Text", key: "t", group: 4 },
    { id: "hand", glyph: "☞", label: "Hand", key: "h", group: 5 },
    { id: "zoom", glyph: "⌕", label: "Zoom", key: "z", group: 5 }
  ];
  function buildToolGrid(onSelect) {
    const el = document.createElement("div");
    el.className = "lz-rail__grid";
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-orientation", "vertical");
    el.setAttribute("aria-label", __("Tools"));
    const buttons = /* @__PURE__ */ new Map();
    let group = TOOLS[0]?.group;
    let inGroup = 0;
    for (const tool of TOOLS) {
      if (tool.group !== group) {
        if (1 === inGroup % 2) {
          el.appendChild(filler("lz-rail__spacer"));
        }
        el.appendChild(filler("lz-rail__rule"));
        group = tool.group;
        inGroup = 0;
      }
      inGroup++;
      const button = createIconButton({
        glyph: tool.glyph,
        label: `${__(tool.label)} (${tool.key.toUpperCase()})`,
        className: "lz-rail__button",
        onClick: () => onSelect(tool.id)
      });
      button.el.setAttribute("aria-pressed", "false");
      buttons.set(tool.id, button);
      el.appendChild(button.el);
    }
    return { el, buttons };
  }
  function filler(className) {
    const el = document.createElement("span");
    el.className = className;
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  class ToolMenu {
    /**
     * @param options Menu configuration.
     */
    constructor(options) {
      this.el = null;
      this.detachAway = null;
      this.options = options;
    }
    /** Shows the list, or hides it if it is already up. */
    toggle() {
      if (this.el) {
        this.close();
        return;
      }
      this.open();
    }
    /** Builds and places the list. */
    open() {
      const menu = document.createElement("div");
      menu.className = "lz-rail-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", __("All tools"));
      for (const tool of TOOLS) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "lz-rail-menu__item";
        item.setAttribute("role", "menuitem");
        const glyph = document.createElement("span");
        glyph.className = "lz-rail-menu__glyph";
        glyph.textContent = tool.glyph;
        const name = document.createElement("span");
        name.textContent = __(tool.label);
        const key = document.createElement("kbd");
        key.textContent = tool.key.toUpperCase();
        item.append(glyph, name, key);
        item.addEventListener("click", () => {
          this.options.onSelect(tool.id);
          this.close();
        });
        menu.appendChild(item);
      }
      floatingHost(this.options.within).appendChild(menu);
      positionFloating(menu, this.options.anchor, "inline-end");
      this.el = menu;
      this.watchForClickAway(menu);
    }
    /**
     * Closes the menu when the next click lands outside it.
     *
     * @param menu The open menu.
     */
    watchForClickAway(menu) {
      const onAway = (event) => {
        if (event.target instanceof Node && !menu.contains(event.target) && !this.options.anchor.contains(event.target)) {
          this.close();
        }
      };
      window.setTimeout(() => document.addEventListener("click", onAway), 0);
      this.detachAway = () => document.removeEventListener("click", onAway);
    }
    /** Removes the tool list. */
    close() {
      this.detachAway?.();
      this.detachAway = null;
      this.el?.remove();
      this.el = null;
    }
  }
  function attachToolShortcuts(options, swatches, onModes) {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const actions = {
        x: () => swatches.swap(),
        d: () => swatches.reset(),
        q: () => {
          options.setQuickMask(!options.getQuickMask());
          onModes();
        },
        f: () => {
          options.setFullScreen(!options.getFullScreen());
          onModes();
        }
      };
      if (actions[key]) {
        event.preventDefault();
        actions[key]();
        return;
      }
      const match = TOOLS.find((tool) => tool.key === key);
      if (match) {
        event.preventDefault();
        options.onSelect(match.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }
  class ToolRail {
    constructor(options) {
      this.detach = [];
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "lz-rail";
      const grid = buildToolGrid(options.onSelect);
      this.buttons = grid.buttons;
      this.overflow = createIconButton({
        glyph: "⋯",
        label: __("All tools"),
        className: "lz-rail__button",
        onClick: () => this.menu.toggle()
      });
      grid.el.appendChild(this.overflow.el);
      this.menu = new ToolMenu({
        anchor: this.overflow.el,
        within: this.el,
        onSelect: options.onSelect
      });
      this.swatches = new Swatches(options);
      this.quickMask = createIconButton({
        glyph: "◍",
        label: __("Quick mask: show the selection as a red overlay (Q)"),
        className: "lz-rail__mode",
        onClick: () => {
          options.setQuickMask(!options.getQuickMask());
          this.syncModes();
        }
      });
      this.fullScreen = createIconButton({
        glyph: "⛶",
        label: __("Full screen (F)"),
        className: "lz-rail__mode",
        onClick: () => {
          options.setFullScreen(!options.getFullScreen());
          this.syncModes();
        }
      });
      const modes = document.createElement("div");
      modes.className = "lz-rail__modes";
      modes.setAttribute("role", "group");
      modes.setAttribute("aria-label", __("Screen modes"));
      modes.append(this.quickMask.el, this.fullScreen.el);
      this.el.append(grid.el, this.swatches.el, modes);
      this.detach.push(
        attachToolShortcuts(options, this.swatches, () => this.syncModes())
      );
      this.sync(options.getActive());
    }
    /**
     * Marks the active tool.
     *
     * @param active Tool now in use.
     */
    sync(active2) {
      for (const [id, button] of this.buttons) {
        button.setPressed(id === active2);
      }
      this.swatches.sync();
      this.syncModes();
    }
    /** Marks the quick-mask and full-screen toggles. */
    syncModes() {
      this.quickMask.setPressed(this.options.getQuickMask());
      this.fullScreen.setPressed(this.options.getFullScreen());
    }
    /** Removes the rail and its shortcuts. */
    destroy() {
      for (const off of this.detach) {
        off();
      }
      this.detach = [];
      this.menu.close();
      for (const button of this.buttons.values()) {
        button.destroy();
      }
      this.buttons.clear();
      this.overflow.destroy();
      this.quickMask.destroy();
      this.fullScreen.destroy();
      this.swatches.destroy();
      this.el.remove();
    }
  }
  class StageToolset {
    /**
     * @param options Toolset configuration.
     */
    constructor(options) {
      this.redraw = () => {
        this.rulers.draw();
        this.cursor.draw();
        this.text.restyle();
      };
      const { frame } = options;
      this.rail = new ToolRail(options.rail);
      options.body.prepend(this.rail.el);
      frame.stage.dataset.tool = frame.getTool();
      this.rulers = new Rulers({
        stage: frame.stage,
        getViewport: frame.getViewport,
        getCanvas: frame.getCanvas
      });
      this.optionsBar = new OptionsBar({
        ...options.optionsBar,
        getTool: frame.getTool
      });
      options.optionsHost.appendChild(this.optionsBar.el);
      this.tools = new StageTools({
        ...options.tools,
        stage: frame.stage,
        getViewport: frame.getViewport,
        getCanvas: frame.getCanvas,
        getTool: frame.getTool,
        getBrush: frame.getBrush
      });
      this.text = new TextEditor({
        ...options.text,
        stage: frame.stage,
        getViewport: frame.getViewport,
        getCanvas: frame.getCanvas
      });
      this.cursor = new BrushCursor({
        stage: frame.stage,
        getViewport: frame.getViewport,
        getCanvas: frame.getCanvas,
        getTool: frame.getTool,
        getBrush: frame.getBrush,
        getCloneSource: () => this.tools.getCloneSource(),
        getCloneOffset: () => this.tools.getCloneOffset()
      });
    }
    /**
     * Shows or hides the rulers.
     *
     * @param visible Whether the rulers are on.
     */
    setRulersVisible(visible) {
      this.rulers.setVisible(visible);
    }
    /** Releases every widget. */
    destroy() {
      this.tools.destroy();
      this.rail.destroy();
      this.optionsBar.destroy();
      this.rulers.destroy();
      this.cursor.destroy();
      this.text.destroy();
    }
  }
  const MAX_SELECTION_HISTORY = 20;
  const SELECT_ALL = {
    shape: "rect",
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ]
  };
  class SelectionOverlay {
    /**
     * @param options Overlay configuration.
     */
    constructor(options) {
      this.selection = null;
      this.pending = null;
      this.past = [];
      this.anchors = [];
      this.sync = () => {
        const viewport = this.options.getViewport();
        if (!this.selection && !this.pending || !viewport) {
          this.svg.style.display = "none";
          this.paint("lz-selection__", "");
          this.paint("lz-selection__pending-", "");
          this.mark("auto", "");
          this.mark("manual", "");
          return;
        }
        this.svg.style.display = "";
        this.svg.style.insetInlineStart = `${viewport.x}px`;
        this.svg.style.insetBlockStart = `${viewport.y}px`;
        this.svg.setAttribute("width", String(viewport.width));
        this.svg.setAttribute("height", String(viewport.height));
        this.paint("lz-selection__", this.outline(this.selection, viewport));
        this.paint("lz-selection__pending-", this.outline(this.pending, viewport));
        for (const kind of ["auto", "manual"]) {
          const of = this.anchors.filter(
            (anchor) => anchor.manual === ("manual" === kind)
          );
          this.mark(
            kind,
            anchorMarks(
              of,
              viewport.width,
              viewport.height,
              "manual" === kind ? 9 : 6
            )
          );
        }
      };
      this.options = options;
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.svg.setAttribute("class", "lz-selection");
      this.svg.setAttribute("aria-hidden", "true");
      for (const cls of [
        "lz-selection__under",
        "lz-selection__over",
        "lz-selection__pending-under",
        "lz-selection__pending-over",
        "lz-selection__anchor-auto",
        "lz-selection__anchor-manual"
      ]) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", cls);
        this.svg.appendChild(path);
      }
      options.stage.appendChild(this.svg);
      this.sync();
    }
    /** The current marquee, or null. */
    get current() {
      return this.selection;
    }
    /** Whether anything is selected. */
    get isActive() {
      return null !== this.selection;
    }
    /** Whether there is an earlier selection to go back to. */
    get canStepBack() {
      return this.past.length > 0;
    }
    /**
     * Replaces the marquee and rebuilds the mask.
     *
     * @param selection Selection, or null to clear it.
     */
    set(selection) {
      const next = isEmptySelection(selection) ? null : selection;
      if (next !== this.selection) {
        this.remember(this.selection);
      }
      this.apply(selection);
    }
    /**
     * Puts the selection back as it was before the last change.
     *
     * A selection is not on the undo stack, deliberately: it describes how someone is
     * working rather than what the picture should look like, and an undo that stepped
     * through six marquees before reaching the brush stroke you meant would be worse
     * than no undo at all. But an addition made in the wrong mode is a real and common
     * mistake, and "draw the whole thing again" is a poor answer to it -- so the
     * marquee keeps its own short history, reached by its own key.
     *
     * It doubles as Reselect: dropping a selection is a change like any other, so
     * stepping back from nothing restores what was there.
     *
     * @return Whether there was anything to go back to.
     */
    stepBack() {
      const previous = this.past.pop();
      if (void 0 === previous) {
        return false;
      }
      this.apply(previous);
      return true;
    }
    /**
     * Files the selection being replaced, so it can be stepped back to.
     *
     * Bounded, because these are paths and a magnetic trace carries six hundred points:
     * an unbounded ring would hold every selection made in a session for the sake of
     * the two anyone ever reaches for.
     *
     * @param selection Selection about to be replaced.
     */
    remember(selection) {
      this.past.push(selection);
      if (this.past.length > MAX_SELECTION_HISTORY) {
        this.past.shift();
      }
    }
    /**
     * Puts a selection in place, with no note of what was there before.
     *
     * @param selection Selection, or null to clear it.
     */
    apply(selection) {
      this.selection = isEmptySelection(selection) ? null : selection;
      this.pending = null;
      this.anchors = [];
      const canvas = this.options.getCanvas();
      this.options.setMask(
        buildSelectionMask(this.selection, canvas.width, canvas.height)
      );
      this.sync();
      this.options.onChange();
    }
    /**
     * Shows a region being drawn, without committing it.
     *
     * No mask is built and no listener is told: this is an outline following a pointer,
     * and nothing downstream of the selection has changed yet.
     *
     * @param selection Region in progress, or null to take the outline down.
     */
    setPending(selection) {
      this.pending = selection;
      this.sync();
    }
    /**
     * Marks the points a magnetic trace has committed to.
     *
     * @param anchors Anchors to mark. Empty takes the marks down.
     */
    setAnchors(anchors) {
      if (0 === anchors.length && 0 === this.anchors.length) {
        return;
      }
      this.anchors = anchors;
      this.sync();
    }
    /**
     * Folds a finished region into the selection.
     *
     * @param selection Region just drawn, or null when the gesture produced nothing.
     * @param mode      What that region does to the selection already in place.
     */
    combine(selection, mode) {
      this.set(
        combineSelections(
          this.selection,
          selection,
          mode,
          this.options.getCanvas(),
          this.options.maxRasterPixels
        )
      );
    }
    /** Selects the whole canvas. */
    selectAll() {
      this.set({ ...SELECT_ALL });
    }
    /**
     * Writes the anchor marks of one kind.
     *
     * @param kind Which set.
     * @param d    Path data.
     */
    mark(kind, d) {
      this.svg.querySelector(`.lz-selection__anchor-${kind}`)?.setAttribute("d", d);
    }
    /**
     * One selection as path data, or nothing when there is none.
     *
     * @param selection Selection to draw, or null.
     * @param viewport  Where the canvas sits.
     */
    outline(selection, viewport) {
      return selection ? selectionToPath(selection, viewport.width, viewport.height) : "";
    }
    /**
     * Writes one path into both strokes of an outline.
     *
     * @param prefix Class prefix identifying which outline.
     * @param d      Path data.
     */
    paint(prefix, d) {
      for (const suffix of ["under", "over"]) {
        this.svg.querySelector(`.${prefix}${suffix}`)?.setAttribute("d", d);
      }
    }
    /** Takes the outline off the stage. */
    destroy() {
      this.svg.remove();
    }
  }
  class EditorClipboard {
    /**
     * @param options Clipboard configuration.
     */
    constructor(options) {
      this.held = null;
      this.options = options;
    }
    /** Whether there is anything to paste. */
    get hasContent() {
      return null !== this.held;
    }
    /**
     * Copies the selected region of the composed document.
     */
    copy() {
      const { store } = this.options;
      const pixels = this.options.getPixels();
      const selection = this.options.getSelection();
      if (!selection || !pixels) {
        toast(__("Select an area first."), "info");
        return;
      }
      const canvas = store.current.canvas;
      const bounds = selectionBounds(selection);
      const origin = { x: bounds.x * canvas.width, y: bounds.y * canvas.height };
      const copied = pixels.extractRegion(
        origin.x,
        origin.y,
        bounds.w * canvas.width,
        bounds.h * canvas.height
      );
      if (!copied) {
        toast(__("Nothing to copy."), "error");
        return;
      }
      clipToSelection(copied, selection, canvas, origin);
      this.held = copied;
      toast(__("Copied."), "success");
    }
    /**
     * Pastes the held pixels as a new layer.
     */
    paste() {
      const { store } = this.options;
      const pixels = this.options.getPixels();
      const source = this.held;
      if (!source || !pixels) {
        toast(__("Nothing to paste."), "info");
        return;
      }
      const selection = this.options.getSelection();
      const bounds = selection ? selectionBounds(selection) : null;
      const layer = createRasterLayer(__("Pasted"), {
        x: bounds ? bounds.x + bounds.w / 2 : 0.5,
        y: bounds ? bounds.y + bounds.h / 2 : 0.5
      });
      pixels.addRasterTexture(layer.id, source);
      store.setLayers([...store.current.layers, layer], layer.id);
      this.options.onPaste();
      toast(__("Pasted as a new layer."), "success");
    }
  }
  function paintTarget(store, renderer) {
    const recipe = store.current;
    const active2 = recipe.layers.find((layer2) => layer2.id === recipe.activeLayerId);
    if (active2 && isPaintSheet(store, renderer, active2.id)) {
      return active2.id;
    }
    const existing = recipe.layers.find(
      (layer2) => "raster" === layer2.kind && isPaintSheet(store, renderer, layer2.id)
    );
    if (existing) {
      return existing.id;
    }
    const layer = createRasterLayer(__("Paint"));
    renderer?.ensurePaintTexture(layer.id);
    store.setLayers([...recipe.layers, layer], layer.id, false);
    return layer.id;
  }
  function isPaintSheet(store, renderer, layerId) {
    const recipe = store.current;
    const layer = recipe.layers.find((entry) => entry.id === layerId);
    if (!layer || "raster" !== layer.kind || !renderer) {
      return false;
    }
    const size = renderer.layerTextureSize(layerId);
    return 0 === size.width || size.width === recipe.canvas.width && size.height === recipe.canvas.height;
  }
  function wireSelection(editor) {
    const overlay = new SelectionOverlay({
      stage: editor.shell.stage,
      getViewport: () => editor.renderer?.view.viewport() ?? null,
      getCanvas: () => editor.store.current.canvas,
      setMask: (mask) => editor.renderer?.paint.setPaintMask(mask),
      onChange: () => editor.stage?.optionsBar.render(),
      maxRasterPixels: editor.config.maxSelectionPixels
    });
    editor.selection = overlay;
    editor.clipboard = new EditorClipboard({
      store: editor.store,
      getPixels: () => clipboardPixels(editor),
      getSelection: () => overlay.current,
      onPaste: () => editor.state.setTool("transform")
    });
    return overlay;
  }
  function buildStageToolset(editor) {
    const renderer = editor.renderer;
    const { state: state2, store, shell: shell2 } = editor;
    const selection = wireSelection(editor);
    const ctx = panelContext(editor);
    const toolset = new StageToolset({
      frame: {
        stage: shell2.stage,
        getViewport: () => renderer.view.viewport(),
        getCanvas: () => store.current.canvas,
        getTool: () => state2.getTool(),
        getBrush: () => state2.getBrush()
      },
      body: shell2.root.querySelector(".lz-body") ?? shell2.root,
      optionsHost: shell2.options,
      rail: {
        getActive: () => state2.getTool(),
        onSelect: (tool) => state2.setTool(tool),
        getColours: () => ({
          colour: state2.getBrush().colour,
          background: state2.getBrush().background
        }),
        setColours: (patch) => state2.setBrush(patch),
        onColoursChange: (listener) => state2.brushes.add(() => listener()),
        getQuickMask: () => state2.getQuickMask(),
        setQuickMask: (on) => state2.setQuickMask(on),
        getFullScreen: () => state2.getFullScreen(),
        setFullScreen: (on) => state2.setFullScreen(on)
      },
      optionsBar: {
        ctx,
        getSelectionShape: () => editor.selectionShape,
        setSelectionShape: (shape) => {
          editor.selectionShape = shape;
          shell2.stage.dataset.shape = shape;
          toolset.tools.clearPath();
        },
        getSelectionMode: () => editor.selectionMode,
        setSelectionMode: (mode) => {
          editor.selectionMode = mode;
        },
        hasSelection: () => selection.isActive,
        deselect: () => {
          toolset.tools.clearPath();
          selection.set(null);
        },
        selectAll: () => selection.selectAll(),
        canStepSelectionBack: () => selection.canStepBack,
        stepSelectionBack: () => void selection.stepBack(),
        hasCloneSource: () => !!toolset.tools.getCloneSource(),
        clearCloneSource: () => toolset.tools.clearCloneSource(),
        isTypingText: () => true === toolset.text.isEditing,
        setZoom: (mode) => {
          if ("fit" === mode) {
            renderer.view.reset();
          } else {
            renderer.view.zoomToActual();
          }
        }
      },
      tools: {
        setBrush: (patch) => state2.setBrush(patch),
        getTargetLayerId: () => paintTarget(store, renderer.paint),
        stamp: (id, image, x, y, size, colour, opacity, erase) => {
          editor.strokes?.capture(id, dabRegion(x, y, size));
          renderer.paint.stampBrush(id, image, x, y, size, colour, opacity, erase);
        },
        fillMask: (id, mask, colour, opacity, origin) => {
          editor.strokes?.capture(id, {
            x: origin.x,
            y: origin.y,
            width: mask.width,
            height: mask.height
          });
          renderer.paint.fillWithMask(id, mask, colour, opacity, origin.x, origin.y);
        },
        composite: (id, source, x, y, opacity) => {
          editor.strokes?.capture(id, {
            x,
            y,
            width: source.width,
            height: source.height
          });
          renderer.paint.compositeCanvas(id, source, x, y, opacity);
        },
        readDocument: () => renderer.pixels.readPixels(),
        readPristine: () => renderer.readPristinePixels(),
        getSelectionShape: () => editor.selectionShape,
        getSelectionMode: () => editor.selectionMode,
        previewSelection: (next) => selection.setPending(next),
        previewAnchors: (anchors) => selection.setAnchors(anchors),
        commitSelection: (next, mode) => selection.combine(next, mode),
        pan: (dx, dy) => renderer.view.pan(dx, dy),
        zoomAt: (factor, x, y) => renderer.view.zoomAt(factor, x, y),
        // The clone sample marker reads the same state, so it redraws here too.
        onToolStateChange: () => {
          toolset.optionsBar.render();
          toolset.cursor.draw();
        },
        // `place()` rather than `open()`: a press that finishes one piece of text
        // does not also begin the next one. A press on text that already exists
        // reopens it instead -- text is an object, and clicking an object with the
        // tool that made it is how you get back into it.
        onPlaceText: (point) => {
          if (toolset.text.isEditing) {
            toolset.text.place(point);
            return;
          }
          const hit = hitTextLayer(store.current, renderer.paint, point);
          if (hit && editor.editText(hit.id)) {
            return;
          }
          toolset.text.place(point);
        },
        maxEdgePixels: editor.config.maxEdgePixels,
        // One history entry per stroke, not per dab -- and it carries the tiles the
        // stroke overwrote, so undoing it puts the pixels back rather than
        // restoring an identical recipe and appearing to do nothing. The stroke is
        // closed first, so the layer holds its final pixels before they are filed.
        onStrokeEnd: () => {
          renderer.paint.endStroke();
          void editor.strokes?.commit();
        }
      },
      text: {
        getStyle: () => {
          const brush = state2.getBrush();
          return {
            size: brush.fontSize,
            family: brush.fontFamily,
            colour: brush.colour,
            bold: brush.bold,
            italic: brush.italic
          };
        },
        onCommit: (text, point, layerId) => {
          const changed = layerId ? editor.replaceText(layerId, text, point) : editor.drawText(text, point);
          if (!changed) {
            return;
          }
          state2.setTool("transform");
        },
        // The controls that restyle the text live here; a click on them must not
        // finish it. The top bar's own actions are deliberately left out: pressing
        // Save should commit the caret first, so the render carries the words.
        chrome: [shell2.options, shell2.sidebar],
        onStateChange: () => {
          if (!toolset.text.isEditing) {
            renderer.hideLayer(null);
          }
          toolset.optionsBar.render();
        }
      }
    });
    const onDoubleClick = (event) => {
      if ("transform" !== state2.getTool() || toolset.text.isEditing) {
        return;
      }
      const viewport = renderer.view.viewport();
      const canvas = store.current.canvas;
      const rect = shell2.stage.getBoundingClientRect();
      const hit = viewport && viewport.width > 0 ? hitTextLayer(store.current, renderer.paint, {
        x: (event.clientX - rect.left - viewport.x) / viewport.width * canvas.width,
        y: (event.clientY - rect.top - viewport.y) / viewport.height * canvas.height
      }) : null;
      const layer = hit ?? findLayer(store.current.layers, store.current.activeLayerId);
      if (layer?.text && editor.editText(layer.id)) {
        event.preventDefault();
      }
    };
    shell2.stage.addEventListener("dblclick", onDoubleClick);
    editor.onTeardown(() => shell2.stage.removeEventListener("dblclick", onDoubleClick));
    toolset.setRulersVisible(state2.getView().rulers);
    shell2.stage.classList.toggle("has-rulers", state2.getView().rulers);
    shell2.stage.dataset.shape = editor.selectionShape;
    editor.onTeardown(
      renderer.view.onChange(toolset.redraw),
      renderer.view.onChange(selection.sync),
      state2.brushes.add(toolset.cursor.draw),
      state2.brushes.add(toolset.text.restyle),
      state2.tools.add(toolset.cursor.draw)
    );
    return toolset;
  }
  function clipboardPixels(editor) {
    const renderer = editor.renderer;
    if (!renderer) {
      return null;
    }
    return {
      extractRegion: (x, y, width, height) => renderer.pixels.extractRegion(x, y, width, height),
      addRasterTexture: (id, source) => renderer.paint.addRasterTexture(id, source)
    };
  }
  async function bootEditor(editor) {
    try {
      editor.payload = await editor.client.getMedia(editor.options.attachmentId);
      if (editor.isDestroyed) {
        return;
      }
      editor.store.load(
        validateRecipe(editor.payload.recipe, editor.payload.schema),
        editor.payload.schema
      );
      editor.shell.setStatus(__("Decoding image…"));
      editor.loaded = await loadSourceImage(editor.payload, editor.client);
      if (editor.isDestroyed) {
        editor.loaded.release();
        return;
      }
      editor.shell.setStatus(__("Starting the renderer…"));
      await startRenderer(editor);
    } catch (error) {
      fail(editor, error);
    } finally {
      editor.options.onReady?.(editor.payload);
    }
  }
  async function startRenderer(editor) {
    const payload = editor.payload;
    const renderer = await EditorRenderer.create({
      host: editor.shell.stage,
      maxRenderPixels: editor.config.maxRenderPixels,
      schema: payload.schema,
      backend: editor.config.renderer
    });
    if (editor.isDestroyed) {
      renderer.destroy();
      return;
    }
    editor.renderer = renderer;
    renderer.setImage(editor.loaded.image);
    const stored = editor.store.current;
    const canvas = stored.canvas.width > 0 && stored.canvas.height > 0 ? stored.canvas : renderer.imageSize;
    editor.store.replace({ ...stored, canvas }, "document");
    editor.strokes = new StrokeRecorder(editor.store, renderer.paint);
    await restoreLayers(editor);
    if (editor.isDestroyed) {
      return;
    }
    editor.onTeardown(
      editor.store.subscribe((recipe, scope) => {
        retainTextures(renderer, editor.store.states);
        pushToRenderer(renderer, recipe, scope);
        editor.syncToolbar();
      }),
      renderer.view.onChange(
        () => editor.shell.syncBackdrop(renderer.view.viewport())
      ),
      attachPasteboard(editor.shell.stage, () => editor.renderer?.view ?? null)
    );
    editor.shell.syncBackdrop(renderer.view.viewport());
    editor.stage = buildStageToolset(editor);
    editor.shell.clearStatus();
    buildSidebar(editor);
    pushToRenderer(renderer, editor.store.current, "all");
    editor.syncToolbar();
    editor.onTeardown(attachEditorShortcuts(shortcutTarget(editor)));
    if (editor.options.host !== "window") {
      editor.onTeardown(attachFileDrop(editor.shell.stage, (dropped) => {
        void editor.addImageLayer(dropped);
      }));
    }
    editor.shell.setTitle(payload.title);
  }
  async function restoreLayers(editor) {
    const renderer = editor.renderer;
    const stored = editor.payload?.layers ?? {};
    const recipe = editor.store.current;
    const failed = [];
    let restoring = false;
    for (const layer of recipe.layers) {
      if ("text" === layer.kind) {
        rasteriseTextLayer(renderer.paint, layer);
        continue;
      }
      const url = "raster" === layer.kind ? stored[layer.id] : void 0;
      if (!url) {
        continue;
      }
      if (!restoring) {
        restoring = true;
        editor.shell.setStatus(__("Restoring layers…"));
      }
      try {
        const loaded = await loadImageBlob(await editor.client.getBlob(url));
        if (editor.isDestroyed) {
          loaded.release();
          return;
        }
        renderer.paint.addRasterTexture(layer.id, loaded.image);
        loaded.release();
      } catch {
        failed.push(layer.name);
      }
    }
    if (failed.length > 0) {
      toast(
        sprintf(
          /* translators: %s: comma-separated layer names. */
          __("Some layers could not be restored: %s"),
          failed.join(", ")
        ),
        "error"
      );
    }
  }
  function buildSidebar(editor) {
    registerBuiltInPanels();
    editor.panelHost = new PanelHost(
      editor.shell.sidebar,
      panelContext(editor),
      () => editor.shell.setSidebarOpen(false)
    );
    editor.shell.restoreSidebar();
  }
  function fail(editor, error) {
    const message = error instanceof Error ? error.message : __("The image could not be opened.");
    editor.shell.setError(message);
    toast(message, "error");
  }
  function editorDebug(editor) {
    return {
      renderer: editor.renderer?.debugState() ?? null,
      activeTool: editor.state.getTool(),
      selection: editor.selection?.current ?? null,
      hasClipboard: true === editor.clipboard?.hasContent,
      recipeLayers: editor.store.current.layers.map((layer) => ({
        id: layer.id,
        kind: layer.kind
      })),
      activeLayerId: editor.store.current.activeLayerId
    };
  }
  function activeLayerSize(editor) {
    const size = editor.renderer?.paint.layerTextureSize(editor.store.current.activeLayerId);
    if (size && size.width > 0) {
      return size;
    }
    return editor.renderer?.imageSize ?? { width: 0, height: 0 };
  }
  function toolbarState(editor, busy) {
    return {
      canUndo: editor.store.canUndo,
      canRedo: editor.store.canRedo,
      identity: editor.store.isIdentity(editor.renderer?.imageSize),
      ready: !busy && null !== editor.renderer,
      canSave: true === editor.payload?.canSave
    };
  }
  const VIEW_KEY = "lienzo.view.v1";
  const SIDEBAR_KEY = "lienzo.sidebar.v1";
  function readViewPrefs() {
    try {
      const raw = window.localStorage.getItem(VIEW_KEY);
      if (!raw) {
        return { rulers: true, snapping: true };
      }
      const stored = JSON.parse(raw);
      return {
        rulers: false !== stored.rulers,
        snapping: false !== stored.snapping
      };
    } catch {
      return { rulers: true, snapping: true };
    }
  }
  function writeViewPrefs(prefs) {
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify(prefs));
    } catch {
    }
  }
  function readSidebarOpen() {
    try {
      return "closed" !== window.localStorage.getItem(SIDEBAR_KEY);
    } catch {
      return true;
    }
  }
  function writeSidebarOpen(open2) {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, open2 ? "open" : "closed");
    } catch {
    }
  }
  class Subscribers {
    constructor() {
      this.listeners = /* @__PURE__ */ new Set();
    }
    /**
     * Adds a listener.
     *
     * @param listener Called on every emit.
     * @return Unsubscribe function.
     */
    add(listener) {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
    /**
     * Calls every listener.
     *
     * Iterated over a copy, so a listener that unsubscribes itself mid-emit cannot
     * make the set skip the one after it.
     *
     * @param args What to pass them.
     */
    emit(...args) {
      for (const listener of [...this.listeners]) {
        listener(...args);
      }
    }
    /** Drops every listener. */
    clear() {
      this.listeners.clear();
    }
  }
  class EditorUiState {
    /**
     * @param effects What each change has to do outside this object.
     */
    constructor(effects) {
      this.tools = new Subscribers();
      this.brushes = new Subscribers();
      this.tool = "transform";
      this.brush = defaultBrush();
      this.view = readViewPrefs();
      this.mask = false;
      this.expanded = false;
      this.effects = effects;
    }
    /** Which tool owns the stage. */
    getTool() {
      return this.tool;
    }
    /**
     * Hands the stage to a tool.
     *
     * @param tool Tool to activate.
     */
    setTool(tool) {
      if (this.tool === tool) {
        return;
      }
      const previous = this.tool;
      this.tool = tool;
      this.effects.onToolChange(previous);
      this.tools.emit(tool);
    }
    /** The shared brush settings. */
    getBrush() {
      return this.brush;
    }
    /**
     * Changes the shared brush settings.
     *
     * @param patch Fields to change.
     */
    setBrush(patch) {
      this.brush = { ...this.brush, ...patch };
      this.brushes.emit(this.brush);
    }
    /** Rulers and snapping. */
    getView() {
      return this.view;
    }
    /**
     * Changes a view preference.
     *
     * @param patch Fields to change.
     */
    setView(patch) {
      this.view = { ...this.view, ...patch };
      writeViewPrefs(this.view);
      this.effects.onViewChange(this.view);
    }
    /** Whether the selection is shown as a red overlay. */
    getQuickMask() {
      return this.mask;
    }
    /**
     * Shows or hides the selection as a red overlay.
     *
     * @param on Whether to show it.
     */
    setQuickMask(on) {
      this.mask = on;
      this.effects.onQuickMaskChange(on);
    }
    /** Whether the editor fills the screen. */
    getFullScreen() {
      return this.expanded;
    }
    /**
     * Expands the editor to fill the screen, or gives the space back.
     *
     * @param on Whether to fill the screen.
     */
    setFullScreen(on) {
      this.expanded = on;
      this.effects.onFullScreenChange(on);
    }
    /** Drops every listener. */
    clear() {
      this.tools.clear();
      this.brushes.clear();
    }
  }
  function stateEffects(editor) {
    return {
      onToolChange: (previous) => onToolChange(editor, previous),
      onViewChange: (view) => {
        editor.stage?.setRulersVisible(view.rulers);
        editor.shell.stage.classList.toggle("has-rulers", view.rulers);
        editor.renderer?.view.fit();
      },
      onQuickMaskChange: (on) => {
        editor.shell.stage.classList.toggle("is-quick-mask", on);
        editor.selection?.sync();
      },
      onFullScreenChange: (on) => setFullScreen(editor, on)
    };
  }
  function onToolChange(editor, previous) {
    if ("text" === previous) {
      editor.stage?.text.commit();
    }
    if ("select" === previous || "path" === previous) {
      editor.stage?.tools.clearPath();
    }
    const tool = editor.state.getTool();
    editor.stage?.rail.sync(tool);
    editor.stage?.optionsBar.render();
    editor.shell.stage.dataset.tool = tool;
  }
  function setFullScreen(editor, on) {
    const root = editor.shell.root;
    root.classList.toggle("is-full-screen", on);
    if (on && root.requestFullscreen) {
      void root.requestFullscreen().catch(() => {
      });
    } else if (!on && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
      });
    }
    editor.renderer?.view.fit();
  }
  const DROP_FIT = 0.8;
  async function addImageLayer(target, dropped) {
    const renderer = target.renderer;
    if (!renderer) {
      return false;
    }
    let resolved;
    try {
      resolved = await resolveDroppedImage(dropped, target.client);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : __("That image could not be added."),
        "error"
      );
      return false;
    }
    if (!resolved) {
      return false;
    }
    if (target.isDestroyed()) {
      resolved.release();
      return false;
    }
    const recipe = target.store.current;
    const canvas = recipe.canvas;
    const { image } = resolved;
    const scale = Math.min(
      1,
      canvas.width * DROP_FIT / Math.max(image.naturalWidth, 1),
      canvas.height * DROP_FIT / Math.max(image.naturalHeight, 1)
    );
    const at = canvasPointFromClient(target, dropped.clientX, dropped.clientY);
    const layer = createRasterLayer(resolved.title || __("Image"), {
      x: at.x,
      y: at.y,
      scaleX: scale,
      scaleY: scale
    });
    renderer.addRasterTexture(layer.id, image);
    target.store.setLayers([...recipe.layers, layer], layer.id);
    resolved.release();
    target.setActiveTool("transform");
    toast(__("Added as a new layer."), "success");
    return true;
  }
  function canvasPointFromClient(target, clientX, clientY) {
    const viewport = target.getViewport();
    if (!viewport || viewport.width < 1 || clientX === void 0 || clientY === void 0) {
      return { x: 0.5, y: 0.5 };
    }
    const stage = target.stage.getBoundingClientRect();
    const x = (clientX - stage.left - viewport.x) / viewport.width;
    const y = (clientY - stage.top - viewport.y) / viewport.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y))
    };
  }
  function savedMessage(result, rendered) {
    const downscaled = rendered !== void 0 && result.width > 0 && result.width < rendered;
    return sprintf(
      downscaled ? (
        /* translators: 1: stored width, 2: stored height. */
        __("Saved as a copy. This site stores images at up to %1$d × %2$d.")
      ) : (
        /* translators: 1: stored width, 2: stored height. */
        __("Saved as a copy — %1$d × %2$d.")
      ),
      result.width,
      result.height
    );
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  function exportFilename(title, format) {
    const extension = format.split("/")[1] ?? "jpg";
    const base = (title || "image").replace(/[^\w-]+/g, "-");
    return `${base}-edited.${"jpeg" === extension ? "jpg" : extension}`;
  }
  class OutputController {
    /**
     * @param options Output configuration.
     */
    constructor(options) {
      this.busy = false;
      this.options = options;
    }
    /**
     * Renders the edit at full resolution.
     *
     * @return The encoded image, or null when rendering failed.
     */
    async render() {
      const renderer = this.options.getRenderer();
      if (!renderer) {
        return null;
      }
      const { format, quality } = this.options.store.current.output;
      this.setBusy(true);
      try {
        return await renderer.renderFull(format, quality);
      } catch (error) {
        this.report(error, __("The image could not be rendered."));
        return null;
      } finally {
        this.setBusy(false);
      }
    }
    /**
     * Saves the edit as a new attachment.
     *
     * Never modifies the original. The success message reports the dimensions the
     * site actually stored rather than the ones rendered, because WordPress applies
     * `big_image_size_threshold` to every upload and will quietly downscale a large
     * render -- claiming otherwise would be a comfortable lie.
     *
     * @return The saved attachment, or null when nothing was written.
     */
    async save() {
      const payload = this.options.getPayload();
      if (this.busy || !payload) {
        return null;
      }
      const blob = await this.render();
      if (!blob || this.options.isDestroyed()) {
        return null;
      }
      const rendered = this.options.getRenderer()?.sourceSize;
      try {
        this.setBusy(true);
        const layers = await this.exportLayers();
        if (this.options.isDestroyed()) {
          return null;
        }
        const result = await this.options.client.saveRender(
          payload.id,
          blob,
          this.options.store.current,
          layers
        );
        toast(savedMessage(result, rendered?.width), "success");
        return result;
      } catch (error) {
        this.report(error, __("The image could not be saved."));
        return null;
      } finally {
        this.setBusy(false);
      }
    }
    /**
     * Encodes every painted layer, so the copy can be opened with them again.
     *
     * All or nothing. A save is only re-editable when every raster layer travels with
     * it, so one layer too large for the site to accept means none go and the copy
     * flattens -- which the server reports, and the banner explains -- rather than a
     * copy that opens with half its layers.
     *
     * @return The layers to upload; empty when the save should flatten.
     */
    async exportLayers() {
      const renderer = this.options.getRenderer();
      if (!renderer) {
        return [];
      }
      const layers = [];
      for (const layer of this.options.store.current.layers) {
        if ("raster" !== layer.kind) {
          continue;
        }
        const blob = await renderer.exportLayer(layer.id);
        if (!blob) {
          continue;
        }
        if (blob.size > this.options.maxUploadBytes) {
          return [];
        }
        layers.push({ id: layer.id, blob });
      }
      return layers;
    }
    /**
     * Downloads the rendered image to the user's device.
     */
    async exportToDevice() {
      const blob = await this.render();
      if (!blob || this.options.isDestroyed()) {
        return;
      }
      download(
        blob,
        exportFilename(
          this.options.getPayload()?.title ?? "",
          this.options.store.current.output.format
        )
      );
      toast(__("Downloaded."), "success");
    }
    /**
     * Marks the controller busy and tells the toolbar.
     *
     * @param busy Whether a render is in flight.
     */
    setBusy(busy) {
      this.busy = busy;
      this.options.setBusy(busy);
    }
    /**
     * Reports a failure, preferring the server's own wording.
     *
     * @param error    The failure.
     * @param fallback What to say when it carried no message.
     */
    report(error, fallback) {
      toast(error instanceof Error ? error.message : fallback, "error");
    }
  }
  const COALESCE_MS = 600;
  const MAX_ENTRIES = 100;
  class History {
    /**
     * @param initial Starting state, which becomes the bottom of the stack.
     * @param now     Clock, injectable so tests can drive coalescing deterministically.
     */
    constructor(initial, now = () => Date.now()) {
      this.entries = [];
      this.index = -1;
      this.now = now;
      this.entries = [{ state: initial, label: "@initial", at: 0 }];
      this.index = 0;
    }
    /** The state currently in effect. */
    get current() {
      return this.entries[this.index].state;
    }
    /** Whether there is anything to undo. */
    get canUndo() {
      return this.index > 0;
    }
    /** Whether there is anything to redo. */
    get canRedo() {
      return this.index < this.entries.length - 1;
    }
    /**
     * Records a new state.
     *
     * Replaces the top entry instead of adding one when the label matches the
     * previous change and it happened recently, so a slider drag becomes a single
     * undo step rather than one per pointer move. An entry carrying metadata is never
     * merged, because its payload cannot be superseded the way a slider value can.
     *
     * Pushing after an undo discards the redo tail, which is what every editor does.
     *
     * @param state New state.
     * @param label Groups related changes. Use the op name for slider drags.
     * @param meta  Optional. Carried alongside, for changes a snapshot cannot express.
     */
    push(state2, label, meta) {
      const at = this.now();
      const top = this.entries[this.index];
      if (this.index > 0 && top.label === label && at - top.at < COALESCE_MS && !this.canRedo && // Never merge entries carrying a payload. Coalescing exists for slider
      // drags, where each value supersedes the last. A brush stroke is not like
      // that: its patch holds pixels that exist nowhere else, so merging two
      // quick strokes would discard the first stroke's only copy of them and
      // leave undo restoring half of what it claimed to.
      meta === void 0 && top.meta === void 0) {
        this.entries[this.index] = { state: state2, label, at, meta };
        return;
      }
      this.entries = this.entries.slice(0, this.index + 1);
      this.entries.push({ state: state2, label, at, meta });
      if (this.entries.length > MAX_ENTRIES) {
        this.entries.shift();
      }
      this.index = this.entries.length - 1;
    }
    /**
     * Overwrites the current state without creating an undo step.
     *
     * For changes that are not part of the edit being undone -- output format and
     * quality, which describe how the result is encoded rather than what it looks
     * like. Interleaving those with adjustment history would make undo jump between
     * unrelated kinds of change.
     *
     * @param state Replacement state.
     */
    replace(state2) {
      this.entries[this.index] = { ...this.entries[this.index], state: state2 };
    }
    /** Whatever was attached to the entry currently in effect. */
    get meta() {
      return this.entries[this.index].meta;
    }
    /** The label of the entry currently in effect. */
    get label() {
      return this.entries[this.index].label;
    }
    /**
     * Replaces the metadata on the entry in effect.
     *
     * Undoing a stroke needs the pixels the stroke *produced* in order to redo it, and
     * those only exist once it has happened -- so the patch is swapped for its opposite
     * as it is applied, and the entry alternates between undo and redo directions.
     *
     * @param meta Replacement metadata.
     */
    setMeta(meta) {
      this.entries[this.index].meta = meta;
    }
    /**
     * Steps back one entry.
     *
     * @return The state now in effect, unchanged when there was nothing to undo.
     */
    undo() {
      if (this.canUndo) {
        this.index--;
      }
      return this.current;
    }
    /**
     * Steps forward one entry.
     *
     * @return The state now in effect, unchanged when there was nothing to redo.
     */
    redo() {
      if (this.canRedo) {
        this.index++;
      }
      return this.current;
    }
    /**
     * Every state still on the stack, oldest first.
     *
     * For callers holding resources a state refers to but does not contain -- a layer's
     * pixels, which live in a GPU texture. Anything reachable by undo or redo is still
     * needed, and only the entries this stack has dropped are safe to free.
     */
    get states() {
      return this.entries.map((entry) => entry.state);
    }
    /** The state the stack started from. */
    get initial() {
      return this.entries[0].state;
    }
  }
  class UndoableStore {
    /**
     * @param initial Starting state.
     */
    constructor(initial) {
      this.listeners = new Subscribers();
      this.history = new History(initial);
    }
    /**
     * Starts a fresh document.
     *
     * Replaces the history outright rather than pushing onto it: the previous
     * document's undo stack has nothing to do with this one.
     *
     * @param initial New starting state.
     */
    reload(initial) {
      this.history = new History(initial);
    }
    /** The state as it currently stands. */
    get current() {
      return this.history.current;
    }
    /** Every state on the undo stack, including the current one. */
    get states() {
      return this.history.states;
    }
    get canUndo() {
      return this.history.canUndo;
    }
    get canRedo() {
      return this.history.canRedo;
    }
    /** Whatever the current entry carries alongside its state. */
    get meta() {
      return this.history.meta;
    }
    /**
     * Replaces the current entry's payload.
     *
     * @param meta New payload.
     */
    setMeta(meta) {
      this.history.setMeta(meta);
    }
    /**
     * Subscribes to changes.
     *
     * @param listener Called after every mutation, with what it invalidated.
     * @return Unsubscribe function.
     */
    subscribe(listener) {
      return this.listeners.add(listener);
    }
    /**
     * Writes a state without creating an undo entry.
     *
     * For corrections rather than edits -- filling in a canvas size the stored recipe
     * never had, say. Nothing a user did, so nothing to undo.
     *
     * @param state New state.
     * @param scope What it invalidated.
     */
    replace(state2, scope) {
      this.history.replace(state2);
      this.announce(scope);
    }
    /**
     * Pushes a state as a new undo entry.
     *
     * @param state New state.
     * @param label History label. Adjacent pushes sharing one coalesce into a single
     *              entry, which is what turns a whole slider drag into one undo.
     * @param scope What it invalidated.
     * @param meta  Optional. Payload for the entry.
     */
    push(state2, label, scope, meta) {
      this.history.push(state2, label, meta);
      this.announce(scope);
    }
    /**
     * Steps back one entry.
     *
     * @param scope What to report as invalidated.
     * @return True when there was something to undo.
     */
    undo(scope) {
      if (!this.history.canUndo) {
        return false;
      }
      this.history.undo();
      this.announce(scope);
      return true;
    }
    /**
     * Steps forward one entry.
     *
     * @param scope What to report as invalidated.
     * @return True when there was something to redo.
     */
    redo(scope) {
      if (!this.history.canRedo) {
        return false;
      }
      this.history.redo();
      this.announce(scope);
      return true;
    }
    /**
     * Tells every subscriber the state moved.
     *
     * @param scope What the change invalidated.
     */
    announce(scope) {
      this.listeners.emit(this.history.current, scope);
    }
  }
  class RecipeStore extends UndoableStore {
    /**
     * @param initial Starting recipe.
     * @param schema  Op schema, which bounds every adjustment.
     */
    constructor(initial, schema) {
      super(initial);
      this.schema = schema;
    }
    /**
     * Starts a fresh document.
     *
     * @param recipe New recipe.
     * @param schema Op schema for the new image.
     */
    load(recipe, schema) {
      this.reload(recipe);
      this.schema = schema;
    }
    /**
     * Whether the edit would produce the original image unchanged.
     *
     * @param source Native size of the source image, when known.
     */
    isIdentity(source) {
      return isIdentity(this.current, source);
    }
    /**
     * Applies one adjustment.
     *
     * @param type  Op to change.
     * @param value New canonical value.
     */
    setOp(type, value) {
      this.push(setOp(this.current, type, value, this.schema), type, "ops");
    }
    /**
     * Moves, scales or rotates the layer.
     *
     * The canvas is untouched, which is precisely why a transform drag is stable: the
     * surface the pointer is measured against cannot move underneath it.
     *
     * @param transform New layer transform.
     * @param label     History label; a drag passes a stable one so it coalesces.
     */
    setLayerTransform(transform, label = "transform") {
      this.push(setLayer(this.current, transform), label, "document");
    }
    /**
     * Resizes the canvas and repositions the layer together.
     *
     * @param canvas    New canvas size.
     * @param transform New layer transform.
     * @param label     History label.
     */
    setDocument(canvas, transform, label = "canvas") {
      this.push(setDocument(this.current, canvas, transform), label, "document");
    }
    /**
     * Replaces the layer stack.
     *
     * @param layers   New stack.
     * @param activeId Optional. Which layer becomes active.
     * @param undoable Optional. False folds the change into the current entry, for a
     *                 layer that exists only because a stroke needed somewhere to go.
     * @param label    Optional. History label. Consecutive changes sharing one coalesce,
     *                 so a change that must stand as its own undo step -- retyping a text
     *                 layer, right after selecting it -- passes a label of its own.
     */
    setLayers(layers, activeId, undoable = true, label = "layers") {
      const next = setLayers(this.current, layers, activeId);
      if (undoable) {
        this.push(next, label, "document");
      } else {
        this.replace(next, "document");
      }
    }
    /**
     * Replaces one curve channel.
     *
     * @param channel Curve channel.
     * @param points  Control points, or undefined to clear.
     */
    setCurve(channel, points) {
      this.push(setCurve(this.current, channel, points), `curve-${channel}`, "tone");
    }
    /**
     * Replaces the black point, white point and gamma.
     *
     * @param levels New levels.
     */
    setLevels(levels) {
      this.push(setLevels(this.current, levels), "levels", "tone");
    }
    /**
     * Updates the output settings.
     *
     * Not pushed onto the undo stack: format and quality describe how the edit is
     * encoded, not the edit itself, and interleaving them with adjustment history
     * would make undo behave unpredictably.
     *
     * @param patch Fields to change.
     */
    setOutput(patch) {
      const current = this.current;
      this.replace({ ...current, output: { ...current.output, ...patch } }, "document");
    }
    /**
     * Switches the working space the adjustments are computed in.
     *
     * Undoable, unlike the output settings beside it: this one changes the pixels. An
     * exposure set in sRGB lands somewhere else in linear light, and a user who does
     * not like where it landed should be able to press undo rather than hunt for the
     * control again.
     *
     * @param space New working space.
     */
    setSpace(space) {
      if (this.current.space === space) {
        return;
      }
      this.push({ ...this.current, space }, "space", "ops");
    }
    /**
     * Applies a saved look, keeping this image's own geometry.
     *
     * Geometry is deliberately untouched. A preset describes a look; the crop
     * describes this particular frame, and replacing it would silently re-crop the
     * photograph the moment a look was applied.
     *
     * The working space *is* part of the look, and comes with it: it decides what an
     * exposure op means, so a look made in linear light and replayed in sRGB is a
     * different look. A preset saved before the field existed was made in sRGB.
     *
     * @param preset Preset to apply.
     */
    applyPreset(preset) {
      const current = this.current;
      this.push(
        {
          ...current,
          ops: preset.recipe.ops ?? [],
          curves: preset.recipe.curves ?? {},
          levels: preset.recipe.levels ?? current.levels,
          space: normaliseSpace(preset.recipe.space)
        },
        "preset",
        "all"
      );
    }
    /**
     * Returns every adjustment to zero.
     *
     * @param source Native size of the source image, when known.
     * @return True when there was something to reset.
     */
    reset(source) {
      if (this.isIdentity(source)) {
        return false;
      }
      this.push(resetOps(this.current, source), "reset", "all");
      return true;
    }
    /**
     * Files a finished stroke as one undo entry.
     *
     * The recipe itself has not changed -- the pixels have -- so the entry carries the
     * tiles the stroke overwrote. Without them, undoing a stroke would restore an
     * identical recipe and appear to do nothing at all.
     *
     * @param patch Tiles as they stood before the stroke.
     */
    pushStroke(patch) {
      this.push({ ...this.current }, "paint", "document", patch);
    }
  }
  function emptyStore(attachmentId) {
    return new RecipeStore(defaultRecipe(attachmentId), {});
  }
  function createSidebarToggle(root, onToggle) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "lz-sidebar-tab";
    const label = document.createElement("span");
    label.className = "lz-sidebar-tab__label";
    label.textContent = __("Tools");
    el.appendChild(label);
    el.setAttribute("aria-controls", "lz-sidebar");
    const setOpen = (open2) => {
      root.classList.toggle("is-sidebar-hidden", !open2);
      el.setAttribute("aria-expanded", String(open2));
      el.hidden = open2;
      writeSidebarOpen(open2);
      onToggle();
    };
    el.addEventListener("click", () => setOpen(true));
    return { el, setOpen, restore: () => setOpen(readSidebarOpen()) };
  }
  class EditorShell {
    /**
     * @param options Shell configuration.
     */
    constructor(options) {
      this.root = options.root;
      this.host = options.host;
      this.root.replaceChildren();
      this.root.classList.remove(PICKER_CLASS);
      this.root.classList.add("lz-editor");
      this.root.classList.add(`lz-editor--${options.host}`);
      this.root.classList.toggle("is-desktop-mode", isDesktopModeEnabled());
      this.topbar = document.createElement("div");
      this.topbar.className = "lz-topbar";
      this.topbar.setAttribute("role", "toolbar");
      this.topbar.setAttribute("aria-label", __("Editor actions"));
      this.title = document.createElement("h1");
      this.title.className = "lz-topbar__title";
      this.title.textContent = __("Loading image…");
      this.options = document.createElement("div");
      this.options.className = "lz-topbar__options";
      this.actions = document.createElement("div");
      this.actions.className = "lz-topbar__actions";
      this.topbar.append(this.title, this.options, this.actions);
      const body = document.createElement("div");
      body.className = "lz-body";
      this.stage = document.createElement("div");
      this.stage.className = "lz-stage";
      this.backdrop = document.createElement("div");
      this.backdrop.className = "lz-canvas-backdrop";
      this.backdrop.setAttribute("aria-hidden", "true");
      this.stage.appendChild(this.backdrop);
      this.status = document.createElement("p");
      this.status.className = "lz-status";
      this.status.textContent = __("Loading image…");
      this.stage.appendChild(this.status);
      this.sidebar = document.createElement("aside");
      this.sidebar.className = "lz-sidebar";
      this.sidebar.id = "lz-sidebar";
      this.sidebar.setAttribute("aria-label", __("Tools"));
      this.sidebarTab = createSidebarToggle(this.root, options.onSidebarToggle);
      body.append(this.stage, this.sidebar, this.sidebarTab.el);
      this.root.append(this.topbar, body);
    }
    /**
     * Shows a message in the stage area.
     *
     * @param message What to say.
     */
    setStatus(message) {
      this.status.textContent = message;
      if (!this.status.isConnected) {
        this.stage.appendChild(this.status);
      }
    }
    /**
     * Shows a message the user cannot recover from.
     *
     * @param message What went wrong.
     */
    setError(message) {
      this.status.classList.add("lz-status--error");
      this.setStatus(message);
    }
    /** Takes the loading message down. */
    clearStatus() {
      this.status.remove();
    }
    /**
     * Puts the image title in the toolbar.
     *
     * @param title Image title.
     */
    setTitle(title) {
      this.title.textContent = title || __("Untitled image");
    }
    /** Restores the remembered sidebar state. */
    restoreSidebar() {
      this.sidebarTab.restore();
    }
    /**
     * Shows or hides the sidebar.
     *
     * @param open Whether the sidebar should be visible.
     */
    setSidebarOpen(open2) {
      this.sidebarTab.setOpen(open2);
    }
    /**
     * Positions the canvas backdrop over wherever the canvas currently is.
     *
     * @param viewport Where the canvas sits, or null when nothing is loaded.
     */
    syncBackdrop(viewport) {
      if (!viewport) {
        this.backdrop.hidden = true;
        return;
      }
      this.backdrop.hidden = false;
      this.backdrop.style.insetInlineStart = `${viewport.x}px`;
      this.backdrop.style.insetBlockStart = `${viewport.y}px`;
      this.backdrop.style.inlineSize = `${viewport.width}px`;
      this.backdrop.style.blockSize = `${viewport.height}px`;
    }
    /**
     * Empties the root and gives back its classes.
     *
     * The host modifier goes too, not just `lz-editor`. The same element is handed back
     * to the picker when a window is emptied, and `lz-editor--window` left behind takes
     * `block-size: 100%` and `overflow: hidden` with it -- which is a picker that cannot
     * scroll to the photo you were looking for.
     */
    destroy() {
      this.root.replaceChildren();
      this.root.classList.remove("lz-editor", `lz-editor--${this.host}`);
    }
  }
  function createCompareControl(setBypass) {
    const handle = createIconButton({
      glyph: "◑",
      label: __("Compare: hold to see the original (\\)"),
      className: "lz-topbar__icon",
      onClick: () => {
      }
    });
    const start = () => {
      setBypass(true);
      handle.setPressed(true);
    };
    const end = () => {
      setBypass(false);
      handle.setPressed(false);
    };
    handle.el.addEventListener("pointerdown", start);
    handle.el.addEventListener("pointerup", end);
    handle.el.addEventListener("pointerleave", end);
    handle.el.addEventListener("pointercancel", end);
    const onKeyUp = (event) => {
      if ("\\" === event.key) {
        end();
      }
    };
    document.addEventListener("keyup", onKeyUp);
    const offKeyDown = onEditorKey("keydown", (event) => {
      if ("\\" === event.key && !event.repeat) {
        start();
      }
    });
    return {
      handle,
      detach: () => {
        offKeyDown();
        document.removeEventListener("keyup", onKeyUp);
      }
    };
  }
  class EditorToolbar {
    /**
     * @param host    Element to append the buttons to.
     * @param actions What each button does.
     */
    constructor(host, actions) {
      this.state = {
        canUndo: false,
        canRedo: false,
        identity: true,
        ready: false,
        canSave: false
      };
      this.handles = [];
      this.detach = [];
      const recentre = createIconButton({
        glyph: "⊕",
        label: __("Recentre the view (0)"),
        className: "lz-topbar__icon",
        onClick: actions.recentre
      });
      this.undoButton = createIconButton({
        glyph: "↶",
        label: __("Undo (Ctrl+Z)"),
        className: "lz-topbar__icon",
        onClick: actions.undo
      });
      this.redoButton = createIconButton({
        glyph: "↷",
        label: __("Redo (Ctrl+Shift+Z)"),
        className: "lz-topbar__icon",
        onClick: actions.redo
      });
      const compare = createCompareControl(actions.setBypass);
      this.detach.push(compare.detach);
      this.saveButton = createButton({
        label: __("Save a copy"),
        title: __("Save as a new image, leaving the original untouched"),
        variant: "primary",
        onClick: actions.save
      });
      this.overflow = createMenuButton({
        label: __("More actions"),
        className: "lz-topbar__icon",
        getItems: () => this.moreActions(actions)
      });
      host.append(
        recentre.el,
        this.undoButton.el,
        this.redoButton.el,
        compare.handle.el,
        this.saveButton.el,
        this.overflow.el
      );
      this.handles.push(
        recentre,
        this.undoButton,
        this.redoButton,
        compare.handle,
        this.saveButton,
        this.overflow
      );
    }
    /**
     * The commands behind the overflow, with the ones that would do nothing left out.
     *
     * Omitted rather than greyed out, unlike the buttons on the bar itself: a disabled
     * control in a row is a placeholder holding its position, but a disabled row in a
     * menu of three is just a shorter menu with a gap in it.
     *
     * @param actions What each command does.
     */
    moreActions(actions) {
      const items = [];
      const live = this.state.ready && !this.state.identity;
      if (live) {
        items.push({
          label: __("Export…"),
          title: __("Download the edited image to this device"),
          onSelect: actions.exportToDevice
        });
      }
      if (!this.state.identity) {
        items.push({
          label: __("Reset all edits"),
          title: __("Return every adjustment to zero"),
          onSelect: actions.reset
        });
      }
      if (actions.close) {
        items.push({ label: __("Close"), onSelect: actions.close });
      }
      return items;
    }
    /**
     * Enables or disables the buttons to match the state.
     *
     * @param state Current editor state.
     */
    sync(state2) {
      this.state = state2;
      this.undoButton.setDisabled(!state2.canUndo);
      this.redoButton.setDisabled(!state2.canRedo);
      const live = state2.ready && !state2.identity;
      this.saveButton.setDisabled(!live || !state2.canSave);
    }
    /** Releases every button and key binding. */
    destroy() {
      for (const off of this.detach) {
        off();
      }
      for (const handle of this.handles) {
        handle.destroy();
      }
      this.detach = [];
      this.handles = [];
    }
  }
  class Editor {
    /**
     * @param element Element to fill. Its contents are replaced.
     * @param options Mount options.
     */
    constructor(element, options) {
      this.store = emptyStore(0);
      this.selectionShape = "rect";
      this.selectionMode = "new";
      this.payload = null;
      this.renderer = null;
      this.loaded = null;
      this.panelHost = null;
      this.selection = null;
      this.strokes = null;
      this.clipboard = null;
      this.stage = null;
      this.busy = false;
      this.destroyed = false;
      this.detach = [];
      this.options = options;
      this.config = readConfig();
      this.client = new RestClient(this.config);
      this.store = emptyStore(options.attachmentId);
      this.shell = new EditorShell({
        root: element,
        host: options.host ?? "page",
        onSidebarToggle: () => this.renderer?.view.fit()
      });
      this.state = new EditorUiState(stateEffects(this));
      this.toolbar = new EditorToolbar(this.shell.actions, {
        undo: () => undo(this),
        redo: () => redo(this),
        reset: () => resetAll(this),
        recentre: () => this.renderer?.view.reset(),
        save: () => void save(this),
        exportToDevice: () => void this.output.exportToDevice(),
        setBypass: (on) => this.renderer?.setBypass(on),
        ...options.onClose ? { close: options.onClose } : {}
      });
      this.output = new OutputController({
        store: this.store,
        client: this.client,
        maxUploadBytes: this.config.maxUploadBytes,
        getRenderer: () => this.renderer,
        getPayload: () => this.payload,
        isDestroyed: () => this.destroyed,
        setBusy: (busy) => {
          this.busy = busy;
          this.syncToolbar();
        }
      });
      this.syncToolbar();
    }
    /** True once `destroy()` has run, so a load in flight can stand down. */
    get isDestroyed() {
      return this.destroyed;
    }
    /** Loads the image and brings the editor up. */
    boot() {
      return bootEditor(this);
    }
    /** Renderer internals, for diagnosing render problems from the console. */
    debug() {
      return editorDebug(this);
    }
    /** Enables or disables the toolbar buttons to match the state. */
    syncToolbar() {
      this.toolbar.sync(toolbarState(this, this.busy));
    }
    /** The native pixel size of whatever backs the active layer. */
    activeLayerSize() {
      return activeLayerSize(this);
    }
    /** Current edit. */
    getRecipe() {
      return this.store.current;
    }
    /**
     * Replaces the current edit.
     *
     * @param recipe New recipe.
     */
    setRecipe(recipe) {
      this.store.push(recipe, "set-recipe", "all");
    }
    /**
     * Adds an image to the document as a new layer.
     *
     * @param dropped What was dropped, and where.
     * @return True when a layer was added.
     */
    addImageLayer(dropped) {
      return addImageLayer(importTarget(this), dropped);
    }
    /**
     * Turns typed text into a layer of its own.
     *
     * @param text  What was typed.
     * @param point Canvas coordinates of the first line's top-left corner.
     * @return True when a layer was added.
     */
    drawText(text, point) {
      return drawTextLayer(importTarget(this), text, point);
    }
    /**
     * Reopens a text layer for retyping.
     *
     * The caret lands over the glyphs, filled with the words, styled the way they are
     * drawn -- so the options bar shows the layer's own font and colour, and changing
     * either restyles the text live. The layer itself steps out of the picture while
     * the caret is open, or there would be two copies of the text on screen.
     *
     * @param layerId Text layer to edit.
     * @return True when the caret opened.
     */
    editText(layerId) {
      const recipe = this.store.current;
      const layer = findLayer(recipe.layers, layerId);
      const renderer = this.renderer;
      const stage = this.stage;
      if (!layer?.text || !renderer || !stage) {
        return false;
      }
      const placement = textPlacement(layer, recipe.canvas);
      if (!placement) {
        return false;
      }
      if (recipe.activeLayerId !== layerId) {
        this.store.setLayers(recipe.layers, layerId);
      }
      const source = layer.text;
      this.state.setBrush({
        fontSize: source.size,
        fontFamily: source.family,
        colour: source.colour,
        bold: source.bold,
        italic: source.italic,
        shapeStyle: source.strokeWidth > 0 ? "stroke" : "fill",
        ...source.strokeWidth > 0 ? { strokeWidth: source.strokeWidth } : {}
      });
      this.state.setTool("text");
      renderer.hideLayer(layerId);
      stage.text.open(placement.point, {
        initial: source.text,
        layerId,
        scale: placement.scale
      });
      return true;
    }
    /**
     * Replaces a text layer's words.
     *
     * @param layerId Text layer to retype.
     * @param text    The new words. Empty removes the layer.
     * @param point   Canvas coordinates of the first line's top-left corner.
     * @return True when the document changed.
     */
    replaceText(layerId, text, point) {
      return replaceTextLayer(importTarget(this), layerId, text, point);
    }
    /**
     * Registers teardown callbacks.
     *
     * @param offs Detach functions.
     */
    onTeardown(...offs) {
      this.detach.push(...offs);
    }
    /** Releases everything this editor owns. */
    destroy() {
      if (this.destroyed) {
        return;
      }
      this.destroyed = true;
      for (const off of this.detach) {
        off();
      }
      this.detach = [];
      this.stage?.destroy();
      this.stage = null;
      this.selection?.destroy();
      this.selection = null;
      this.clipboard = null;
      this.strokes = null;
      this.toolbar.destroy();
      this.panelHost?.destroy();
      this.panelHost = null;
      this.state.clear();
      this.renderer?.destroy();
      this.renderer = null;
      this.loaded?.release();
      this.loaded = null;
      this.shell.destroy();
    }
  }
  function mount(element, options) {
    const editor = new Editor(element, options);
    void editor.boot();
    return editor;
  }
  let instance = null;
  function bootAdminPage() {
    const root = document.querySelector(
      '[data-lienzo-root][data-host="page"]'
    );
    if (!root) {
      return;
    }
    const attachmentId = Number(root.dataset.attachment ?? 0);
    instance?.destroy();
    instance = null;
    if (isShellPage()) {
      handOverToDesktop(root, attachmentId);
      return;
    }
    if (attachmentId) {
      open(root, attachmentId);
    } else {
      showPicker(root);
    }
    window.addEventListener(
      "pagehide",
      () => {
        instance?.destroy();
        instance = null;
      },
      { once: true }
    );
  }
  function open(root, attachmentId) {
    instance?.destroy();
    root.replaceChildren();
    instance = mount(root, {
      attachmentId,
      host: "page",
      // Closing the only thing on the page has nowhere to go but back to the library.
      onClose: () => {
        window.location.href = window.lienzoConfig?.editorUrl ?? "upload.php";
      }
    });
    window.lienzoEditor = instance;
    const url = new URL(window.location.href);
    url.searchParams.set("attachment", String(attachmentId));
    window.history.replaceState({}, "", url);
  }
  function handOverToDesktop(root, attachmentId) {
    const opened = openDesktopWindow(attachmentId);
    const notice = document.createElement("div");
    notice.className = "lz-page-notice";
    const message = document.createElement("p");
    message.className = "lz-page-notice__text";
    message.textContent = opened ? __("AllTerrain Photo Editor opened in a window of its own on your desktop.") : __("AllTerrain Photo Editor opens as a window on your desktop. Open it from the dock or its icon.");
    const button = createButton({
      label: opened ? __("Bring AllTerrain Photo Editor to the front") : __("Open AllTerrain Photo Editor"),
      variant: "primary",
      onClick: () => openDesktopWindow(attachmentId)
    });
    notice.append(message, button.el);
    root.replaceChildren(notice);
  }
  function showPicker(root) {
    const config = window.lienzoConfig;
    if (!config) {
      root.textContent = __("AllTerrain Photo Editor could not load its configuration.");
      return;
    }
    void renderPicker(root, config, (id) => open(root, id));
  }
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let active = null;
  function openEditorOverlay(options) {
    active?.close();
    const previousFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "lz-overlay";
    const dialog = document.createElement("div");
    dialog.className = "lz-overlay__dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", __("Edit image with AllTerrain Photo Editor"));
    const mountPoint = document.createElement("div");
    mountPoint.className = "lz-overlay__editor";
    dialog.appendChild(mountPoint);
    backdrop.appendChild(dialog);
    let editor = null;
    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      active = null;
      document.removeEventListener("keydown", onKeyDown, true);
      editor?.destroy();
      backdrop.remove();
      document.body.classList.remove("lz-overlay-open");
      previousFocus?.focus?.();
      options.onClose?.();
    };
    function onKeyDown(event) {
      if (event.key === "Escape") {
        if (event.defaultPrevented) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(
        dialog.querySelectorAll(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) {
        close();
      }
    });
    document.addEventListener("keydown", onKeyDown, true);
    document.body.appendChild(backdrop);
    document.body.classList.add("lz-overlay-open");
    editor = mount(mountPoint, {
      attachmentId: options.attachmentId,
      host: "modal",
      onClose: close,
      onSave: options.onSave
    });
    window.requestAnimationFrame(() => {
      dialog.querySelector(FOCUSABLE)?.focus();
    });
    active = { close };
    return { close };
  }
  function openEditor(attachmentId, options = {}) {
    const id = Number(attachmentId) || 0;
    if (!id) {
      return false;
    }
    const overlay = () => {
      if (window.lienzoConfig) {
        openEditorOverlay({ attachmentId: id, onSave: options.onSave });
      }
    };
    if (openInDesktop(id, options.origin ?? null, overlay)) {
      return true;
    }
    if (!window.lienzoConfig) {
      return false;
    }
    overlay();
    return true;
  }
  function bootBlockEditor() {
    const element = window.wp?.element;
    const hooks = window.wp?.hooks;
    const blockEditor = window.wp?.blockEditor;
    const components = window.wp?.components;
    if (!element?.createElement || !hooks?.addFilter || !blockEditor?.BlockControls || !components?.ToolbarGroup || !components?.ToolbarButton) {
      return;
    }
    const { createElement, Fragment } = element;
    const { BlockControls } = blockEditor;
    const { ToolbarGroup, ToolbarButton } = components;
    hooks.addFilter(
      "editor.BlockEdit",
      "lienzo/image-toolbar",
      (BlockEdit) => function LienzoImageToolbar(props) {
        const original = createElement(BlockEdit, props);
        if (props.name !== "core/image" || !props.isSelected) {
          return original;
        }
        const id = Number(props.attributes?.id ?? 0);
        if (!id) {
          return original;
        }
        const button = createElement(
          BlockControls,
          { group: "other" },
          createElement(
            ToolbarGroup,
            null,
            createElement(
              ToolbarButton,
              {
                label: __("Edit with AllTerrain Photo Editor"),
                // A save writes a *new* attachment -- AllTerrain Photo Editor never
                // rewrites an original -- so the block is pointed at
                // it, or the post would go on showing the photograph
                // as it was. The stored dimensions go with it: they
                // described the old file, and a crop changes them.
                // Only the overlay reports back; a desktop window
                // outlives this component, and there an edit returns
                // to a post through the shell's drag bridge.
                onClick: () => openEditor(id, {
                  onSave: (result) => props.setAttributes({
                    id: result.id,
                    url: result.url,
                    width: void 0,
                    height: void 0
                  })
                })
              },
              __("AllTerrain Photo Editor")
            )
          )
        );
        return createElement(Fragment, null, original, button);
      },
      20
    );
  }
  const patched = /* @__PURE__ */ new WeakSet();
  function bootMediaModal() {
    const details = window.wp?.media?.view?.Attachment?.Details;
    if (!details) {
      return;
    }
    patchView(details.TwoColumn);
    patchView(details);
  }
  function patchView(view) {
    if (!view?.prototype?.render || patched.has(view)) {
      return;
    }
    patched.add(view);
    const originalRender = view.prototype.render;
    view.prototype.render = function(...args) {
      const result = originalRender.apply(this, args);
      try {
        addButton(this);
      } catch {
      }
      return result;
    };
  }
  function addButton(view) {
    const el = view.el ?? null;
    const model = view.model;
    if (!el || !model) {
      return;
    }
    const id = Number(model.get("id"));
    const mime = String(model.get("mime") ?? "");
    const config = window.lienzoConfig;
    if (!id || !config || !config.supportedMimes.includes(mime)) {
      return;
    }
    const can = model.get("can");
    if (can && can.save === false) {
      return;
    }
    if (el.querySelector(".lz-modal-button")) {
      return;
    }
    const host = el.querySelector(".attachment-actions") ?? el.querySelector(".attachment-info") ?? el;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button lz-modal-button";
    button.textContent = __("Edit with AllTerrain Photo Editor");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditor(id, {
        onSave: (result) => returnEdit(view, id, result)
      });
    });
    host.appendChild(button);
  }
  function returnEdit(view, sourceId, result) {
    try {
      const attachment = window.wp?.media?.attachment?.(result.id);
      if (!attachment) {
        return;
      }
      attachment.fetch?.();
      const controller = view.controller;
      const state2 = controller?.state?.();
      state2?.get?.("library")?.add?.(
        attachment
      );
      const selection = state2?.get?.("selection");
      if (!selection?.add) {
        return;
      }
      const original = selection.get?.(sourceId);
      if (original) {
        selection.remove?.(original);
      }
      selection.add(attachment);
    } catch {
    }
  }
  const ATTRIBUTE = "data-lienzo-open";
  function bootOpenButtons() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const control = target.closest(`[${ATTRIBUTE}]`);
      if (!(control instanceof HTMLElement)) {
        return;
      }
      const attachmentId = Number(control.getAttribute(ATTRIBUTE)) || 0;
      if (!attachmentId) {
        return;
      }
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      if (openEditor(attachmentId)) {
        event.preventDefault();
      }
    });
  }
  const version = window.lienzoConfig?.version ?? "0.0.0";
  function boot() {
    bootDesktopMode();
    bootAdminPage();
    bootOpenButtons();
    bootMediaDrag();
    bootMediaModal();
    bootBlockEditor();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  exports.listPanels = listPanels;
  exports.mount = mount;
  exports.openEditor = openEditor;
  exports.openEditorOverlay = openEditorOverlay;
  exports.openInDesktop = openInDesktop;
  exports.registerPanel = registerPanel;
  exports.renderDesktopWindow = renderWindow;
  exports.unregisterPanel = unregisterPanel;
  exports.version = version;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({});
