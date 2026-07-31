import type { ChildRow } from "./types";

function localDateInHousehold(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function partitionChildren(children: ChildRow[], localDate = localDateInHousehold()): {
  active: ChildRow[];
  archived: ChildRow[];
} {
  const active: ChildRow[] = [];
  const archived: ChildRow[] = [];
  for (const child of children) {
    if (child.archived_at || child.active_from > localDate) archived.push(child);
    else active.push(child);
  }
  return { active, archived };
}
