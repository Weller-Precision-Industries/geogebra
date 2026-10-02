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
| Graphing app profile (`AppConfigGraphing`, `GraphingActivity`, `AppletParameters`, `ContextMenuAVItemMore`) | Applet parameters for the graphing app: `geometryCommands` (the Geometry app's non-CAS command set), `dataViews=false` (no Table or Spreadsheet view), `previewPoints=false` (no special points previewed on selection, and no Special Points / Solve / Statistics in the item menu), `disabledCommands=Name,…` (refused with their aliases; unknown names are logged). Defaults keep upstream behaviour. | Stock graphing silently refuses segments, polygons, circles and transformations. OLMS restricts the calculator per question so it never does the step a learner is meant to do, e.g. find an intersection or reflect a shape. |
| Portrait panel share (`PerspectiveDecoder`, `DockManagerW`, `ToolbarPanel`, `AppletParameters`) | `data-param-portraitPanelShare` (0–1): in portrait the side panel takes that share of the applet height (at least the rail and one input row) and keeps it on every resize until the user drags the divider. Default 0 keeps upstream's five-row minimum. | Upstream sizes the portrait panel for a full-screen app; in a phone-sized embedded frame the graph got half the height or less. |
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

## Contract and upstream sync

`robotutor/contract/` is a Playwright suite that pins every GeoGebra behaviour OLMS relies on, against a
built bundle served the way OLMS serves it (sandboxed frame, nonce + `'strict-dynamic'` CSP): the Apps API
calls OLMS makes, LaTeX in and out, geometry commands, a curated click toolbar, per-question command and
special-point restrictions, the portrait panel share, renamed givens surviving a learner reusing their label, the closed
on-screen keyboard, the graph-only review perspective, `tabExit`, the scientific app with its keypad (the calculator
OLMS offers beside a question), and 60 fps animation.

```sh
robotutor/check.sh                    # package-web3d.sh for HEAD, then the contract
node --test robotutor/sync.test.mjs   # sync logic against disposable local repositories
node robotutor/sync.mjs --check       # merge upstream main in a temporary worktree, build, run the contract
node robotutor/sync.mjs --check --push  # ...and push automation/geogebra-upstream-sync and open/update its PR
```

The sync merges `geogebra/geogebra` `main` into `robotutor` on the proposal branch, preserving both histories,
and records the upstream commit in `robotutor/upstream.json`. It never force-pushes, merges or publishes;
conflicts stop it with the paths. The PR body states whether the contract passed. Adopting a merge in OLMS
means publishing a release from the merged commit and bumping OLMS's pin. Hosted Actions are unavailable
(Linear OLM-1129), so the sync is run by an operator for now.

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
