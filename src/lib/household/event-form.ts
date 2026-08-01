/** Client-side validation for one-off family commitments (PRD §8.7). */

export type OneOffEventCreateInput = {
  title: string;
  localDate: string;
  targetKind: "casa" | "child";
  childId: string | null;
  scheduledTime: string | null;
  requiresConfirmation: boolean;
  responsibleUserId: string | null;
};

export type NormalizeOneOffEventResult =
  | { ok: true; data: OneOffEventCreateInput }
  | { ok: false; error: string };

const TIME_RE = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Normalizes the only writable fields for a one-off event. The database repeats
 * these checks against the household clock and membership before persisting.
 */
export function normalizeOneOffEventCreate(
  input: OneOffEventCreateInput,
  today: string,
): NormalizeOneOffEventResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "title_required" };
  if (title.length > 120) return { ok: false, error: "title_too_long" };

  if (!isCalendarDate(input.localDate)) return { ok: false, error: "invalid_date" };
  if (!isCalendarDate(today)) return { ok: false, error: "invalid_today" };
  if (input.localDate < today) return { ok: false, error: "date_in_past" };

  if (input.targetKind !== "casa" && input.targetKind !== "child") {
    return { ok: false, error: "invalid_target_kind" };
  }
  if (input.targetKind === "casa" && input.childId) {
    return { ok: false, error: "casa_target_has_child" };
  }
  if (input.targetKind === "child" && !input.childId) {
    return { ok: false, error: "child_required" };
  }

  const scheduledTime = input.scheduledTime?.trim() || null;
  if (scheduledTime && !TIME_RE.test(scheduledTime)) {
    return { ok: false, error: "invalid_time" };
  }

  const requiresConfirmation = Boolean(input.requiresConfirmation);
  const responsibleUserId = input.responsibleUserId || null;
  if (!requiresConfirmation && responsibleUserId) {
    return { ok: false, error: "informational_no_responsible" };
  }

  return {
    ok: true,
    data: {
      title,
      localDate: input.localDate,
      targetKind: input.targetKind,
      childId: input.targetKind === "child" ? input.childId : null,
      scheduledTime,
      requiresConfirmation,
      responsibleUserId,
    },
  };
}

/** Future planning revisions use the same field contract as creation. */
export const normalizeOneOffEventEdit = normalizeOneOffEventCreate;
