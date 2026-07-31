/**
 * Deep links from Web Push into Hoje (PRD §10.1–10.2).
 * - Dose: /?occ=<occurrence_key>
 * - Amanhã summary: /?amanha=1
 */

export type AgendaDeepLink = {
  focusOccurrenceKey: string | null;
  scrollToTomorrow: boolean;
};

export function doseOccurrenceUrl(occurrenceKey: string): string {
  return `/?occ=${encodeURIComponent(occurrenceKey)}`;
}

export function tomorrowSummaryUrl(): string {
  return "/?amanha=1";
}

export function parseAgendaDeepLink(
  href: string | URL | Location,
): AgendaDeepLink {
  let url: URL;
  try {
    if (typeof href === "string") {
      url = new URL(href, "https://combinado.local");
    } else if (href instanceof URL) {
      url = href;
    } else {
      url = new URL(href.href);
    }
  } catch {
    return { focusOccurrenceKey: null, scrollToTomorrow: false };
  }

  const occ = url.searchParams.get("occ");
  const amanha = url.searchParams.get("amanha");

  return {
    focusOccurrenceKey: occ && occ.trim() ? occ.trim() : null,
    scrollToTomorrow: amanha === "1" || amanha === "true",
  };
}
