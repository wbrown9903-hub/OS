#!/bin/bash
# Nexus OS — run every test and write the real numbers to dist/TEST_RESULTS.md.
set -uo pipefail
cd "$(dirname "$0")"
. scripts/lib/common.sh
. scripts/lib/steps.sh

nx_install_traps
nx_banner "Testing Nexus OS"

nx_step_node
nx_step_dependencies
nx_step_prisma_generate

nx_section "Running tests"
nx_run "Checking shared code"      npx tsc --noEmit -p tsconfig.json
nx_run "Checking the interface"    npx tsc --noEmit -p apps/web/tsconfig.json
nx_run "Unit and integration"      npx vitest run
nx_step_test_swift_kernel

if [ -d tests/e2e ]; then
  nx_run "Browser tests" npx playwright test
else
  nx_info "No browser tests are present in this build."
fi

nx_finished
nx_open "dist/TEST_RESULTS.md"
