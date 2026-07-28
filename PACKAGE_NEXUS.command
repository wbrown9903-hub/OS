#!/bin/bash
# Nexus OS — produce the installable Mac artifacts in dist/.
set -uo pipefail
cd "$(dirname "$0")"
. scripts/lib/common.sh
. scripts/lib/steps.sh

nx_install_traps
nx_banner "Packaging Nexus OS"

if ! nx_is_macos; then
  nx_bad "Building a Mac app requires macOS."
  nx_say "Nothing was produced. Run this file on the Mac you want to install Nexus on."
  exit 1
fi

nx_step_node
nx_step_dependencies
nx_web_build_exists || nx_step_build_web
nx_step_build_swift_kernel
nx_step_build_bridge
nx_step_build_desktop

mkdir -p dist
VERSION="$(nx_project_version)"

nx_section "Assembling the app"
if [ -x scripts/package-app.sh ]; then
  nx_run "Building NexusOS.app" bash scripts/package-app.sh "$VERSION"
else
  nx_bad "scripts/package-app.sh is missing, so the app bundle could not be assembled."
  exit 1
fi

nx_section "Signing"
if [ -n "${NEXUS_SIGNING_IDENTITY:-}" ]; then
  nx_run "Signing with your Developer ID" bash scripts/sign.sh "$VERSION"
  if [ -n "${NEXUS_NOTARY_PROFILE:-}" ]; then
    nx_run "Notarising with Apple" bash scripts/notarize.sh "$VERSION"
  else
    nx_warn "No notarisation profile is configured, so this build is signed but not notarised."
  fi
else
  nx_warn "No Apple Developer ID is configured."
  nx_say  "This produces a working DEVELOPMENT build that is NOT signed or notarised."
  nx_say  "macOS will warn the first time you open it — right-click the app and choose Open."
fi

nx_section "Creating the installer"
nx_run "Building the disk image" bash scripts/package-dmg.sh "$VERSION"
nx_run "Recording checksums"     bash scripts/verify-release.sh "$VERSION"

nx_finished
nx_open "dist"
