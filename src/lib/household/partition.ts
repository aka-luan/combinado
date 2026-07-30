import type { ChildRow } from "./types";

export function partitionChildren(children: ChildRow[]): {
  active: ChildRow[];
  archived: ChildRow[];
} {
  const active: ChildRow[] = [];
  const archived: ChildRow[] = [];
  for (const child of children) {
    if (child.archived_at) archived.push(child);
    else active.push(child);
  }
  return { active, archived };
}
