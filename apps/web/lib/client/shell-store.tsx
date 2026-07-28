"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  commit,
  configDocumentSchema,
  defaultResolveContext,
  styleVariablesFor,
  themeById,
  themeCSSVariables,
  type ConfigDocument,
  type ConnectionState,
  type Operation,
  type ResolveContext,
  type Theme,
  type WidgetDefinition,
} from "@nexus/schemas";
import { apiGet, apiPost } from "./api";
import { fallbackDefinitions, fallbackDocument, fallbackHelpTopics } from "./fallback";
import type {
  BridgeStatus,
  ConnectionRecord,
  HelpTopic,
  NotificationRecord,
  NotificationTone,
  ProblemReport,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export type PanelContent =
  | { kind: "widget"; pageId: string; widgetId: string }
  | { kind: "help"; topicId: string }
  | { kind: "connection"; service: string }
  | { kind: "destination"; href: string };

export interface PanelDescriptor {
  id: string;
  title: string;
  subtitle?: string;
  content: PanelContent;
}

export interface ToastMessage {
  id: string;
  title: string;
  body: string;
  tone: NotificationTone;
  href?: string | null;
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
}

interface Loadable<T> {
  value: T;
  loading: boolean;
  problem: ProblemReport | null;
}

export interface ShellContextValue {
  /* Configuration document ------------------------------------------------- */
  document: ConfigDocument;
  documentSource: "server" | "local";
  documentLoading: boolean;
  documentProblem: ProblemReport | null;
  unsavedLocally: boolean;
  applyOperations: (operations: Operation[], label: string) => Promise<boolean>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  reloadDocument: () => void;

  /* Resolved presentation --------------------------------------------------- */
  theme: Theme;
  resolveContext: ResolveContext;
  styleVariables: Record<string, string>;

  /* Live services ----------------------------------------------------------- */
  definitions: Loadable<WidgetDefinition[]>;
  connections: Loadable<ConnectionRecord[]>;
  bridge: Loadable<BridgeStatus>;
  notifications: Loadable<NotificationRecord[]>;
  helpTopics: Loadable<HelpTopic[]>;
  refreshServices: () => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  /* Navigation state -------------------------------------------------------- */
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  activePageId: string;
  setActivePageId: (id: string) => void;

  /* Overlays ---------------------------------------------------------------- */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean, seed?: string) => void;
  paletteSeed: string;
  panels: PanelDescriptor[];
  openPanel: (panel: PanelDescriptor) => void;
  closePanel: (id: string) => void;
  toasts: ToastMessage[];
  toast: (message: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
  confirm: (request: Partial<ConfirmRequest> & Pick<ConfirmRequest, "title" | "body">) => Promise<boolean>;
  pendingConfirm: ConfirmRequest | null;
  resolveConfirm: (accepted: boolean) => void;

  /* Onboarding -------------------------------------------------------------- */
  onboardingComplete: boolean;
  setOnboardingComplete: (complete: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) {
    throw new Error("useShell was called outside the Nexus OS shell provider.");
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Accessibility and viewport                                                  */
/* -------------------------------------------------------------------------- */

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function useViewport(): { width: number; height: number } {
  // The server has no viewport; 1440x900 matches defaultResolveContext so the
  // first client render agrees with the server render.
  const [size, setSize] = useState({ width: 1440, height: 900 });
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

const ONBOARDING_KEY = "nexus.onboarding.completed";
const WORKSPACE_KEY = "nexus.workspace.active";

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export function ShellProvider({ children }: { children: ReactNode }) {
  const [document, setDocument] = useState<ConfigDocument>(fallbackDocument);
  const [documentSource, setDocumentSource] = useState<"server" | "local">("local");
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentProblem, setDocumentProblem] = useState<ProblemReport | null>(null);
  const [unsavedLocally, setUnsavedLocally] = useState(false);
  const [configNonce, setConfigNonce] = useState(0);
  const [servicesNonce, setServicesNonce] = useState(0);

  const [definitions, setDefinitions] = useState<Loadable<WidgetDefinition[]>>({
    value: fallbackDefinitions,
    loading: true,
    problem: null,
  });
  const [connections, setConnections] = useState<Loadable<ConnectionRecord[]>>({
    value: [],
    loading: true,
    problem: null,
  });
  const [bridge, setBridge] = useState<Loadable<BridgeStatus>>({
    value: { available: false, deviceName: null, version: null },
    loading: true,
    problem: null,
  });
  const [notifications, setNotifications] = useState<Loadable<NotificationRecord[]>>({
    value: [],
    loading: true,
    problem: null,
  });
  const [helpTopics, setHelpTopics] = useState<Loadable<HelpTopic[]>>({
    value: fallbackHelpTopics,
    loading: true,
    problem: null,
  });

  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>("");
  const [activePageId, setActivePageId] = useState<string>("");
  const [paletteOpen, setPaletteOpenState] = useState(false);
  const [paletteSeed, setPaletteSeed] = useState("");
  const [panels, setPanels] = useState<PanelDescriptor[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequest | null>(null);
  const confirmResolver = useRef<((accepted: boolean) => void) | null>(null);
  const [onboardingComplete, setOnboardingCompleteState] = useState(true);

  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const reducedTransparency = useMediaQuery("(prefers-reduced-transparency: reduce)");
  const highContrast = useMediaQuery("(prefers-contrast: more)");
  const viewport = useViewport();

  /* --- Configuration ------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;
    setDocumentLoading(true);
    void apiGet<{ document: unknown; revision?: number }>("/api/config?channel=live").then((result) => {
      if (cancelled) return;
      setDocumentLoading(false);
      if (!result.ok) {
        setDocumentProblem(result.problem);
        setDocumentSource("local");
        return;
      }
      const parsed = configDocumentSchema.safeParse(result.data.document);
      if (!parsed.success) {
        setDocumentProblem({
          message: "The saved layout could not be read.",
          nextStep:
            "Nexus OS is showing its starting layout instead. Open Settings › Backup to restore an earlier version.",
          href: "/settings/backup",
        });
        setDocumentSource("local");
        return;
      }
      setDocument(parsed.data);
      setDocumentSource("server");
      setDocumentProblem(null);
      setUnsavedLocally(false);
    });
    return () => {
      cancelled = true;
    };
  }, [configNonce]);

  /* --- Services ----------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    void apiGet<{ definitions: WidgetDefinition[] }>("/api/widgets").then((result) => {
      if (cancelled) return;
      setDefinitions(
        result.ok && Array.isArray(result.data.definitions)
          ? { value: result.data.definitions, loading: false, problem: null }
          : { value: fallbackDefinitions, loading: false, problem: result.ok ? null : result.problem },
      );
    });

    void apiGet<{ connections: ConnectionRecord[] }>("/api/connections").then((result) => {
      if (cancelled) return;
      setConnections(
        result.ok && Array.isArray(result.data.connections)
          ? { value: result.data.connections, loading: false, problem: null }
          : { value: [], loading: false, problem: result.ok ? null : result.problem },
      );
    });

    void apiGet<BridgeStatus>("/api/bridge/status").then((result) => {
      if (cancelled) return;
      setBridge(
        result.ok
          ? {
              value: {
                available: Boolean(result.data.available),
                deviceName: result.data.deviceName ?? null,
                version: result.data.version ?? null,
              },
              loading: false,
              problem: null,
            }
          : { value: { available: false, deviceName: null, version: null }, loading: false, problem: result.problem },
      );
    });

    void apiGet<{ notifications: NotificationRecord[] }>("/api/notifications").then((result) => {
      if (cancelled) return;
      setNotifications(
        result.ok && Array.isArray(result.data.notifications)
          ? { value: result.data.notifications, loading: false, problem: null }
          : { value: [], loading: false, problem: result.ok ? null : result.problem },
      );
    });

    void apiGet<{ topics: HelpTopic[] }>("/api/help/topics").then((result) => {
      if (cancelled) return;
      setHelpTopics(
        result.ok && Array.isArray(result.data.topics) && result.data.topics.length > 0
          ? { value: result.data.topics, loading: false, problem: null }
          : { value: fallbackHelpTopics, loading: false, problem: result.ok ? null : result.problem },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [servicesNonce]);

  /* --- Persisted local choices -------------------------------------------- */

  useEffect(() => {
    try {
      setOnboardingCompleteState(window.localStorage.getItem(ONBOARDING_KEY) === "true");
      const storedWorkspace = window.localStorage.getItem(WORKSPACE_KEY);
      if (storedWorkspace) setActiveWorkspaceIdState(storedWorkspace);
    } catch {
      // A browser with storage disabled still gets a working shell; it simply
      // shows onboarding again next time.
      setOnboardingCompleteState(false);
    }
  }, []);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    try {
      window.localStorage.setItem(WORKSPACE_KEY, id);
    } catch {
      /* storage unavailable — the choice simply does not persist */
    }
  }, []);

  const setOnboardingComplete = useCallback((complete: boolean) => {
    setOnboardingCompleteState(complete);
    try {
      window.localStorage.setItem(ONBOARDING_KEY, complete ? "true" : "false");
    } catch {
      /* storage unavailable */
    }
  }, []);

  /* --- Keep workspace / page selections valid ------------------------------ */

  useEffect(() => {
    const workspaces = document.workspaces;
    if (workspaces.length === 0) return;
    const exists = workspaces.some((workspace) => workspace.id === activeWorkspaceId);
    if (!exists) setActiveWorkspaceIdState(workspaces[0]!.id);
  }, [document.workspaces, activeWorkspaceId]);

  const activeWorkspace = useMemo(
    () => document.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? document.workspaces[0] ?? null,
    [document.workspaces, activeWorkspaceId],
  );

  useEffect(() => {
    const candidates = activeWorkspace
      ? document.pages.filter((page) => activeWorkspace.pageIds.includes(page.id))
      : document.pages;
    const list = candidates.length > 0 ? candidates : document.pages;
    if (list.length === 0) return;
    if (!list.some((page) => page.id === activePageId)) setActivePageId(list[0]!.id);
  }, [document.pages, activeWorkspace, activePageId]);

  /* --- Resolver context ---------------------------------------------------- */

  const connectionStates = useMemo(() => {
    const states: Record<string, ConnectionState> = {};
    for (const connection of connections.value) states[connection.service] = connection.state;
    return states;
  }, [connections.value]);

  const [now, setNow] = useState(() => new Date(0));
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const resolveContext = useMemo<ResolveContext>(
    () =>
      defaultResolveContext({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        accessibility: { reducedMotion, reducedTransparency, highContrast, fontScale: 1 },
        connections: connectionStates,
        permissions: {},
        bridgeAvailable: bridge.value.available,
        power: null,
        now,
        recoveryMode: false,
      }),
    [viewport.width, viewport.height, reducedMotion, reducedTransparency, highContrast, connectionStates, bridge.value.available, now],
  );

  const theme = useMemo(() => themeById(document.themeId), [document.themeId]);

  const styleVariables = useMemo(
    () => ({ ...themeCSSVariables(theme), ...styleVariablesFor(document, resolveContext) }),
    [theme, document, resolveContext],
  );

  // The tokens are written to the document element rather than a wrapper so that
  // portalled surfaces — the palette, dialogs, panels — inherit them too.
  useEffect(() => {
    const root = window.document.documentElement;
    for (const [name, value] of Object.entries(styleVariables)) root.style.setProperty(name, value);
    root.dataset.appearance = theme.appearance;
    root.dataset.contrast = theme.highContrast || highContrast ? "high" : "normal";
  }, [styleVariables, theme, highContrast]);

  /* --- Editing ------------------------------------------------------------- */

  const toast = useCallback((message: Omit<ToastMessage, "id">) => {
    const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((current) => [...current.slice(-3), { ...message, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
    }, 7000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const applyOperations = useCallback(
    async (operations: Operation[], label: string): Promise<boolean> => {
      let optimistic: ConfigDocument;
      try {
        optimistic = commit(document, operations, { label }).document;
      } catch (error) {
        const recovery =
          error && typeof error === "object" && "recovery" in error
            ? String((error as { recovery: unknown }).recovery)
            : "Reload the page and try again.";
        toast({
          title: "That change could not be made",
          body: `${error instanceof Error ? error.message : "The edit was rejected."} ${recovery}`,
          tone: "critical",
        });
        return false;
      }

      setDocument(optimistic);

      const result = await apiPost<{ document: unknown }>("/api/config/commit", {
        operations,
        label,
        baseRevision: document.revision,
      });

      if (result.ok) {
        const parsed = configDocumentSchema.safeParse(result.data.document);
        if (parsed.success) {
          setDocument(parsed.data);
          setDocumentSource("server");
          setUnsavedLocally(false);
          return true;
        }
      }

      setUnsavedLocally(true);
      toast({
        title: "Changed here, not saved yet",
        body: result.ok
          ? "The server replied with a layout Nexus OS could not read. Your change is active in this window only."
          : `${result.problem.message} Your change is active in this window only.`,
        tone: "caution",
        href: "/settings/backup",
      });
      return false;
    },
    [document, toast],
  );

  const applyHistoryStep = useCallback(
    async (direction: "undo" | "redo") => {
      const result = await apiPost<{ document: unknown }>(`/api/config/${direction}`, {});
      if (!result.ok) {
        toast({
          title: direction === "undo" ? "Nothing was undone" : "Nothing was redone",
          body: `${result.problem.message} ${result.problem.nextStep}`,
          tone: "caution",
        });
        return;
      }
      const parsed = configDocumentSchema.safeParse(result.data.document);
      if (!parsed.success) {
        toast({
          title: "History could not be applied",
          body: "The server returned a layout Nexus OS could not read. Reload the page to see the current version.",
          tone: "critical",
        });
        return;
      }
      setDocument(parsed.data);
      setDocumentSource("server");
      setUnsavedLocally(false);
      toast({
        title: direction === "undo" ? "Change undone" : "Change redone",
        body: "Your layout has been updated.",
        tone: "positive",
      });
    },
    [toast],
  );

  const undo = useCallback(() => applyHistoryStep("undo"), [applyHistoryStep]);
  const redo = useCallback(() => applyHistoryStep("redo"), [applyHistoryStep]);
  const reloadDocument = useCallback(() => setConfigNonce((value) => value + 1), []);
  const refreshServices = useCallback(() => setServicesNonce((value) => value + 1), []);

  /* --- Notifications ------------------------------------------------------- */

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((current) => ({
      ...current,
      value: current.value.map((entry) => (entry.id === id ? { ...entry, read: true } : entry)),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((current) => ({
      ...current,
      value: current.value.map((entry) => ({ ...entry, read: true })),
    }));
  }, []);

  /* --- Overlays ------------------------------------------------------------ */

  const setPaletteOpen = useCallback((open: boolean, seed = "") => {
    setPaletteOpenState(open);
    setPaletteSeed(open ? seed : "");
  }, []);

  const openPanel = useCallback((panel: PanelDescriptor) => {
    setPanels((current) => {
      const existing = current.filter((entry) => entry.id !== panel.id);
      return [...existing, panel];
    });
  }, []);

  const closePanel = useCallback((id: string) => {
    setPanels((current) => current.filter((panel) => panel.id !== id));
  }, []);

  const confirm = useCallback(
    (request: Partial<ConfirmRequest> & Pick<ConfirmRequest, "title" | "body">): Promise<boolean> => {
      setPendingConfirm({
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
        destructive: false,
        ...request,
      });
      return new Promise<boolean>((resolve) => {
        confirmResolver.current = resolve;
      });
    },
    [],
  );

  const resolveConfirm = useCallback((accepted: boolean) => {
    setPendingConfirm(null);
    confirmResolver.current?.(accepted);
    confirmResolver.current = null;
  }, []);

  /* --- Global shortcuts ---------------------------------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const paletteChord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (paletteChord) {
        event.preventDefault();
        setPaletteOpenState((open) => !open);
        setPaletteSeed("");
        return;
      }
      // Slash focuses search, but never while the user is typing somewhere.
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        const typing =
          target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable === true;
        if (!typing) {
          event.preventDefault();
          setPaletteOpenState(true);
          setPaletteSeed("");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({
      document,
      documentSource,
      documentLoading,
      documentProblem,
      unsavedLocally,
      applyOperations,
      undo,
      redo,
      reloadDocument,
      theme,
      resolveContext,
      styleVariables,
      definitions,
      connections,
      bridge,
      notifications,
      helpTopics,
      refreshServices,
      markNotificationRead,
      markAllNotificationsRead,
      activeWorkspaceId: activeWorkspace?.id ?? "",
      setActiveWorkspaceId,
      activePageId,
      setActivePageId,
      paletteOpen,
      setPaletteOpen,
      paletteSeed,
      panels,
      openPanel,
      closePanel,
      toasts,
      toast,
      dismissToast,
      confirm,
      pendingConfirm,
      resolveConfirm,
      onboardingComplete,
      setOnboardingComplete,
    }),
    [
      document,
      documentSource,
      documentLoading,
      documentProblem,
      unsavedLocally,
      applyOperations,
      undo,
      redo,
      reloadDocument,
      theme,
      resolveContext,
      styleVariables,
      definitions,
      connections,
      bridge,
      notifications,
      helpTopics,
      refreshServices,
      markNotificationRead,
      markAllNotificationsRead,
      activeWorkspace,
      setActiveWorkspaceId,
      activePageId,
      paletteOpen,
      setPaletteOpen,
      paletteSeed,
      panels,
      openPanel,
      closePanel,
      toasts,
      toast,
      dismissToast,
      confirm,
      pendingConfirm,
      resolveConfirm,
      onboardingComplete,
      setOnboardingComplete,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
