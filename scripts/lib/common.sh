#!/bin/bash
# Nexus OS — shared plumbing for every double-clickable entry point.
#
# Design rules for everything in this file:
#   * macOS ships bash 3.2, so nothing here uses bash 4 features
#     (no associative arrays, no ${var,,}, no mapfile).
#   * Every message a person reads is plain English with a next step.
#   * Any failure produces dist/DIAGNOSTIC-REPORT.md and opens it, so the user
#     never has to read a terminal to find out what to do.
#
# Source this from a .command file after it has cd'd to the repository root.

# shellcheck shell=bash

set -euo pipefail
set -E   # so the ERR trap fires inside functions and subshells too

# ---------------------------------------------------------------------------
# Paths and logging
# ---------------------------------------------------------------------------

NX_ROOT="$(pwd)"
NX_DIST="$NX_ROOT/dist"
NX_LOG_DIR="$NX_DIST/logs"
NX_TASK="${NX_TASK:-nexus}"
NX_STARTED_AT="$(date +"%Y-%m-%d %H:%M:%S")"
NX_LOG_FILE="$NX_LOG_DIR/${NX_TASK}-$(date +"%Y%m%d-%H%M%S").log"
NX_REPORT="$NX_DIST/DIAGNOSTIC-REPORT.md"

mkdir -p "$NX_LOG_DIR"
: > "$NX_LOG_FILE"

# What we are doing right now, in words a non-technical person understands.
# Every phase sets this so a crash can explain itself.
NX_CURRENT_STEP="Starting up"
NX_CURRENT_HINT="Try running this again. If it keeps failing, send the log file to support."
NX_FAILED=0
NX_CLEANUP_HOOK=""

# Colour, but only when attached to a real terminal.
if [ -t 1 ]; then
  NX_C_RESET=$'\033[0m'; NX_C_BOLD=$'\033[1m'; NX_C_DIM=$'\033[2m'
  NX_C_BLUE=$'\033[38;5;39m'; NX_C_GREEN=$'\033[38;5;42m'
  NX_C_YELLOW=$'\033[38;5;214m'; NX_C_RED=$'\033[38;5;203m'
else
  NX_C_RESET=""; NX_C_BOLD=""; NX_C_DIM=""
  NX_C_BLUE=""; NX_C_GREEN=""; NX_C_YELLOW=""; NX_C_RED=""
fi

nx_log() { printf '%s %s\n' "$(date +"%H:%M:%S")" "$*" >> "$NX_LOG_FILE"; }

nx_banner() {
  printf '\n%s%s%s\n' "$NX_C_BOLD$NX_C_BLUE" "  ╔══════════════════════════════════════════════════════════════╗" "$NX_C_RESET"
  printf '%s%s%s\n' "$NX_C_BOLD$NX_C_BLUE" "  ║                        N E X U S   O S                       ║" "$NX_C_RESET"
  printf '%s%s%s\n' "$NX_C_BOLD$NX_C_BLUE" "  ╚══════════════════════════════════════════════════════════════╝" "$NX_C_RESET"
  printf '  %s%s%s\n\n' "$NX_C_DIM" "$1" "$NX_C_RESET"
  nx_log "=== $1 (started $NX_STARTED_AT) ==="
}

nx_section() {
  NX_CURRENT_STEP="$1"
  printf '\n%s▸ %s%s\n' "$NX_C_BOLD$NX_C_BLUE" "$1" "$NX_C_RESET"
  printf '%s  ──────────────────────────────────────────────────────────%s\n' "$NX_C_DIM" "$NX_C_RESET"
  nx_log "--- SECTION: $1"
}

nx_say()  { printf '    %s\n' "$1"; nx_log "    $1"; }
nx_ok()   { printf '    %s✓%s %s\n' "$NX_C_GREEN" "$NX_C_RESET" "$1"; nx_log "  OK: $1"; }
nx_warn() { printf '    %s!%s %s\n' "$NX_C_YELLOW" "$NX_C_RESET" "$1"; nx_log "  WARN: $1"; }
nx_info() { printf '    %s·%s %s\n' "$NX_C_DIM" "$NX_C_RESET" "$1"; nx_log "  INFO: $1"; }
nx_bad()  { printf '    %s✗%s %s\n' "$NX_C_RED" "$NX_C_RESET" "$1"; nx_log "  FAIL: $1"; }

# nx_hint "what the user should do if the current step fails"
nx_hint() { NX_CURRENT_HINT="$1"; }

# ---------------------------------------------------------------------------
# Platform helpers
# ---------------------------------------------------------------------------

nx_is_macos() { [ "$(uname -s)" = "Darwin" ]; }

# Open a file or URL with whatever the platform provides. Never fails the build.
nx_open() {
  local target="$1"
  if command -v open >/dev/null 2>&1; then
    open "$target" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$target" >/dev/null 2>&1 || true
  else
    printf '    Open this yourself: %s\n' "$target"
  fi
}

# True when an Apple build toolchain is usable (Xcode or Command Line Tools).
nx_has_apple_toolchain() {
  nx_is_macos || return 1
  command -v xcodebuild >/dev/null 2>&1 || command -v swift >/dev/null 2>&1
}

nx_has_full_xcode() {
  nx_is_macos || return 1
  command -v xcodebuild >/dev/null 2>&1 || return 1
  local dev
  dev="$(xcode-select -p 2>/dev/null || echo "")"
  case "$dev" in
    *Xcode.app*) return 0 ;;
    *) return 1 ;;
  esac
}

# Swift on this machine: the Apple toolchain on macOS, or /opt/swift on Linux CI.
nx_swift_bin() {
  if command -v swift >/dev/null 2>&1; then
    command -v swift
  elif [ -x /opt/swift/usr/bin/swift ]; then
    echo /opt/swift/usr/bin/swift
  else
    echo ""
  fi
}

nx_port_busy() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    return 1
  fi
  # Fallback for machines without lsof.
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1 && return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Running commands
# ---------------------------------------------------------------------------

# nx_run "Human description" command args...
# Streams a short spinner-free progress line, sends all output to the log, and
# fails the script (through the ERR trap) if the command fails.
nx_run() {
  local label="$1"; shift
  NX_CURRENT_STEP="$label"
  printf '    %s…%s %s' "$NX_C_DIM" "$NX_C_RESET" "$label"
  nx_log "  RUN: $label :: $*"
  if "$@" >> "$NX_LOG_FILE" 2>&1; then
    printf '\r    %s✓%s %s%*s\n' "$NX_C_GREEN" "$NX_C_RESET" "$label" 8 ""
    return 0
  fi
  local code=$?
  printf '\r    %s✗%s %s%*s\n' "$NX_C_RED" "$NX_C_RESET" "$label" 8 ""
  return $code
}

# Same, but a failure is reported and tolerated (returns non-zero, never traps).
nx_try() {
  local label="$1"; shift
  printf '    %s…%s %s' "$NX_C_DIM" "$NX_C_RESET" "$label"
  nx_log "  TRY: $label :: $*"
  if "$@" >> "$NX_LOG_FILE" 2>&1; then
    printf '\r    %s✓%s %s%*s\n' "$NX_C_GREEN" "$NX_C_RESET" "$label" 8 ""
    return 0
  fi
  printf '\r    %s!%s %s%*s\n' "$NX_C_YELLOW" "$NX_C_RESET" "$label" 8 ""
  return 1
}

# Ask a yes/no question. Defaults to "no" when there is no terminal attached
# (a CI run must never hang waiting for a person).
nx_confirm() {
  local question="$1"
  if [ ! -t 0 ]; then
    nx_log "  CONFIRM (no tty, assuming no): $question"
    return 1
  fi
  local answer=""
  printf '\n    %s%s%s\n    Type %syes%s and press Return to continue, or just press Return to skip: ' \
    "$NX_C_BOLD" "$question" "$NX_C_RESET" "$NX_C_BOLD" "$NX_C_RESET"
  read -r answer || answer=""
  case "$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')" in
    y|yes) nx_log "  CONFIRM yes: $question"; return 0 ;;
    *)     nx_log "  CONFIRM no: $question";  return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------

nx_write_diagnostic() {
  local exit_code="$1"
  local line_no="${2:-unknown}"
  mkdir -p "$NX_DIST"

  local tail_log
  tail_log="$(tail -n 60 "$NX_LOG_FILE" 2>/dev/null || echo "(the log file could not be read)")"

  {
    echo "# Nexus OS — something went wrong"
    echo
    echo "This file was written automatically because a step did not finish."
    echo "Nothing is broken permanently, and nothing was installed halfway that"
    echo "you need to clean up by hand."
    echo
    echo "| | |"
    echo "| --- | --- |"
    echo "| **What was running** | \`$NX_TASK\` |"
    echo "| **Started** | $NX_STARTED_AT |"
    echo "| **Stopped** | $(date +"%Y-%m-%d %H:%M:%S") |"
    echo "| **Computer** | $(uname -s) $(uname -r) ($(uname -m)) |"
    echo
    echo "## What Nexus was trying to do"
    echo
    echo "$NX_CURRENT_STEP"
    echo
    echo "## What happened"
    echo
    echo "That step stopped with error code $exit_code (script line $line_no)."
    echo "The last part of the technical log is at the bottom of this file — you do"
    echo "not need to understand it, but support does."
    echo
    echo "## What to do next"
    echo
    echo "1. $NX_CURRENT_HINT"
    echo "2. If that does not help, try again once — some failures are just a"
    echo "   dropped internet connection while downloading."
    echo "3. If it still fails, send the log file below to support. It contains no"
    echo "   passwords or keys."
    echo
    echo "## Full log"
    echo
    echo "\`$NX_LOG_FILE\`"
    echo
    echo "## Last 60 lines of the log"
    echo
    echo '```'
    echo "$tail_log"
    echo '```'
  } > "$NX_REPORT"
}

nx_on_error() {
  local exit_code="$1"
  local line_no="${2:-unknown}"
  [ "$NX_FAILED" -eq 1 ] && return 0
  NX_FAILED=1

  printf '\n%s  Something went wrong.%s\n' "$NX_C_BOLD$NX_C_RED" "$NX_C_RESET"
  printf '    While: %s\n' "$NX_CURRENT_STEP"
  printf '    What to do: %s\n' "$NX_CURRENT_HINT"
  printf '    A plain-English report is opening now.\n'
  printf '    Report: %s\n' "$NX_REPORT"
  printf '    Log:    %s\n\n' "$NX_LOG_FILE"

  nx_write_diagnostic "$exit_code" "$line_no"
  if [ -n "$NX_CLEANUP_HOOK" ]; then
    nx_log "running cleanup hook"
    "$NX_CLEANUP_HOOK" || true
  fi
  nx_open "$NX_REPORT"
  exit "$exit_code"
}

nx_install_traps() {
  trap 'nx_on_error $? $LINENO' ERR
  trap 'nx_on_error 130 0' INT
}

nx_finished() {
  local message="$1"
  printf '\n%s  %s%s\n' "$NX_C_BOLD$NX_C_GREEN" "$message" "$NX_C_RESET"
  printf '    Full log: %s\n\n' "$NX_LOG_FILE"
  nx_log "=== finished: $message ==="
}

# ---------------------------------------------------------------------------
# Small shared helpers used by more than one entry point
# ---------------------------------------------------------------------------

nx_project_version() {
  node -e 'process.stdout.write(require("./package.json").version)' 2>/dev/null || echo "0.0.0"
}

# Wait for an HTTP endpoint to answer. nx_wait_for_http URL SECONDS
nx_wait_for_http() {
  local url="$1"; local limit="${2:-90}"; local waited=0
  while [ "$waited" -lt "$limit" ]; do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
    if [ $((waited % 10)) -eq 0 ]; then
      nx_info "still waiting (${waited}s)…"
    fi
  done
  return 1
}

# Checksums, with the tool that exists on this platform.
nx_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$@"
  else
    sha256sum "$@"
  fi
}

# The Node runtime, preferring a Homebrew/official install over anything odd.
nx_require_node() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

nx_node_major() {
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}
