"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { themes } from "@nexus/schemas";
import { useShell } from "@/lib/client/shell-store";
import { useActionRunner } from "@/lib/client/actions";
import { connectionSummary, describeConnection, formatRelativeTime, TONE_GLYPH } from "@/lib/client/format";
import { Icon } from "./Icon";
import { Badge, Button, IconButton, SliderControl, Segmented, Switch } from "./Primitives";
import { Popover } from "./Overlays";
import { EmptyState, ErrorState, SkeletonStack } from "./States";

/* -------------------------------------------------------------------------- */
/* Clock                                                                       */
/* -------------------------------------------------------------------------- */

function Clock() {
  // Rendered empty on the server: a clock is the one thing guaranteed to differ
  // between the server render and the first client render.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000 * 15);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) {
    return (
      <div className="nx-clock" aria-hidden="true">
        <span className="nx-clock__time">--:--</span>
        <span className="nx-clock__date">&nbsp;</span>
      </div>
    );
  }

  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="nx-clock">
      <time className="nx-clock__time" dateTime={now.toISOString()} aria-label={`Time, ${time}`}>
        {time}
      </time>
      <span className="nx-clock__date">{date}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Workspace switcher                                                          */
/* -------------------------------------------------------------------------- */

function WorkspaceSwitcher() {
  const { document, activeWorkspaceId, setActiveWorkspaceId } = useShell();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const active = document.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? document.workspaces[0];

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="nx-workspace-switch"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={active?.icon ?? "rectangle.3.group"} size={15} />
        <span className="nx-workspace-switch__label">{active?.title ?? "Workspace"}</span>
        <Icon name="chevron.down" size={13} />
      </button>

      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} title="Workspaces" align="start" width={300}>
        <div role="menu" aria-label="Workspaces">
          {document.workspaces.length === 0 ? (
            <EmptyState
              icon="rectangle.3.group"
              title="No workspaces yet"
              body="A workspace groups the dashboards and apps you use for one kind of work."
              action={
                <Link href="/workspaces" className="nx-button nx-button--primary nx-button--small" onClick={() => setOpen(false)}>
                  Create one
                </Link>
              }
            />
          ) : (
            document.workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                role="menuitemradio"
                aria-checked={workspace.id === active?.id}
                aria-current={workspace.id === active?.id ? "true" : undefined}
                className="nx-menu-item"
                onClick={() => {
                  setActiveWorkspaceId(workspace.id);
                  setOpen(false);
                  router.push("/dashboard");
                }}
              >
                <Icon name={workspace.icon} size={16} />
                <span>{workspace.title}</span>
                {workspace.id === active?.id ? <span className="nx-menu-item__meta">Active</span> : null}
              </button>
            ))
          )}
        </div>
        <hr className="nx-divider" style={{ margin: "var(--nx-space-2) 0" }} />
        <Link href="/workspaces" className="nx-menu-item" onClick={() => setOpen(false)}>
          <Icon name="slider.horizontal.3" size={16} />
          Manage workspaces
        </Link>
      </Popover>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* System status                                                               */
/* -------------------------------------------------------------------------- */

function SystemStatus() {
  const { connections, bridge, refreshServices } = useShell();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const summary = connectionSummary(connections.value);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="nx-status-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`nx-indicator nx-indicator--${summary.tone}`} aria-hidden="true">
          {summary.glyph}
        </span>
        <span>{connections.loading ? "Checking…" : summary.label}</span>
      </button>

      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} title="System status" width={340}>
        <div className="nx-stack" style={{ gap: "var(--nx-space-3)" }}>
          <div className="nx-list-row">
            <span className="nx-list-row__icon">
              <Icon name="desktopcomputer" size={17} />
            </span>
            <span className="nx-list-row__text">
              <span className="nx-list-row__title">Nexus Desktop</span>
              <span className="nx-list-row__subtitle">
                {bridge.loading
                  ? "Checking…"
                  : bridge.value.available
                    ? `${bridge.value.deviceName ?? "Connected Mac"}${bridge.value.version ? ` · ${bridge.value.version}` : ""}`
                    : "Not running — app launching and window arranging are unavailable"}
              </span>
            </span>
            <Badge
              tone={bridge.value.available ? "positive" : "neutral"}
              glyph={bridge.value.available ? TONE_GLYPH.positive : TONE_GLYPH.neutral}
            >
              {bridge.value.available ? "Running" : "Not running"}
            </Badge>
          </div>

          {connections.loading ? (
            <SkeletonStack rows={3} label="Checking connections" />
          ) : connections.problem ? (
            <ErrorState problem={connections.problem} onRetry={refreshServices} variant="notice" />
          ) : connections.value.length === 0 ? (
            <EmptyState
              icon="link"
              title="Not signed in to anything"
              body="Nexus OS works fully without any external service. Connect one when you want live information on your dashboard."
              action={
                <Link href="/settings/connections" className="nx-button nx-button--primary nx-button--small" onClick={() => setOpen(false)}>
                  Browse connections
                </Link>
              }
            />
          ) : (
            <div className="nx-stack" style={{ gap: "var(--nx-space-2)" }}>
              {connections.value.map((connection) => {
                const presentation = describeConnection(connection.state);
                return (
                  <Link
                    key={connection.id}
                    href={`/settings/connections/${connection.service}`}
                    className="nx-list-row"
                    onClick={() => setOpen(false)}
                  >
                    <span className="nx-list-row__icon">
                      <Icon name="link" size={16} />
                    </span>
                    <span className="nx-list-row__text">
                      <span className="nx-list-row__title">{connection.label}</span>
                      <span className="nx-list-row__subtitle">
                        Checked {formatRelativeTime(connection.lastCheckedAt)}
                      </span>
                    </span>
                    <Badge tone={presentation.tone} glyph={presentation.glyph}>
                      {presentation.label}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="nx-row" style={{ gap: "var(--nx-space-2)" }}>
            <Button size="small" icon="arrow.clockwise" onClick={refreshServices}>
              Check again
            </Button>
            <Link href="/settings/connections" className="nx-button nx-button--ghost nx-button--small" onClick={() => setOpen(false)}>
              All connections
            </Link>
          </div>
        </div>
      </Popover>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Notification centre                                                         */
/* -------------------------------------------------------------------------- */

function NotificationBell() {
  const { notifications, markAllNotificationsRead, markNotificationRead, refreshServices } = useShell();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const unread = notifications.value.filter((entry) => !entry.read).length;

  return (
    <>
      <span className="nx-bell">
        <IconButton
          ref={anchor}
          icon="bell"
          label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications, none unread"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        />
        {unread > 0 ? (
          <span className="nx-bell__count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </span>

      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} title="Notifications" width={380}>
        <div className="nx-stack" style={{ gap: "var(--nx-space-3)" }}>
          {notifications.loading ? (
            <SkeletonStack rows={3} label="Loading notifications" />
          ) : notifications.problem ? (
            <ErrorState problem={notifications.problem} onRetry={refreshServices} variant="notice" />
          ) : notifications.value.length === 0 ? (
            <EmptyState
              icon="bell"
              title="Nothing to catch up on"
              body="Nexus OS tells you here when a connection needs attention, a workflow fails, or something you asked for is ready."
            />
          ) : (
            <>
              <div className="nx-notifications">
                {notifications.value.map((notification) => (
                  <div
                    key={notification.id}
                    className={`nx-notification ${notification.read ? "" : "nx-notification--unread"}`}
                  >
                    <span className={`nx-indicator nx-indicator--${notification.tone === "info" ? "neutral" : notification.tone}`} aria-hidden="true">
                      {TONE_GLYPH[notification.tone === "info" ? "neutral" : notification.tone]}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="nx-notification__title">{notification.title}</div>
                      <p className="nx-notification__body">{notification.body}</p>
                      <div className="nx-row" style={{ gap: "var(--nx-space-2)", marginTop: "var(--nx-space-1)" }}>
                        <span className="nx-notification__time">{formatRelativeTime(notification.createdAt)}</span>
                        {notification.href ? (
                          <Link
                            href={notification.href}
                            className="nx-notification__time"
                            style={{ color: "var(--nx-accent)" }}
                            onClick={() => {
                              markNotificationRead(notification.id);
                              setOpen(false);
                            }}
                          >
                            Open
                          </Link>
                        ) : null}
                        {!notification.read ? (
                          <button
                            type="button"
                            className="nx-notification__time"
                            style={{ color: "var(--nx-accent)" }}
                            onClick={() => markNotificationRead(notification.id)}
                          >
                            Mark as read
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {unread > 0 ? (
                <Button size="small" icon="checkmark" onClick={markAllNotificationsRead}>
                  Mark all as read
                </Button>
              ) : null}
            </>
          )}
        </div>
      </Popover>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Quick settings                                                              */
/* -------------------------------------------------------------------------- */

function QuickSettings() {
  const { document, applyOperations, resolveContext } = useShell();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const preferences = document.preferences;
  const motionLocked = resolveContext.accessibility.reducedMotion;
  const transparencyLocked =
    resolveContext.accessibility.reducedTransparency || resolveContext.accessibility.highContrast;

  const currentTheme = themes.find((theme) => theme.id === document.themeId) ?? themes[0]!;
  const lightTheme = themes.find((theme) => theme.appearance === "light") ?? currentTheme;
  const darkTheme = themes.find((theme) => theme.appearance === "dark") ?? currentTheme;

  return (
    <>
      <IconButton
        ref={anchor}
        icon="slider.horizontal.3"
        label="Quick settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />

      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} title="Quick settings" width={340}>
        <div className="nx-stack" style={{ gap: "var(--nx-space-4)", padding: "var(--nx-space-2)" }}>
          <div className="nx-field">
            <span className="nx-field__label">Appearance</span>
            <Segmented
              label="Appearance"
              value={currentTheme.appearance}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
              onChange={(appearance) => {
                const target = appearance === "light" ? lightTheme : darkTheme;
                void applyOperations(
                  [{ op: "set", path: ["themeId"], value: target.id }],
                  `Use the ${target.name} theme`,
                );
              }}
            />
            <p className="nx-field__help">Currently using {currentTheme.name}.</p>
          </div>

          <div className="nx-field">
            <span className="nx-field__label">Motion</span>
            {motionLocked ? (
              <p className="nx-field__help">
                Your Mac is set to reduce motion, so animation is switched off everywhere in Nexus OS. Change it in
                System Settings › Accessibility › Display.
              </p>
            ) : (
              <SliderControl
                label="Animation intensity"
                value={Math.round(preferences.animationIntensity * 100)}
                min={0}
                max={100}
                step={5}
                format={(value) => (value === 0 ? "Off" : `${value}%`)}
                onChange={(value) => {
                  void applyOperations(
                    [{ op: "set", path: ["preferences", "animationIntensity"], value: value / 100 }],
                    "Change animation intensity",
                  );
                }}
              />
            )}
          </div>

          <div className="nx-field">
            <span className="nx-field__label">Panel transparency</span>
            {transparencyLocked ? (
              <p className="nx-field__help">
                Panels are opaque because your Mac is set to reduce transparency or increase contrast.
              </p>
            ) : (
              <SliderControl
                label="Panel transparency"
                value={Math.round(preferences.panelTransparency * 100)}
                min={20}
                max={100}
                step={2}
                format={(value) => `${value}%`}
                onChange={(value) => {
                  void applyOperations(
                    [{ op: "set", path: ["preferences", "panelTransparency"], value: value / 100 }],
                    "Change panel transparency",
                  );
                }}
              />
            )}
          </div>

          <div className="nx-field">
            <span className="nx-field__label">Spacing</span>
            <Segmented
              label="Spacing"
              value={preferences.density}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
              onChange={(density) => {
                void applyOperations(
                  [{ op: "set", path: ["preferences", "density"], value: density }],
                  `Use ${density} spacing`,
                );
              }}
            />
          </div>

          <div className="nx-row nx-row--between">
            <span className="nx-field__label" id="quick-sounds-label">
              Sounds
            </span>
            <Switch
              label="Play sounds"
              describedBy="quick-sounds-label"
              checked={preferences.soundsEnabled}
              onChange={(next) => {
                void applyOperations(
                  [{ op: "set", path: ["preferences", "soundsEnabled"], value: next }],
                  next ? "Turn sounds on" : "Turn sounds off",
                );
              }}
            />
          </div>

          <Link href="/settings/appearance" className="nx-button nx-button--secondary nx-button--small nx-button--block" onClick={() => setOpen(false)}>
            All appearance settings
          </Link>
        </div>
      </Popover>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Top bar                                                                     */
/* -------------------------------------------------------------------------- */

export function TopBar() {
  const { document, setPaletteOpen } = useShell();
  const run = useActionRunner();
  const topBar = document.topBar;

  if (!topBar.enabled) return null;

  return (
    <header className="nx-topbar" role="banner">
      <div className="nx-topbar__group">
        <Link href="/dashboard" className="nx-topbar__brand" aria-label={`${document.productName} home`}>
          <span className="nx-topbar__mark" aria-hidden="true" />
          <span>{document.productName}</span>
        </Link>
        <WorkspaceSwitcher />
      </div>

      {topBar.showSearch ? (
        <div className="nx-topbar__group nx-topbar__group--grow">
          <button
            type="button"
            className="nx-search-entry"
            onClick={() => setPaletteOpen(true)}
            aria-keyshortcuts="Meta+K Control+K"
          >
            <Icon name="magnifyingglass" size={15} />
            <span className="nx-search-entry__text">Search apps, settings, help and knowledge</span>
            <span className="nx-search-entry__hint nx-row" style={{ gap: 3, flexWrap: "nowrap" }} aria-hidden="true">
              <span className="nx-kbd">⌘</span>
              <span className="nx-kbd">K</span>
            </span>
          </button>
        </div>
      ) : (
        <div className="nx-topbar__group nx-topbar__group--grow" />
      )}

      <div className="nx-topbar__group">
        {topBar.showSystemStatus ? <SystemStatus /> : null}
        <NotificationBell />
        <QuickSettings />
        {topBar.showClock ? <Clock /> : null}
        <button
          type="button"
          className="nx-exit"
          onClick={() =>
            void run({
              title: "Exit to macOS",
              detail: "Hides the Nexus OS window and returns you to the plain macOS desktop.",
              action: { kind: "exitToDesktop" },
              confirmation: {
                title: "Exit to macOS?",
                body: "The Nexus OS window is hidden and you return to your plain desktop. Nothing is closed and nothing is lost — reopen Nexus OS whenever you like.",
                confirmLabel: "Exit to macOS",
                destructive: false,
              },
            })
          }
        >
          <Icon name="rectangle.portrait.and.arrow.right" size={15} />
          <span>Exit to macOS</span>
        </button>
      </div>
    </header>
  );
}
