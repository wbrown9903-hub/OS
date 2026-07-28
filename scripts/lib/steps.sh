#!/bin/bash
# Nexus OS — the steps that more than one entry point needs.
#
# Source this after scripts/lib/common.sh. Everything here assumes the working
# directory is the repository root.
#
# Each step is written so that a partly-finished project (a package that another
# part of the team has not written yet) produces a clear, honest message rather
# than a crash. Nothing here ever claims a step succeeded when it did not run.

# shellcheck shell=bash
# shellcheck source=/dev/null

NX_WEB_PORT="${NX_WEB_PORT:-4311}"
NX_BRIDGE_PORT="${NX_BRIDGE_PORT:-4319}"
NX_WEB_URL="http://127.0.0.1:${NX_WEB_PORT}"
NX_HEALTH_URL="${NX_WEB_URL}/api/health"

# Pinned so a fresh install is reproducible. Update deliberately, never silently.
NX_NODE_VERSION="22.11.0"

# ---------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------

nx_node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit((a>20||(a===20&&b>=11))?0:1)' >/dev/null 2>&1
}

# Installs Node from the official nodejs.org package — and only ever after the
# person sitting at the computer says yes in words.
nx_install_node_macos() {
  local version="$NX_NODE_VERSION"
  local pkg="node-v${version}.pkg"
  local url="https://nodejs.org/dist/v${version}/${pkg}"
  local sums="https://nodejs.org/dist/v${version}/SHASUMS256.txt"
  local work
  work="$(mktemp -d)"

  nx_hint "Download Node.js ${version} yourself from https://nodejs.org (the LTS button), run the installer, then double-click this file again."
  nx_say "Nexus needs Node.js, which is free software from the Node.js Foundation."
  nx_say "It will be downloaded from the official site: https://nodejs.org"
  nx_say "macOS will ask for your Mac password, because installing it needs permission."

  if ! nx_confirm "Install Node.js ${version} now?"; then
    nx_bad "Node.js was not installed, so Nexus cannot start."
    nx_say "When you are ready: download it from https://nodejs.org, run the"
    nx_say "installer, then double-click this file again."
    return 1
  fi

  nx_run "Downloading Node.js ${version}" curl -fL --retry 3 -o "$work/$pkg" "$url"
  nx_run "Downloading the official checksum list" curl -fL --retry 3 -o "$work/SHASUMS256.txt" "$sums"

  nx_say "Checking the download is genuine…"
  (
    cd "$work"
    grep " ${pkg}\$" SHASUMS256.txt > expected.txt
    nx_sha256 -c expected.txt
  ) >> "$NX_LOG_FILE" 2>&1 || {
    nx_bad "The downloaded file did not match Node.js's published checksum."
    nx_say "Nothing was installed. This usually means the download was interrupted"
    nx_say "or a network is interfering. Try again on a different network."
    rm -rf "$work"
    return 1
  }
  nx_ok "Download verified against the official checksum"

  nx_say "macOS will now ask for your password (it will not be shown as you type)."
  if sudo installer -pkg "$work/$pkg" -target / >> "$NX_LOG_FILE" 2>&1; then
    nx_ok "Node.js ${version} installed"
  else
    nx_bad "The Node.js installer did not finish."
    rm -rf "$work"
    return 1
  fi
  rm -rf "$work"

  # A fresh install lands in /usr/local/bin, which may not be on this shell's PATH yet.
  export PATH="/usr/local/bin:$PATH"
  hash -r 2>/dev/null || true
  nx_node_ok
}

nx_step_node() {
  nx_section "Checking Node.js"
  if nx_node_ok; then
    nx_ok "Node.js $(node -v) is installed"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    nx_warn "Node.js $(node -v) is older than the version Nexus needs (20.11 or newer)."
  else
    nx_warn "Node.js is not installed on this Mac."
  fi

  if nx_is_macos; then
    nx_install_node_macos || return 1
    nx_ok "Node.js $(node -v) is ready"
    return 0
  fi

  nx_bad "Install Node.js 20.11 or newer, then run this again: https://nodejs.org"
  return 1
}

# ---------------------------------------------------------------------------
# Settings file
# ---------------------------------------------------------------------------

nx_step_env() {
  nx_section "Preparing settings"
  nx_hint "Make sure the file .env.example exists in this folder. If it does not, download Nexus again."

  if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
      cp .env.example .env
      nx_ok "Created your personal settings file (.env)"
    else
      nx_bad "The settings template (.env.example) is missing from this folder."
      return 1
    fi
  else
    nx_ok "Settings file found"
  fi

  # Anything the template declares but your .env is missing gets added, so an
  # update that introduces a new setting never leaves you with a broken start.
  if [ -f ".env.example" ]; then
    local added=0 key line
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        ""|\#*) continue ;;
      esac
      key="${line%%=*}"
      [ -z "$key" ] && continue
      if ! grep -q "^${key}=" .env 2>/dev/null; then
        printf '%s\n' "$line" >> .env
        added=$((added + 1))
      fi
    done < .env.example
    [ "$added" -gt 0 ] && nx_ok "Added $added new setting(s) introduced by this version"
  fi

  mkdir -p .nexus
  nx_ok "Local data folder ready"
}

# Fails when a variable the app cannot run without is absent or still a placeholder.
nx_step_validate_env() {
  nx_section "Checking settings make sense"
  nx_hint "Open the file .env in this folder with TextEdit and make sure DATABASE_URL has a value."

  local problems=0
  if ! grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    nx_bad "DATABASE_URL is missing from .env — Nexus does not know where to keep your data."
    problems=$((problems + 1))
  else
    local value
    value="$(grep "^DATABASE_URL=" .env | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
    if [ -z "$value" ]; then
      nx_bad "DATABASE_URL in .env is empty."
      problems=$((problems + 1))
    else
      nx_ok "Database location is set"
    fi
  fi

  # Optional credentials: absent is fine and normal, but say so plainly.
  local optional="ANTHROPIC_API_KEY OPENAI_API_KEY SHOPIFY_API_SECRET WORDPRESS_APP_PASSWORD"
  local name missing=""
  for name in $optional; do
    if ! grep -q "^${name}=.\+" .env 2>/dev/null; then
      missing="$missing $name"
    fi
  done
  if [ -n "$missing" ]; then
    nx_info "Not connected yet (you can add these later inside Nexus):$missing"
  fi

  if [ "$problems" -gt 0 ]; then
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

nx_step_dependencies() {
  nx_section "Installing the parts Nexus is built from"
  nx_hint "This step needs internet. Check your Wi-Fi and try again. If you are on a company network, connect to your VPN first."
  nx_say "The first time, this takes a few minutes. After that it is seconds."

  if [ -f "package-lock.json" ]; then
    if nx_try "Installing (exact recorded versions)" npm ci --no-audit --no-fund; then
      nx_ok "Everything Nexus needs is installed"
      return 0
    fi
    nx_warn "The exact-version install did not work; trying a normal install instead."
  fi

  nx_run "Installing dependencies" npm install --no-audit --no-fund
  nx_ok "Everything Nexus needs is installed"
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

nx_step_prisma_generate() {
  nx_section "Preparing the database tools"
  nx_hint "Run this again. If it keeps failing, delete the node_modules folder and start over — it will be rebuilt."
  nx_run "Generating database client" npx --no-install prisma generate --schema packages/database/schema.prisma
  nx_ok "Database tools ready"
}

nx_step_database() {
  nx_section "Setting up your database"
  nx_hint "Your data lives in the .nexus folder next to this project. If this step keeps failing, quit any other copy of Nexus that is running."

  mkdir -p .nexus

  local migrations="packages/database/migrations"
  if [ -d "$migrations" ] && [ -n "$(ls -A "$migrations" 2>/dev/null)" ]; then
    nx_run "Applying database updates" npx --no-install prisma migrate deploy --schema packages/database/schema.prisma
    nx_ok "Database is up to date"
  else
    # No migration history yet: create the tables directly from the schema.
    nx_run "Creating database tables" npx --no-install prisma db push --schema packages/database/schema.prisma --skip-generate --accept-data-loss
    nx_ok "Database created"
  fi
}

# Seeds only when the database has no user yet, so restarting never duplicates data.
nx_step_seed() {
  nx_section "Adding starter content"

  if [ ! -f "packages/database/seed.ts" ] && [ ! -f "packages/database/seed.mjs" ]; then
    nx_info "This build has no starter content — your Nexus will begin empty."
    return 0
  fi

  local count
  count="$(node -e '
    (async () => {
      try {
        const { PrismaClient } = await import("@prisma/client");
        const prisma = new PrismaClient();
        const users = await prisma.user.count();
        await prisma.$disconnect();
        process.stdout.write(String(users));
      } catch {
        process.stdout.write("unknown");
      }
    })();
  ' 2>/dev/null || echo unknown)"

  if [ "$count" = "0" ] || [ "$count" = "unknown" ]; then
    if nx_try "Adding starter content" npm run db:seed --silent; then
      nx_ok "Starter content added"
    else
      nx_warn "Starter content could not be added. Nexus still works — it just starts empty."
    fi
  else
    nx_ok "Your data is already here ($count account(s)) — nothing to add"
  fi
}

# ---------------------------------------------------------------------------
# Building
# ---------------------------------------------------------------------------

nx_web_build_exists() {
  [ -f "apps/web/.next/BUILD_ID" ]
}

nx_step_build_web() {
  nx_section "Building the Nexus interface"
  nx_hint "This is the slowest step. If it fails, the message in the log usually names one file — send us the log."
  nx_run "Building (this can take a couple of minutes)" npm run build
  nx_ok "Interface built"
}

# Swift: builds only what this machine can actually build, and says which is which.
nx_step_build_swift_kernel() {
  nx_section "Building the Nexus kernel (Swift)"
  local swift
  swift="$(nx_swift_bin)"
  if [ -z "$swift" ]; then
    nx_warn "Swift is not available on this computer, so the kernel was not built."
    nx_say "On a Mac, install Xcode or run: xcode-select --install"
    return 0
  fi
  nx_hint "Open Xcode once and accept its licence, then try again."
  nx_run "Compiling the kernel" "$swift" build --package-path apps/mac-bridge -c release
  nx_ok "Kernel built"
}

nx_step_test_swift_kernel() {
  nx_section "Testing the Nexus kernel (Swift)"
  local swift
  swift="$(nx_swift_bin)"
  if [ -z "$swift" ]; then
    nx_warn "Swift is not available on this computer, so the kernel tests did not run."
    return 0
  fi
  nx_run "Running kernel tests" "$swift" test --package-path apps/mac-bridge
  nx_ok "Kernel tests passed"
}

# The Bridge server and the Desktop app are macOS-only. On any other platform
# these steps report honestly that they were skipped — never that they passed.
nx_step_build_bridge() {
  nx_section "Building the Mac Bridge"
  if ! nx_is_macos; then
    nx_info "Skipped: the Bridge is a macOS program and this is not a Mac."
    return 0
  fi
  if ! nx_has_apple_toolchain; then
    nx_warn "Skipped: Xcode or the Command Line Tools are not installed."
    nx_say "To install them, open Terminal once and run: xcode-select --install"
    return 0
  fi
  if [ ! -f "apps/mac-bridge/Package.swift" ]; then
    nx_warn "Skipped: the Bridge source is not in this download."
    return 0
  fi
  nx_hint "Open Xcode once and accept its licence agreement, then try again."
  nx_run "Compiling the Bridge" swift build --package-path apps/mac-bridge -c release
  nx_ok "Bridge built"
}

# Where the Bridge executable lands, or empty when this build has no server target.
nx_bridge_executable() {
  local candidate="apps/mac-bridge/.build/release/nexus-bridge"
  if [ -x "$candidate" ]; then
    echo "$candidate"
  else
    echo ""
  fi
}

nx_desktop_project_exists() {
  [ -d "apps/desktop-macos" ] && {
    [ -f "apps/desktop-macos/Package.swift" ] ||
      ls apps/desktop-macos/*.xcodeproj >/dev/null 2>&1 ||
      ls apps/desktop-macos/*.xcworkspace >/dev/null 2>&1
  }
}

nx_step_build_desktop() {
  nx_section "Building the Nexus Desktop app"
  if ! nx_is_macos; then
    nx_info "Skipped: the Mac app can only be built on a Mac."
    return 0
  fi
  if ! nx_desktop_project_exists; then
    nx_warn "Skipped: the Mac app source is not in this download."
    nx_say "Nexus will open in your browser instead — everything still works."
    return 0
  fi
  if ! nx_has_full_xcode; then
    nx_warn "Skipped: building the Mac app needs full Xcode, not just the Command Line Tools."
    nx_say "Install Xcode free from the Mac App Store, then run:"
    nx_say "  sudo xcode-select --switch /Applications/Xcode.app"
    nx_say "Until then Nexus opens in your browser, which works the same way."
    return 0
  fi

  nx_hint "Open Xcode once, accept the licence, then run this again."
  if [ -f "apps/desktop-macos/Package.swift" ]; then
    nx_run "Compiling the Mac app" swift build --package-path apps/desktop-macos -c release
  else
    local project
    project="$(ls -d apps/desktop-macos/*.xcodeproj 2>/dev/null | head -n 1)"
    nx_run "Compiling the Mac app" xcodebuild -project "$project" -scheme NexusOS -configuration Release \
      -derivedDataPath dist/DerivedData CODE_SIGNING_ALLOWED=NO build
  fi
  nx_ok "Mac app built"
}
