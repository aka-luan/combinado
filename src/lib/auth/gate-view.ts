export type GateView = "config-missing" | "loading" | "login" | "authenticated";

export type GateState = {
  configured: boolean;
  status: "loading" | "ready";
  hasSession: boolean;
};

export function resolveGateView(state: GateState): GateView {
  if (!state.configured) return "config-missing";
  if (state.status === "loading") return "loading";
  return state.hasSession ? "authenticated" : "login";
}
