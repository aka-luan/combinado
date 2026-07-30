/** Dispatched after household child mutations so Hoje can refresh. */
export const HOUSEHOLD_CHANGED_EVENT = "combinado:household-changed";

export function notifyHouseholdChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOUSEHOLD_CHANGED_EVENT));
}
