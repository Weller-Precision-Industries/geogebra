#!/usr/bin/env bash
# Builds the GeoGebra "graphing" app bundle that OLMS self-hosts (Linear OLM-2025)
# from the Sandbox module (runs inside <iframe sandbox="allow-scripts">)
# and packs it as dist/geogebra-web3d-<commit>.tar.gz plus a .sha256 file.
#
# Layout inside the archive (OLMS serves it under /vendor/geogebra/<commit>/):
#   web3d/   GWT output: web3d.nocache.js, the permutation, deferredjs/, fonts/, js/
#   css/     compiled styles (GeoGebra loads them from <codebase>/../css)
#   NOTICE   source commit and licence summary
# Only the English UI strings are kept; other languages are dropped to save ~24 MB.
# Requires JDK 17 (JAVA_HOME) and rsync.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
commit=$(git -C "$root" rev-parse --short=12 HEAD)
if [[ -n $(git -C "$root" status --porcelain --untracked-files=no) ]]; then
	echo "Refusing to package a dirty tree; commit or discard tracked changes first." >&2
	exit 1
fi

(cd "$root/source/web" && ../../gradlew :web:gwtCompile :web:compileSass \
	-Pgmodule=org.geogebra.web.Sandbox --console=plain)

war="$root/source/web/web/war"
out="$root/dist"
name="geogebra-web3d-$commit"
stage="$out/$name"
rm -rf "$stage"
mkdir -p "$stage/web3d/js"
rsync -a \
	--exclude 'js/properties_keys_*' \
	--exclude 'web3d.devmode.js' \
	--exclude 'html/' \
	--exclude 'sworker*.js' \
	"$war/web3d/" "$stage/web3d/"
cp "$war"/web3d/js/properties_keys_en.js "$war"/web3d/js/properties_keys_en-GB.js "$stage/web3d/js/"
cp -r "$war/css" "$stage/css"
cat > "$stage/NOTICE" <<NOTICE
GeoGebra web bundle (graphing app), built from
https://github.com/Weller-Precision-Industries/geogebra at commit $(git -C "$root" rev-parse HEAD)
(a fork of https://github.com/geogebra/geogebra; see ROBOTUTOR.md for the fork's patches).

Copyright (c) GeoGebra GmbH, https://www.geogebra.org. Source code: EUPL 1.2.
UI images, icons, style sheets and language files: CC BY-NC-SA 4.0.
The assembled GeoGebra product is free for non-commercial use only; commercial use
requires a licence from GeoGebra GmbH. See https://www.geogebra.org/license.
Fonts: see web3d/fonts/licences/.
NOTICE

tar -C "$out" --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 -cf - "$name" \
	| gzip -n -9 > "$out/$name.tar.gz"
(cd "$out" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
du -h "$out/$name.tar.gz"
cat "$out/$name.tar.gz.sha256"
