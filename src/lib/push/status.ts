/**
 * Settings surface (PRD §10.4) distinguishes three user-facing states plus
 * two non-actionable diagnostics used when the environment cannot push.
 */
export type PushUiStatus =
  | "active"
  | "permission-required"
  | "reinstall-required"
  | "unsupported"
  | "config-missing";

export type PushStatusInput = {
  pushSupported: boolean;
  vapidConfigured: boolean;
  installed: boolean;
  permission: NotificationPermission | "unsupported";
  hasSubscription: boolean;
};

export function resolvePushStatus(input: PushStatusInput): PushUiStatus {
  if (!input.vapidConfigured) return "config-missing";
  if (!input.pushSupported) return "unsupported";
  if (!input.installed) return "reinstall-required";
  if (input.permission === "denied" || input.permission === "default") {
    return "permission-required";
  }
  if (input.permission === "granted" && input.hasSubscription) return "active";
  // Permission remains granted but the local subscription is gone — repair
  // may recreate it; until then Settings asks for reinstall/repair.
  return "reinstall-required";
}
