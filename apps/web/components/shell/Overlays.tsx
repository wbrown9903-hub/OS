"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useDismissOnOutside, useFocusTrap } from "@/lib/client/focus-trap";
import { useShell } from "@/lib/client/shell-store";
import { Button, IconButton } from "./Primitives";
import { Icon } from "./Icon";

/** Portals are only available after mount; this keeps server and client agreeing. */
function usePortalTarget(): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.body), []);
  return target;
}

/* -------------------------------------------------------------------------- */
/* Popover                                                                     */
/* -------------------------------------------------------------------------- */

export function Popover({
  anchorRef,
  open,
  onClose,
  title,
  align = "end",
  width = 320,
  children,
  labelledBy,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  title?: string;
  align?: "start" | "end";
  width?: number;
  children: ReactNode;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const portalTarget = usePortalTarget();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - 12;
    const left = align === "end" ? rect.right - width : rect.left;
    setPosition({ top: rect.bottom + 8, left: Math.max(12, Math.min(left, maxLeft)) });
  }, [anchorRef, align, width]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  useFocusTrap(panelRef, { active: open, onEscape: onClose });
  useDismissOnOutside(panelRef, { active: open, onDismiss: onClose, ignoreRef: anchorRef });

  if (!open || !portalTarget || !position) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="nx-popover"
      role="dialog"
      aria-modal="false"
      aria-label={labelledBy ? undefined : title}
      aria-labelledby={labelledBy}
      style={{ top: position.top, left: position.left, width }}
      tabIndex={-1}
    >
      {title ? <div className="nx-popover__title">{title}</div> : null}
      {children}
    </div>,
    portalTarget,
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                      */
/* -------------------------------------------------------------------------- */

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const portalTarget = usePortalTarget();
  useFocusTrap(dialogRef, { active: open, onEscape: onClose });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="nx-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className="nx-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="nx-row nx-row--between">
          <h2 className="nx-dialog__title">{title}</h2>
          <IconButton icon="xmark" label="Close this dialog" onClick={onClose} />
        </div>
        <div className="nx-dialog__body">{children}</div>
        {actions ? <div className="nx-dialog__actions">{actions}</div> : null}
      </div>
    </div>,
    portalTarget,
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmation host — the single place a consequential action is agreed to     */
/* -------------------------------------------------------------------------- */

export function ConfirmationHost() {
  const { pendingConfirm, resolveConfirm } = useShell();

  return (
    <Dialog
      open={pendingConfirm !== null}
      onClose={() => resolveConfirm(false)}
      title={pendingConfirm?.title ?? ""}
      actions={
        pendingConfirm ? (
          <>
            <Button variant="ghost" onClick={() => resolveConfirm(false)}>
              {pendingConfirm.cancelLabel}
            </Button>
            <Button
              variant={pendingConfirm.destructive ? "danger" : "primary"}
              onClick={() => resolveConfirm(true)}
              autoFocus
            >
              {pendingConfirm.confirmLabel}
            </Button>
          </>
        ) : null
      }
    >
      <p>{pendingConfirm?.body}</p>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

const TOAST_ICON: Record<string, string> = {
  info: "info.circle",
  positive: "checkmark",
  caution: "exclamationmark.triangle",
  critical: "exclamationmark.triangle",
};

export function ToastHost() {
  const { toasts, dismissToast } = useShell();
  const portalTarget = usePortalTarget();
  if (!portalTarget || toasts.length === 0) return null;

  return createPortal(
    <div className="nx-toasts" role="region" aria-label="Notices">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`nx-toast ${toast.tone === "critical" ? "nx-toast--critical" : toast.tone === "positive" ? "nx-toast--positive" : ""}`}
          role={toast.tone === "critical" ? "alert" : "status"}
        >
          <Icon name={TOAST_ICON[toast.tone] ?? "info.circle"} size={17} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nx-toast__title">{toast.title}</div>
            <p className="nx-toast__body">{toast.body}</p>
            {toast.href ? (
              <Link href={toast.href} className="nx-toast__body" onClick={() => dismissToast(toast.id)}>
                Open the screen that fixes this
              </Link>
            ) : null}
          </div>
          <IconButton icon="xmark" label="Dismiss this notice" onClick={() => dismissToast(toast.id)} />
        </div>
      ))}
    </div>,
    portalTarget,
  );
}
