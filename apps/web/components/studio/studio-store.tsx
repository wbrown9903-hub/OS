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
  emptyHistory,
  pushHistory,
  redo as historyRedo,
  replaceDocument,
  undo as historyUndo,
  type ConfigDocument,
  type HistoryState,
  type Page,
  type Theme,
  type Transaction,
  type WidgetDefinition,
  type WidgetNode,
} from "@nexus/schemas";
import { apiGet } from "../../lib/client/api";
import { useShell } from "../../lib/client/shell-store";
import type { ProblemReport } from "../../lib/client/types";
import {
  experienceMode,
  readHistoryEntries,
  themeFor,
  type HistoryEntry,
  type SaveState,
} from "./studio-model";

/**
 * Studio's own state — and deliberately *only* its own state.
 *
 * The configuration document, undo, redo and saving all belong to the shell
 * store and to `packages/schemas`. What lives here is what a person is currently
 * looking at: which page, which widget, which side panel, draft or published.
 */

export type StudioPanel = "inspector" | "gallery" | "theme" | "history" | "json" | "transfer";

export type EditProducer = (
  document: ConfigDocument,
) => { document: ConfigDocument; transaction: Transaction };

export interface StudioContextValue {
  /** The document the canvas draws: the draft when one is open, else the live one. */
  document: ConfigDocument;
  /** The published document, whatever the draft says. */
  publishedDocument: ConfigDocument;
  theme: Theme;
  channel: "live" | "draft";
  startDraft: () => void;
  publishDraft: () => Promise<void>;
  discardDraft: () => Promise<void>;
  pendingChangeCount: number;

  /** Runs one editor gesture. Every change in Studio goes through this. */
  runEdit: (produce: EditProducer, label?: string) => Promise<boolean>;
  saveState: SaveState;

  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;

  page: Page | null;
  pageId: string;
  setPageId: (id: string) => void;
  selectedWidgetId: string | null;
  selectWidget: (id: string | null) => void;
  selectedWidget: WidgetNode | null;
  targetZoneId: string;
  setTargetZoneId: (id: string) => void;

  preview: boolean;
  setPreview: (value: boolean) => void;
  panel: StudioPanel;
  setPanel: (panel: StudioPanel) => void;
  inspectorMode: "beginner" | "standard" | "advanced";

  definitions: WidgetDefinition[];
  definitionsLoading: boolean;
  definitionFor: (type: string) => WidgetDefinition | undefined;
  knownTypes: ReadonlySet<string>;

  history: {
    entries: HistoryEntry[];
    loading: boolean;
    problem: ProblemReport | null;
    reload: () => void;
  };

  /** Announced politely to screen readers whenever something changes. */
  announcement: string;
  announce: (message: string) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio was called outside Nexus Studio.");
  return value;
}

interface DraftState {
  document: ConfigDocument;
  history: HistoryState;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const shell = useShell();
  const {
    document: liveDocument,
    applyOperations,
    toast,
    confirm,
    activePageId,
    setActivePageId,
    definitions: definitionsLoadable,
    unsavedLocally,
  } = shell;

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [targetZoneId, setTargetZoneId] = useState<string>("");
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<StudioPanel>("inspector");
  const [announcement, setAnnouncement] = useState("");

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyProblem, setHistoryProblem] = useState<ProblemReport | null>(null);
  const [historyNonce, setHistoryNonce] = useState(0);

  const activeDocument = draft?.document ?? liveDocument;
  const channel: "live" | "draft" = draft ? "draft" : "live";

  /* --- Version history ----------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    void apiGet<unknown>("/api/config/history?limit=100").then((result) => {
      if (cancelled) return;
      setHistoryLoading(false);
      if (!result.ok) {
        setHistoryProblem(result.problem);
        setHistoryEntries([]);
        return;
      }
      setHistoryProblem(null);
      setHistoryEntries(readHistoryEntries(result.data));
    });
    return () => {
      cancelled = true;
    };
  }, [historyNonce]);

  const reloadHistory = useCallback(() => setHistoryNonce((value) => value + 1), []);

  /* --- Announcements ------------------------------------------------------- */

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  /* --- The one path every edit takes --------------------------------------- */

  const runEdit = useCallback(
    async (produce: EditProducer, label?: string): Promise<boolean> => {
      let result: { document: ConfigDocument; transaction: Transaction };
      try {
        result = produce(activeDocument);
      } catch (error) {
        const message = error instanceof Error ? error.message : "That change could not be made.";
        const recovery =
          error && typeof error === "object" && "recovery" in error
            ? String((error as { recovery: unknown }).recovery)
            : "Reload Nexus Studio and try again.";
        toast({ title: "That change was not made", body: `${message} ${recovery}`, tone: "critical" });
        setSaveState("failed");
        return false;
      }

      if (draft) {
        // A draft is a transaction list that has not been merged into the live
        // document yet — the same list undo and version history already use.
        setDraft({
          document: result.document,
          history: pushHistory(draft.history, result.transaction),
        });
        setSaveState("saved");
        announce(`${label ?? result.transaction.label}. Draft updated.`);
        return true;
      }

      setSaveState("saving");
      const saved = await applyOperations(result.transaction.operations, label ?? result.transaction.label);
      setSaveState(saved ? "saved" : "localOnly");
      announce(`${label ?? result.transaction.label}. ${saved ? "Saved." : "Changed in this window only."}`);
      if (saved) reloadHistory();
      return saved;
    },
    [activeDocument, applyOperations, announce, draft, reloadHistory, toast],
  );

  /* --- Undo and redo ------------------------------------------------------- */

  const undo = useCallback(async () => {
    if (draft) {
      const stepped = historyUndo(draft.document, draft.history);
      if (!stepped.label) {
        toast({
          title: "Nothing left to undo",
          body: "This draft is back at the layout it started from. Publish it, or discard it to leave the draft.",
          tone: "info",
        });
        return;
      }
      setDraft({ document: stepped.document, history: stepped.history });
      announce(`Undid ${stepped.label}.`);
      return;
    }
    await shell.undo();
    reloadHistory();
  }, [announce, draft, reloadHistory, shell, toast]);

  const redo = useCallback(async () => {
    if (draft) {
      const stepped = historyRedo(draft.document, draft.history);
      if (!stepped.label) {
        toast({ title: "Nothing left to redo", body: "This draft is already at its newest change.", tone: "info" });
        return;
      }
      setDraft({ document: stepped.document, history: stepped.history });
      announce(`Redid ${stepped.label}.`);
      return;
    }
    await shell.redo();
    reloadHistory();
  }, [announce, draft, reloadHistory, shell, toast]);

  const canUndo = draft ? draft.history.past.length > 0 : historyEntries.length > 0;
  const canRedo = draft ? draft.history.future.length > 0 : true;

  /* --- Draft and publish --------------------------------------------------- */

  const startDraft = useCallback(() => {
    setDraft({ document: structuredClone(liveDocument), history: emptyHistory });
    setSaveState("idle");
    announce("Draft started. Changes are kept here until you publish them.");
  }, [announce, liveDocument]);

  const publishDraft = useCallback(async () => {
    if (!draft) return;
    if (draft.history.past.length === 0) {
      setDraft(null);
      toast({ title: "Nothing to publish", body: "The draft matched the published layout, so it was closed.", tone: "info" });
      return;
    }
    const accepted = await confirm({
      title: `Publish ${draft.history.past.length} change${draft.history.past.length === 1 ? "" : "s"}?`,
      body: "The dashboard everyone sees will be replaced by this draft. You can undo it afterwards, or restore an earlier version from Version history.",
      confirmLabel: "Publish",
    });
    if (!accepted) return;

    setSaveState("saving");
    const result = replaceDocument(liveDocument, draft.document, `Publish draft (${draft.history.past.length} changes)`);
    const saved = await applyOperations(result.transaction.operations, result.transaction.label);
    setSaveState(saved ? "saved" : "localOnly");
    if (saved) {
      setDraft(null);
      reloadHistory();
      toast({ title: "Draft published", body: "The dashboard now shows your changes.", tone: "positive" });
      announce("Draft published.");
    }
  }, [announce, applyOperations, confirm, draft, liveDocument, reloadHistory, toast]);

  const discardDraft = useCallback(async () => {
    if (!draft) return;
    if (draft.history.past.length > 0) {
      const accepted = await confirm({
        title: `Discard ${draft.history.past.length} unpublished change${draft.history.past.length === 1 ? "" : "s"}?`,
        body: "The draft will be thrown away and Studio will go back to the published layout. This cannot be undone.",
        confirmLabel: "Discard draft",
        destructive: true,
      });
      if (!accepted) return;
    }
    setDraft(null);
    setSaveState("idle");
    announce("Draft discarded.");
  }, [announce, confirm, draft]);

  /* --- Selection ----------------------------------------------------------- */

  const pageId = activePageId || activeDocument.pages[0]?.id || "";
  const page = activeDocument.pages.find((candidate) => candidate.id === pageId) ?? activeDocument.pages[0] ?? null;

  const setPageId = useCallback(
    (id: string) => {
      setActivePageId(id);
      setSelectedWidgetId(null);
    },
    [setActivePageId],
  );

  const selectedWidget = useMemo(
    () => page?.widgets.find((widget) => widget.id === selectedWidgetId) ?? null,
    [page, selectedWidgetId],
  );

  // A widget that was deleted, or a page that changed, must not leave a stale
  // selection pointing at nothing.
  useEffect(() => {
    if (selectedWidgetId && !selectedWidget) setSelectedWidgetId(null);
  }, [selectedWidget, selectedWidgetId]);

  useEffect(() => {
    const zones = page?.zones ?? [];
    if (zones.length === 0) return;
    if (!zones.some((zone) => zone.id === targetZoneId)) setTargetZoneId(zones[0]!.id);
  }, [page, targetZoneId]);

  const selectWidget = useCallback(
    (id: string | null) => {
      setSelectedWidgetId(id);
      if (id) setPanel("inspector");
    },
    [],
  );

  /* --- Derived ------------------------------------------------------------- */

  const theme = useMemo(() => themeFor(activeDocument.themeId), [activeDocument.themeId]);
  const inspectorMode = experienceMode(activeDocument.preferences.experienceLevel);
  const definitions = definitionsLoadable.value;
  const knownTypes = useMemo(
    () => new Set(definitions.map((definition) => definition.type)),
    [definitions],
  );
  const definitionFor = useCallback(
    (type: string) => definitions.find((definition) => definition.type === type),
    [definitions],
  );

  // The shell reports when a save only landed in this window; mirror it so the
  // indicator never claims something was saved when it was not.
  const previousUnsaved = useRef(unsavedLocally);
  useEffect(() => {
    if (unsavedLocally && !previousUnsaved.current) setSaveState("localOnly");
    previousUnsaved.current = unsavedLocally;
  }, [unsavedLocally]);

  const value = useMemo<StudioContextValue>(
    () => ({
      document: activeDocument,
      publishedDocument: liveDocument,
      theme,
      channel,
      startDraft,
      publishDraft,
      discardDraft,
      pendingChangeCount: draft?.history.past.length ?? 0,
      runEdit,
      saveState,
      undo,
      redo,
      canUndo,
      canRedo,
      page,
      pageId,
      setPageId,
      selectedWidgetId,
      selectWidget,
      selectedWidget,
      targetZoneId,
      setTargetZoneId,
      preview,
      setPreview,
      panel,
      setPanel,
      inspectorMode,
      definitions,
      definitionsLoading: definitionsLoadable.loading,
      definitionFor,
      knownTypes,
      history: { entries: historyEntries, loading: historyLoading, problem: historyProblem, reload: reloadHistory },
      announcement,
      announce,
    }),
    [
      activeDocument,
      liveDocument,
      theme,
      channel,
      startDraft,
      publishDraft,
      discardDraft,
      draft,
      runEdit,
      saveState,
      undo,
      redo,
      canUndo,
      canRedo,
      page,
      pageId,
      setPageId,
      selectedWidgetId,
      selectWidget,
      selectedWidget,
      targetZoneId,
      preview,
      panel,
      inspectorMode,
      definitions,
      definitionsLoadable.loading,
      definitionFor,
      knownTypes,
      historyEntries,
      historyLoading,
      historyProblem,
      reloadHistory,
      announcement,
      announce,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
