#!/usr/bin/env node
/**
 * Nexus OS — preflight.
 *
 * Answers one question honestly: can this computer build and run Nexus OS right
 * now, and if not, what is the single action that fixes each gap?
 *
 * Never throws. Every probe is wrapped, because the whole point of this file is
 * to work on a machine where things are missing.
 *
 * Usage:
 *   node scripts/preflight.mjs              friendly report
 *   node scripts/preflight.mjs --json       machine-readable report
 *   node scripts/preflight.mjs --quiet      only problems
 *
 * Exit code 0 when everything required is present, 1 when something required is
 * missing. Optional gaps (Xcode, Swift on Linux) never fail the exit code.
 */

import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { statfsSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const quiet = args.has("--quiet");

const REQUIRED_NODE_MAJOR = 20;
const REQUIRED_NODE_MINOR = 11;
const REQUIRED_FREE_GB = 5;

/** Ports Nexus uses. Keep in step with apps/web/package.json and the bridge. */
const PORTS = [
  { port: 4311, what: "Nexus Cloud (the web interface)" },
  { port: 4319, what: "Nexus Mac Bridge" },
];

/* -------------------------------------------------------------------------- */
/* Probing helpers — none of these are allowed to throw                        */
/* -------------------------------------------------------------------------- */

function run(command, argv, timeout = 10_000) {
  try {
    const result = spawnSync(command, argv, {
      encoding: "utf8",
      timeout,
      windowsHide: true,
    });
    if (result.error || typeof result.status !== "number") {
      return { ok: false, stdout: "", stderr: String(result.error ?? "not found") };
    }
    return {
      ok: result.status === 0,
      stdout: (result.stdout ?? "").trim(),
      stderr: (result.stderr ?? "").trim(),
    };
  } catch (error) {
    return { ok: false, stdout: "", stderr: String(error) };
  }
}

function which(binary) {
  const probe = run(process.platform === "win32" ? "where" : "which", [binary], 5_000);
  return probe.ok && probe.stdout ? probe.stdout.split("\n")[0].trim() : null;
}

function parseVersion(text) {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text ?? "");
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
    raw: match[0],
  };
}

async function portInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        /* already closed */
      }
      resolve(value);
    };
    server.once("error", (error) => finish(error && error.code === "EADDRINUSE"));
    server.once("listening", () => finish(false));
    try {
      server.listen(port, "127.0.0.1");
    } catch {
      finish(false);
    }
    setTimeout(() => finish(false), 2_000).unref?.();
  });
}

function freeGigabytes(target) {
  try {
    const stats = statfsSync(target);
    return (Number(stats.bavail) * Number(stats.bsize)) / 1024 ** 3;
  } catch {
    const df = run("df", ["-Pk", target]);
    if (!df.ok) return null;
    const line = df.stdout.split("\n").at(-1) ?? "";
    const available = Number(line.trim().split(/\s+/)[3]);
    return Number.isFinite(available) ? available / 1024 / 1024 : null;
  }
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * status: "ok" | "missing" | "warn" | "info"
 * required: true when Nexus cannot run without it on this platform.
 */
const checks = [];

function record(entry) {
  checks.push({ required: false, fix: null, ...entry });
}

const platform = process.platform;
const isMac = platform === "darwin";
const isLinux = platform === "linux";

function checkOperatingSystem() {
  const release = os.release();
  if (isMac) {
    const productVersion = run("sw_vers", ["-productVersion"]).stdout || "unknown";
    const version = parseVersion(productVersion);
    const supported = version ? version.major >= 13 : true;
    record({
      id: "os",
      label: "Operating system",
      detail: `macOS ${productVersion} (${os.arch()})`,
      status: supported ? "ok" : "warn",
      required: true,
      fix: supported
        ? null
        : "Update macOS to version 13 (Ventura) or newer: Apple menu ▸ System Settings ▸ General ▸ Software Update.",
    });
    return;
  }
  record({
    id: "os",
    label: "Operating system",
    detail: `${os.type()} ${release} (${os.arch()})`,
    status: "info",
    required: false,
    fix: isLinux
      ? "This is a Linux machine. The web app, the database and the portable Swift kernel build and test here; the macOS app, the Bridge server, signing and notarisation need a Mac."
      : "Nexus Desktop is a macOS application. The web interface still runs anywhere Node.js runs.",
  });
}

function checkNode() {
  const version = process.versions.node;
  const parsed = parseVersion(version);
  const good =
    parsed &&
    (parsed.major > REQUIRED_NODE_MAJOR ||
      (parsed.major === REQUIRED_NODE_MAJOR && parsed.minor >= REQUIRED_NODE_MINOR));
  record({
    id: "node",
    label: "Node.js",
    detail: `v${version} at ${process.execPath}`,
    status: good ? "ok" : "missing",
    required: true,
    fix: good
      ? null
      : `Install Node.js ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR} or newer from https://nodejs.org (choose the LTS installer), then run this again.`,
  });
}

function checkNpm() {
  const probe = run("npm", ["--version"]);
  const parsed = parseVersion(probe.stdout);
  const good = probe.ok && parsed && parsed.major >= 9;
  record({
    id: "npm",
    label: "npm",
    detail: good ? `v${probe.stdout}` : "not found",
    status: good ? "ok" : "missing",
    required: true,
    fix: good
      ? null
      : "npm comes with Node.js. Reinstall Node.js from https://nodejs.org using the LTS installer.",
  });
}

function checkGit() {
  const probe = run("git", ["--version"]);
  record({
    id: "git",
    label: "Git",
    detail: probe.ok ? probe.stdout : "not found",
    status: probe.ok ? "ok" : "warn",
    required: false,
    fix: probe.ok
      ? null
      : isMac
        ? "Git arrives with the Apple Command Line Tools. Run: xcode-select --install"
        : "Install git with your system package manager.",
  });
}

function checkAppleToolchain() {
  if (!isMac) {
    record({
      id: "xcode",
      label: "Apple build tools",
      detail: "not applicable on this platform",
      status: "info",
      required: false,
      fix: "The Mac app, the Bridge server, code signing and notarisation are built on the user's Mac by scripts/BUILD_NEXUS.command.",
    });
    return;
  }

  const developerDir = run("xcode-select", ["-p"]).stdout;
  const hasFullXcode = developerDir.includes("Xcode.app");
  const hasCommandLineTools = developerDir.length > 0;
  const xcodebuild = which("xcodebuild");

  record({
    id: "xcode",
    label: "Apple build tools",
    detail: hasFullXcode
      ? `Xcode at ${developerDir}`
      : hasCommandLineTools
        ? `Command Line Tools at ${developerDir}`
        : "not installed",
    status: hasFullXcode ? "ok" : hasCommandLineTools ? "warn" : "missing",
    required: false,
    fix: hasFullXcode
      ? null
      : hasCommandLineTools
        ? "Command Line Tools can build the Bridge but not the Nexus Desktop app. Install Xcode free from the Mac App Store, then run: sudo xcode-select --switch /Applications/Xcode.app"
        : "Open Terminal once and run: xcode-select --install — or install Xcode from the Mac App Store. Without it Nexus runs in your browser instead of as a Mac app.",
  });

  if (hasFullXcode && xcodebuild) {
    const licence = run("xcodebuild", ["-checkFirstLaunchStatus"]);
    if (!licence.ok) {
      record({
        id: "xcode-first-launch",
        label: "Xcode first-launch setup",
        detail: "not completed",
        status: "warn",
        required: false,
        fix: "Open Xcode once and accept the licence agreement, or run: sudo xcodebuild -runFirstLaunch",
      });
    }
  }
}

function checkSwift() {
  const swiftPath = which("swift") ?? (existsSync("/opt/swift/usr/bin/swift") ? "/opt/swift/usr/bin/swift" : null);
  if (!swiftPath) {
    record({
      id: "swift",
      label: "Swift compiler",
      detail: "not found",
      status: isMac ? "missing" : "info",
      required: false,
      fix: isMac
        ? "Swift arrives with Xcode or the Command Line Tools. Run: xcode-select --install"
        : "Optional on Linux. Install the Swift toolchain from https://swift.org/download to build and test the portable Nexus kernel.",
    });
    return;
  }
  const probe = run(swiftPath, ["--version"], 30_000);
  const line = (probe.stdout || probe.stderr).split("\n")[0] ?? "unknown";
  record({
    id: "swift",
    label: "Swift compiler",
    detail: `${line.trim()} (${swiftPath})`,
    status: "ok",
    required: false,
    fix: null,
  });
}

function checkDiskSpace() {
  const free = freeGigabytes(REPO_ROOT);
  if (free === null) {
    record({
      id: "disk",
      label: "Free disk space",
      detail: "could not be measured",
      status: "warn",
      required: false,
      fix: "Make sure the disk holding this folder has at least 5 GB free.",
    });
    return;
  }
  const enough = free >= REQUIRED_FREE_GB;
  record({
    id: "disk",
    label: "Free disk space",
    detail: `${free.toFixed(1)} GB available`,
    status: enough ? "ok" : "missing",
    required: true,
    fix: enough
      ? null
      : `Free up disk space until at least ${REQUIRED_FREE_GB} GB is available — open Finder, empty the Trash, then run this again.`,
  });
}

async function checkPorts() {
  for (const { port, what } of PORTS) {
    const busy = await portInUse(port);
    record({
      id: `port-${port}`,
      label: `Port ${port}`,
      detail: busy ? `in use — ${what} cannot start` : `free (${what})`,
      status: busy ? "warn" : "ok",
      required: false,
      fix: busy
        ? `Something is already using port ${port}. Quit the other copy of Nexus (or whatever app is using it) and run this again. To find it: lsof -nP -iTCP:${port} -sTCP:LISTEN`
        : null,
    });
  }
}

function checkProjectFiles() {
  const needed = [
    ["package.json", "the project manifest"],
    ["packages/database/schema.prisma", "the database schema"],
    [".env.example", "the settings template"],
  ];
  const missing = needed.filter(([file]) => !existsSync(path.join(REPO_ROOT, file)));
  record({
    id: "project",
    label: "Project files",
    detail: missing.length === 0 ? "all present" : `missing: ${missing.map(([f]) => f).join(", ")}`,
    status: missing.length === 0 ? "ok" : "missing",
    required: true,
    fix:
      missing.length === 0
        ? null
        : "This folder does not look like a complete copy of Nexus OS. Download it again and unzip it fully before double-clicking anything.",
  });

  const envPath = path.join(REPO_ROOT, ".env");
  record({
    id: "env",
    label: "Local settings file (.env)",
    detail: existsSync(envPath) ? "present" : "not created yet",
    status: existsSync(envPath) ? "ok" : "warn",
    required: false,
    fix: existsSync(envPath)
      ? null
      : "Nexus creates this for you the first time you run START_NEXUS.command — no action needed.",
  });
}

function checkNetwork() {
  const probe = run("curl", ["-fsS", "--max-time", "6", "-o", "/dev/null", "https://registry.npmjs.org/"], 12_000);
  record({
    id: "network",
    label: "Internet access",
    detail: probe.ok ? "reachable (npm registry answered)" : "could not reach the npm registry",
    status: probe.ok ? "ok" : "warn",
    required: false,
    fix: probe.ok
      ? null
      : "The first run downloads components, so it needs internet. Check your Wi-Fi, then run this again. If you are behind a company proxy or VPN, connect to it first.",
  });
}

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

const SYMBOL = { ok: "✓", warn: "!", missing: "✗", info: "·" };

function report() {
  const blockers = checks.filter((c) => c.required && c.status === "missing");
  const warnings = checks.filter((c) => c.status === "warn" || (!c.required && c.status === "missing"));

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          platform,
          arch: os.arch(),
          ready: blockers.length === 0,
          checks,
        },
        null,
        2,
      )}\n`,
    );
    return blockers.length === 0 ? 0 : 1;
  }

  const lines = [];
  lines.push("");
  lines.push("  Nexus OS — checking this computer");
  lines.push("  ──────────────────────────────────────────────────────────");

  for (const check of checks) {
    if (quiet && check.status === "ok") continue;
    lines.push(`  ${SYMBOL[check.status] ?? "·"} ${check.label.padEnd(24)} ${check.detail}`);
  }

  lines.push("");
  if (blockers.length === 0) {
    lines.push("  Everything required is present.");
  } else {
    lines.push(`  ${blockers.length} thing${blockers.length === 1 ? "" : "s"} must be fixed before Nexus can run:`);
    lines.push("");
    blockers.forEach((check, index) => {
      lines.push(`  ${index + 1}. ${check.label} — ${check.detail}`);
      lines.push(`     Do this: ${check.fix}`);
    });
  }

  const notes = warnings.filter((check) => check.fix);
  if (notes.length > 0) {
    lines.push("");
    lines.push("  Worth knowing (Nexus still runs):");
    for (const check of notes) {
      lines.push(`  · ${check.label}: ${check.fix}`);
    }
  }

  const platformNote = checks.find((check) => check.id === "os");
  if (platformNote && platformNote.status === "info" && platformNote.fix) {
    lines.push("");
    lines.push(`  Note: ${platformNote.fix}`);
  }

  lines.push("");
  process.stdout.write(`${lines.join("\n")}\n`);
  return blockers.length === 0 ? 0 : 1;
}

async function main() {
  checkOperatingSystem();
  checkNode();
  checkNpm();
  checkGit();
  checkAppleToolchain();
  checkSwift();
  checkDiskSpace();
  checkProjectFiles();
  await checkPorts();
  checkNetwork();
  process.exitCode = report();
}

main().catch((error) => {
  // Preflight itself failing is still information, not a crash.
  process.stdout.write(
    `\n  Preflight could not finish: ${error instanceof Error ? error.message : String(error)}\n` +
      "  This does not mean your computer is broken. Try running START_NEXUS.command anyway.\n\n",
  );
  process.exitCode = 1;
});
