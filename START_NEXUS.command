#!/bin/bash
# Nexus OS — start everything. Double-click this file; no Terminal knowledge needed.
set -uo pipefail
cd "$(dirname "$0")"
. scripts/lib/common.sh
. scripts/lib/steps.sh

nx_install_traps
nx_banner "Starting Nexus OS"

nx_step_node
nx_step_env
nx_step_dependencies
nx_step_prisma_generate
nx_step_database
nx_step_seed

nx_section "Starting the Nexus interface"
if nx_port_busy 4311; then
  nx_info "Something is already using port 4311 — reusing it."
else
  nx_web_build_exists || nx_step_build_web
  ( npm run start --workspace @nexus/web >>"$NX_LOG_FILE" 2>&1 & )
fi

if nx_wait_for_http "http://127.0.0.1:4311/" 60; then
  nx_ok "The Nexus interface is ready."
else
  nx_hint "Open dist/DIAGNOSTIC-REPORT.md to see what happened."
  nx_write_diagnostic "The Nexus interface did not start in time."
  exit 1
fi

nx_section "Connecting your Mac"
if nx_has_apple_toolchain; then
  nx_step_build_bridge || nx_warn "The Mac Bridge could not be built. Nexus still works, but it cannot open apps for you yet."
  if [ -x "$(nx_bridge_executable)" ]; then
    ( "$(nx_bridge_executable)" >>"$NX_LOG_FILE" 2>&1 & )
    nx_ok "Nexus can now open applications and arrange windows."
  fi
else
  nx_info "Apple's free developer tools are not installed, so the Mac Bridge is unavailable."
  nx_info "Nexus works fully in the browser; panels that open apps will explain what they need."
fi

nx_open "http://127.0.0.1:4311/"
nx_section "Nexus OS is running"
nx_say "Open at:  http://127.0.0.1:4311/"
nx_say "Keep this window open. Close it, or press Control-C, to stop Nexus."
nx_finished
while true; do sleep 3600; done
