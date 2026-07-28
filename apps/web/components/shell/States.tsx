"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { Button } from "./Primitives";
import type { ProblemReport } from "@/lib/client/types";

/**
 * The three states every data-bearing surface in Nexus OS must be able to show.
 *
 * They live together so that "loading", "nothing here yet" and "this went wrong"
 * are always phrased the same way, and so that an error can never be rendered
 * without the next step that fixes it.
 */

export function Skeleton({ width = "100%", height = 14 }: { width?: string | number; height?: string | number }) {
  return <div className="nx-skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonStack({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="nx-skeleton-stack" role="status" aria-live="polite" aria-busy="true">
      <span className="nx-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} width={index === rows - 1 ? "62%" : "100%"} height={index === 0 ? 22 : 13} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "square.stack",
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="nx-state">
      <span className="nx-state__icon">
        <Icon name={icon} size={18} />
      </span>
      <div>
        <div className="nx-state__title">{title}</div>
        <p className="nx-state__body">{body}</p>
      </div>
      {action ? <div className="nx-state__actions">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  problem,
  onRetry,
  variant = "error",
}: {
  title?: string;
  problem: ProblemReport;
  onRetry?: () => void;
  variant?: "error" | "notice";
}) {
  return (
    <div className={`nx-state ${variant === "error" ? "nx-state--error" : "nx-state--notice"}`} role="alert">
      <span className="nx-state__icon">
        <Icon name="exclamationmark.triangle" size={18} />
      </span>
      <div>
        <div className="nx-state__title">{title ?? problem.message}</div>
        <p className="nx-state__body">{title ? `${problem.message} ${problem.nextStep}` : problem.nextStep}</p>
      </div>
      <div className="nx-state__actions">
        {onRetry ? (
          <Button variant="secondary" size="small" icon="arrow.clockwise" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        {problem.href ? (
          <Link href={problem.href} className="nx-button nx-button--ghost nx-button--small">
            Open the screen that fixes this
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A compact inline version used inside widgets and popovers, where a full error
 * block would dominate. It still carries the next step.
 */
export function InlineProblem({ problem, onRetry }: { problem: ProblemReport; onRetry?: () => void }) {
  return (
    <div className="nx-stack" style={{ gap: "var(--nx-space-2)" }} role="status">
      <div className="nx-row" style={{ gap: "var(--nx-space-2)" }}>
        <Icon name="exclamationmark.triangle" size={15} />
        <strong style={{ fontSize: "var(--nx-text-sm)" }}>{problem.message}</strong>
      </div>
      <p className="nx-field__help">{problem.nextStep}</p>
      {onRetry ? (
        <Button variant="ghost" size="small" icon="arrow.clockwise" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
