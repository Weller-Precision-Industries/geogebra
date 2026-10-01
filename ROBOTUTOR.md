# Robotutor fork of GeoGebra

Weller Precision Industries' fork of [geogebra/geogebra](https://github.com/geogebra/geogebra),
maintained for the OLMS graph-answer surface (Linear OLM-2025 / OLM-2026). The default
branch `robotutor` is upstream `main` plus the patches below; upstream changes are merged
in, never rebased away.

## Patches

| Area | Change | Why |
| --- | --- | --- |
| Repaint loop (`web-common/.../main/TimerSystemW.java`, `EuclidianViewW.doRepaint`) | Ticks on `requestAnimationFrame` instead of a 16 ms `setInterval`; views paint synchronously inside the tick. | Repaints track the display's refresh rate and phase instead of beating against vsync, and lose a frame of latency. |
| Animations (`shared/common/.../kernel/AnimationManager.java`) | Cap 30 → 60 fps; steps run on a frame-synced timer (`UtilFactory.newFrameTimer`, web: `GFrameTimerW`); the timer is only rescheduled when its delay changes. | Upstream restarted the interval on nearly every step, and capped animation at 30 fps. |

Measured on headless Chromium at 60 Hz (slider animating two functions and a point;
`StartAnimation`): stock 30–37 painted fps with 9–10 ms frame-time jitter; patched 59.6 fps
with 1.7 ms jitter. Panning was already ~59 fps at 60 Hz in both builds.

## Build

Requires JDK 17 (on Archidesk: `~/.local/lib/jdk17`, declared in system-config).

```sh
cd source/web
JAVA_HOME=~/.local/lib/jdk17 ../../gradlew :web:gwtCompile :web:compileSass -Pgmodule=org.geogebra.web.SuperWeb
# output: web/war/web3d (the "graphing" app codebase) and web/war/css
```

## Licensing

Source code is EUPL 1.2: this fork is public, which satisfies its source-availability terms.
GeoGebra's UI images, icons, style sheets and translation files are CC BY-NC-SA, and the
assembled GeoGebra product is non-commercial unless licensed. Commercial OLMS use relies
on the GeoGebra commercial licence (Linear OLM-1963); do not ship a build commercially
without it or without replacing those assets.
