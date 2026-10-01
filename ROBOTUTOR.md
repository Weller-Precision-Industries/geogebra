# Robotutor fork of GeoGebra

Weller Precision Industries' fork of [geogebra/geogebra](https://github.com/geogebra/geogebra),
maintained for the OLMS graph-answer surface (Linear OLM-2025 / OLM-2026). The default
branch `robotutor` is upstream `main` plus the patches below; upstream changes are merged
in, never rebased away.

## Patches

| Area | Change | Why |
| --- | --- | --- |
| Repaint loop (`web-common/.../main/TimerSystemW.java`, `EuclidianViewW.doRepaint`) | Ticks on `requestAnimationFrame` instead of a 16 ms `setInterval`; views paint synchronously inside the tick. | Repaints track the display's refresh rate and phase instead of beating against vsync, and lose a frame of latency. |
| Sandboxed pages (`web/.../Sandbox.gwt.xml`, `web-dev/.../linker/MainWindowLinker.java`) | New `Sandbox` module (renamed `web3d`): installs code in the page window with script tags instead of a hidden iframe, assigns `$wnd` without an inline script, and has no dev-mode redirect hook. | Inside `<iframe sandbox="allow-scripts">` (opaque origin) the default linker's nested iframe is unreachable, and the dev-mode hook reads `sessionStorage`, which throws. Host CSP: `script-src 'nonce-…' 'strict-dynamic'` (GeoGebra injects its bundled libraries as inline scripts). |
| Keyboard exit (`web-common/.../accessibility/AccessibilityManagerW.java`, `AppletParameters`, `EventType.TAB_EXIT`) | New `data-param-tabExit`: Tab past the last control (Shift+Tab before the first) no longer wraps; the applet fires the client event `tabExit` (argument `forward`/`backward`) so the host moves focus. Default off (upstream behaviour). | Upstream wraps focus, trapping keyboard users unless they know to press Esc first (WCAG 2.1.2). A sandboxed frame cannot focus its host, and the browser's default Tab stays inside the frame's document, so the host must be told. |
| Animations (`shared/common/.../kernel/AnimationManager.java`) | Cap 30 → 60 fps; steps run on a frame-synced timer (`UtilFactory.newFrameTimer`, web: `GFrameTimerW`); the timer is only rescheduled when its delay changes. | Upstream restarted the interval on nearly every step, and capped animation at 30 fps. |

Measured on headless Chromium at 60 Hz (slider animating two functions and a point;
`StartAnimation`): stock 30–37 painted fps with 9–10 ms frame-time jitter; patched 59.6 fps
with 1.7 ms jitter. Panning was already ~59 fps at 60 Hz in both builds.

## Build

Requires JDK 17 (on Archidesk: `~/.local/lib/jdk17`, declared in system-config).

```sh
cd source/web
JAVA_HOME=~/.local/lib/jdk17 ../../gradlew :web:gwtCompile :web:compileSass -Pgmodule=org.geogebra.web.Sandbox
# output: web/war/web3d (the "graphing" app codebase) and web/war/css
# (-Pgmodule=org.geogebra.web.SuperWeb builds the unsandboxed upstream variant)
```

## Licensing

Source code is EUPL 1.2: this fork is public, which satisfies its source-availability terms.
GeoGebra's UI images, icons, style sheets and translation files are CC BY-NC-SA, and the
assembled GeoGebra product is non-commercial unless licensed. Commercial OLMS use relies
on the GeoGebra commercial licence (Linear OLM-1963); do not ship a build commercially
without it or without replacing those assets.

## Release bundle for OLMS

`robotutor/package-web3d.sh` builds the graphing app and writes
`dist/geogebra-web3d-<commit>.tar.gz` plus its `.sha256` file. The archive holds `web3d/`, `css/` (English UI strings
only) and a `NOTICE`. Each one is published as a GitHub Release (`web3d-<commit>`) on this fork; OLMS pins the
release URL and checksum and serves the files from `/vendor/geogebra/<commit>/`.
