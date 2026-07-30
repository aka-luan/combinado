/** Client-side validation for weekly routine create (PRD §8.5). */

export type WeeklyRoutineCreateInput = {
  title: string;
  targetKind: "casa" | "child";
  childId: string | null;
  weekdays: number[];
  scheduledTime: string | null;
  requiresConfirmation: boolean;
  defaultOwnerUserId: string | null;
  validFrom: string;
  validUntil: string | null;
};

export type WeeklyRoutineCreatePayload = {
  title: string;
  targetKind: "casa" | "child";
  childId: string | null;
  weekdays: number[];
  scheduledTime: string | null;
  requiresConfirmation: boolean;
  defaultOwnerUserId: string | null;
  validFrom: string;
  validUntil: string | null;
};

export type NormalizeRoutineResult =
  | { ok: true; data: WeeklyRoutineCreatePayload }
  | { ok: false; error: string };

const TIME_RE = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function uniqueSortedWeekdays(weekdays: number[]): number[] | null {
  const set = new Set<number>();
  for (const day of weekdays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) return null;
    set.add(day);
  }
  if (set.size === 0) return null;
  return [...set].sort((a, b) => a - b);
}

export function normalizeWeeklyRoutineCreate(
  input: WeeklyRoutineCreateInput,
): NormalizeRoutineResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "title_required" };

  if (input.targetKind !== "casa" && input.targetKind !== "child") {
    return { ok: false, error: "invalid_target_kind" };
  }

  if (input.targetKind === "casa" && input.childId) {
    return { ok: false, error: "casa_target_has_child" };
  }
  if (input.targetKind === "child" && !input.childId) {
    return { ok: false, error: "child_required" };
  }

  const weekdays = uniqueSortedWeekdays(input.weekdays);
  if (!weekdays) return { ok: false, error: "weekdays_required" };

  const scheduledTime = input.scheduledTime?.trim() || null;
  if (scheduledTime && !TIME_RE.test(scheduledTime)) {
    return { ok: false, error: "invalid_time" };
  }

  if (!input.validFrom || !DATE_RE.test(input.validFrom)) {
    return { ok: false, error: "valid_from_required" };
  }
  const validUntil = input.validUntil?.trim() || null;
  if (validUntil && !DATE_RE.test(validUntil)) {
    return { ok: false, error: "invalid_valid_until" };
  }
  if (validUntil && validUntil < input.validFrom) {
    return { ok: false, error: "invalid_valid_range" };
  }

  const requiresConfirmation = Boolean(input.requiresConfirmation);
  const defaultOwnerUserId = input.defaultOwnerUserId || null;
  if (!requiresConfirmation && defaultOwnerUserId) {
    return { ok: false, error: "informational_no_owner" };
  }

  return {
    ok: true,
    data: {
      title,
      targetKind: input.targetKind,
      childId: input.targetKind === "child" ? input.childId : null,
      weekdays,
      scheduledTime,
      requiresConfirmation,
      defaultOwnerUserId,
      validFrom: input.validFrom,
      validUntil,
    },
  };
}

/** Local calendar date in the fixed household timezone (`America/Sao_Paulo`). */
export function localDateInHousehold(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
