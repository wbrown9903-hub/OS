#!/bin/bash
# Nexus OS — build, test and package everything, then explain the result in plain English.
set -uo pipefail
cd "$(dirname "$0")"
. scripts/lib/common.sh
. scripts/lib/steps.sh

nx_install_traps
nx_banner "Building Nexus OS"

nx_step_node
nx_step_env
nx_step_validate_env
nx_step_dependencies
nx_step_prisma_generate
nx_step_database

nx_section "Creating artwork and sounds"
nx_run "Generating original artwork" node scripts/generate-assets.mjs
nx_run "Generating original sounds"  node scripts/generate-sounds.mjs

nx_section "Checking the code"
nx_run "Checking shared code"    npx tsc --noEmit -p tsconfig.json
nx_run "Checking the interface"  npx tsc --noEmit -p apps/web/tsconfig.json
nx_run "Running the test suite"  npx vitest run

nx_step_build_web
nx_step_build_swift_kernel
nx_step_test_swift_kernel
nx_step_build_bridge
nx_step_build_desktop

nx_section "Packaging"
if nx_is_macos; then
  ./PACKAGE_NEXUS.command || nx_warn "Packaging did not complete. The build itself is still usable."
else
  nx_info "Packaging a Mac app requires macOS, so this step was skipped."
fi

nx_finished
nx_open "dist/BUILD_REPORT.md"
