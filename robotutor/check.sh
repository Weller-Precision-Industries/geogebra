#!/usr/bin/env bash
# Builds the release bundle for HEAD and runs the Robotutor contract against it (Linear OLM-2025).
# A release may be published only from a commit this passes on. Requires JDK 17 (JAVA_HOME),
# rsync and Node 22+; installs the contract's pinned Playwright and Chromium on first use.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
commit=$(git -C "$root" rev-parse --short=12 HEAD)
bash "$root/robotutor/package-web3d.sh"
cd "$root/robotutor/contract"
npm ci --no-audit --no-fund
npx playwright install chromium
ROBOTUTOR_BUNDLE="$root/dist/geogebra-web3d-$commit" npx playwright test
