/** Fixed shared target that is not a child record (PRD §3). */
export const CASA_TARGET = {
  kind: "casa" as const,
  label: "Casa",
};

export type ChildTarget = {
  kind: "child";
  childId: string;
  label: string;
};

export type SharedTarget = typeof CASA_TARGET | ChildTarget;

export function isCasaTarget(target: SharedTarget): target is typeof CASA_TARGET {
  return target.kind === "casa";
}

export function listSharedTargets(children: { id: string; name: string }[]): SharedTarget[] {
  return [
    CASA_TARGET,
    ...children.map((child) => ({
      kind: "child" as const,
      childId: child.id,
      label: child.name,
    })),
  ];
}
