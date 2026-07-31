/**
 * Separates immediate UI feedback timing from server persistence (PRD §19).
 * Callers mark feedback before awaiting persistence so measurements stay distinct.
 */
export type ActionPhaseMarks = {
  feedbackAt: number;
  persistenceStartedAt: number;
  persistenceEndedAt: number;
};

export async function runWithSeparatedPhases<T>(options: {
  onImmediateFeedback: () => void;
  persist: () => Promise<T>;
  now?: () => number;
}): Promise<{ result: T; marks: ActionPhaseMarks }> {
  const now = options.now ?? (() => performance.now());
  const feedbackAt = now();
  options.onImmediateFeedback();
  const persistenceStartedAt = now();
  const result = await options.persist();
  const persistenceEndedAt = now();
  return {
    result,
    marks: { feedbackAt, persistenceStartedAt, persistenceEndedAt },
  };
}
