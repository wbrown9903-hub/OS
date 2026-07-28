import type { ProblemReport } from "./types";

/**
 * A tiny, deliberately opinionated fetch wrapper.
 *
 * Two rules, both from the product contract:
 *   1. A failure is never thrown into a render — it is returned as a value with a
 *      plain-language message and a next step, so the caller has no way to show a
 *      bare spinner forever or an unqualified number.
 *   2. A route that does not exist yet (404) is a *normal* development state and
 *      is reported as such, not as "something went wrong".
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; problem: ProblemReport };

const TIMEOUT_MS = 12_000;

function problemFor(status: number, path: string): ProblemReport {
  if (status === 404) {
    return {
      message: `The service behind ${path} is not running.`,
      nextStep:
        "This part of Nexus OS has not started yet. Everything else keeps working — try again once the app is fully running.",
      href: "/settings/about",
    };
  }
  if (status === 401 || status === 403) {
    return {
      message: "Nexus OS is not allowed to read that yet.",
      nextStep: "Open Permissions and grant access, then try again.",
      href: "/settings/permissions",
    };
  }
  if (status === 409) {
    return {
      message: "Someone else changed this layout while you were editing.",
      nextStep: "Reload the page to pick up the newer version, then repeat your change.",
      href: null,
    };
  }
  if (status === 429) {
    return {
      message: "The service is limiting requests right now.",
      nextStep: "Wait a moment — Nexus OS will retry automatically.",
      href: null,
    };
  }
  if (status >= 500) {
    return {
      message: "The Nexus OS server could not complete that request.",
      nextStep: "Try again. If it keeps happening, open Settings › Recovery and restart in Safe Mode.",
      href: "/settings/recovery",
    };
  }
  return {
    message: `That request was refused (status ${status}).`,
    nextStep: "Try again. If it keeps happening, open Settings › About and report the status code.",
    href: "/settings/about",
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      return { ok: false, problem: problemFor(response.status, path) };
    }

    const text = await response.text();
    if (!text) return { ok: true, data: {} as T };

    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return {
        ok: false,
        problem: {
          message: "The server sent a reply Nexus OS could not read.",
          nextStep: "Reload the page. If it keeps happening, open Settings › Recovery.",
          href: "/settings/recovery",
        },
      };
    }
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      problem: aborted
        ? {
            message: "That request took too long and was stopped.",
            nextStep: "Check your connection, then choose Retry.",
            href: null,
          }
        : {
            message: "Nexus OS could not reach its own server.",
            nextStep: "Check that Nexus OS is still running, then choose Retry.",
            href: null,
          },
    };
  } finally {
    clearTimeout(timer);
  }
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: "GET", cache: "no-store" });
}

export function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}
