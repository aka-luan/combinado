/**
 * Pure deep-link focus targets for Hoje (PRD §10.1–10.2).
 * Selectors match data attributes rendered by AgendaHome / OccurrenceRow.
 */
import type { AgendaDeepLink } from "./deep-link";

export function deepLinkFocusSelectors(link: AgendaDeepLink): {
  scrollSelector: string | null;
  highlightSelector: string | null;
} {
  if (link.focusOccurrenceKey) {
    const escaped = cssEscapeAttr(link.focusOccurrenceKey);
    const sel = `[data-occurrence-key="${escaped}"]`;
    return { scrollSelector: sel, highlightSelector: sel };
  }
  if (link.scrollToTomorrow) {
    return {
      scrollSelector: "[data-tomorrow-inline]",
      highlightSelector: "[data-tomorrow-inline]",
    };
  }
  return { scrollSelector: null, highlightSelector: null };
}

/** Minimal attr escape for values we put in CSS attribute selectors. */
function cssEscapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function applyAgendaDeepLinkFocus(
  root: ParentNode,
  link: AgendaDeepLink,
): boolean {
  const { scrollSelector, highlightSelector } = deepLinkFocusSelectors(link);
  if (!scrollSelector) return false;

  const scrollEl = root.querySelector(scrollSelector);
  if (!scrollEl || typeof (scrollEl as HTMLElement).scrollIntoView !== "function") {
    return false;
  }

  (scrollEl as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });

  if (highlightSelector) {
    const highlightEl = root.querySelector(highlightSelector);
    if (highlightEl && highlightEl.classList) {
      highlightEl.classList.add("occurrence--deep-link-focus");
      if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
        window.setTimeout(
          () => highlightEl.classList.remove("occurrence--deep-link-focus"),
          2500,
        );
      }
    }
  }
  return true;
}
