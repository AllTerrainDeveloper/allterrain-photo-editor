(function() {
  "use strict";
  const APP_ID = "lienzo";
  const MAIN_BUNDLE_WAIT_MS = 5e3;
  const MAIN_BUNDLE_POLL_MS = 50;
  const globals = window;
  function mountEditor(root) {
    let teardown = null;
    let waited = 0;
    let timer = 0;
    const attempt = () => {
      const render = globals.lienzo?.renderDesktopWindow;
      if (!render) {
        return false;
      }
      teardown = render(root);
      return true;
    };
    if (!attempt()) {
      timer = window.setInterval(() => {
        waited += MAIN_BUNDLE_POLL_MS;
        if (attempt() || waited >= MAIN_BUNDLE_WAIT_MS) {
          window.clearInterval(timer);
        }
      }, MAIN_BUNDLE_POLL_MS);
    }
    return () => {
      window.clearInterval(timer);
      teardown?.();
    };
  }
  (globals.openStationAppsPending ?? (globals.openStationAppsPending = [])).push(
    ({ defineApp, html }) => defineApp(APP_ID, {
      // The same root the directly registered window's template carries, so the
      // main bundle finds its mount point the same way on both paths.
      view: () => html`<div class="lienzo-root" data-lienzo-root data-host="window"></div>`,
      mounted: (ctx) => mountEditor(ctx.root)
    })
  );
})();
