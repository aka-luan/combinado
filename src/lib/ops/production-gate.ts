/**
 * Two-iPhone production gate catalog (issue #15 / PRD §§2, 20, 21, 25).
 * Maps required evidence to suites and separates automated vs manual blockers.
 */

export type GateCheckKind = "automated" | "manual" | "ops";

export type ProductionGateCheck = {
  id: string;
  requirement: string;
  kind: GateCheckKind;
  /** Repo-relative paths that prove the requirement when kind is automated/ops. */
  evidence: string[];
  notes?: string;
};

/** Canonical PRD §21 + issue #15 checklist — evidence, not new product scope. */
export const PRODUCTION_GATE_CHECKS: readonly ProductionGateCheck[] = [
  {
    id: "occurrence-rules",
    requirement: "Regras de ocorrência (chave, status, alerta sem responsável)",
    kind: "automated",
    evidence: ["tests/sql/agenda_snapshot.sql", "tests/unit/agenda.test.mjs"],
  },
  {
    id: "versioning",
    requirement: "Vigência e versionamento de rotinas/exceções",
    kind: "automated",
    evidence: [
      "tests/sql/weekly_routine_planning.sql",
      "tests/sql/weekly_routine_create.sql",
    ],
  },
  {
    id: "constraints",
    requirement: "Constraints de domínio (título, roles, membership)",
    kind: "automated",
    evidence: [
      "tests/sql/rls_household.sql",
      "tests/sql/household_maintenance.sql",
      "tests/sql/weekly_routine_create.sql",
      "tests/unit/routines.test.mjs",
    ],
  },
  {
    id: "rls",
    requirement: "RLS por household_id + membership (auth.uid())",
    kind: "automated",
    evidence: ["tests/sql/rls_household.sql"],
  },
  {
    id: "concurrent-dose",
    requirement: "Confirmação de dose concorrente — uma ativa",
    kind: "automated",
    evidence: ["tests/sql/medication_doses.sql"],
  },
  {
    id: "concurrent-compromisso",
    requirement: "Conclusão de compromisso concorrente — uma ativa",
    kind: "automated",
    evidence: ["tests/sql/events.sql"],
  },
  {
    id: "clock-19h",
    requirement: "Relógio controlado às 19h (revelar Amanhã)",
    kind: "automated",
    evidence: ["tests/sql/agenda_snapshot.sql", "tests/unit/sync-offline.test.mjs"],
  },
  {
    id: "clock-22h",
    requirement: "Relógio controlado às 22h (ainda Hoje; Amanhã revelado)",
    kind: "automated",
    evidence: ["tests/sql/agenda_snapshot.sql"],
    notes:
      "Agenda às 22h locais. Resumo push 22h é best effort (falha isolada não bloqueia).",
  },
  {
    id: "clock-midnight",
    requirement: "Relógio controlado à meia-noite (virada do dia)",
    kind: "automated",
    evidence: [
      "tests/sql/agenda_snapshot.sql",
      "tests/sql/medication_doses.sql",
      "tests/sql/events.sql",
      "tests/unit/sync-offline.test.mjs",
    ],
  },
  {
    id: "treatment-boundaries",
    requirement: "Início e fim de tratamento / interrupção imediata",
    kind: "automated",
    evidence: ["tests/sql/medication_doses.sql"],
  },
  {
    id: "effective-dates",
    requirement: "Datas efetivas de rotina e arquivo",
    kind: "automated",
    evidence: [
      "tests/sql/weekly_routine_planning.sql",
      "tests/sql/household_maintenance.sql",
    ],
  },
  {
    id: "offline-reconnect",
    requirement: "Cache offline, data obsoleta, reconexão e gate de escrita",
    kind: "automated",
    evidence: ["tests/unit/sync-offline.test.mjs", "tests/unit/service-worker.test.mjs"],
  },
  {
    id: "backup-restore-path",
    requirement: "Caminho de backup cifrado e rehearsal de restauração",
    kind: "automated",
    evidence: [
      "tests/sql/backup_status.sql",
      "tests/unit/backup-status.test.mjs",
      "docs/runbook-backup.md",
    ],
  },
  {
    id: "ops-monitor-runbook",
    requirement: "Estado operacional e runbook no material administrativo",
    kind: "ops",
    evidence: [
      "docs/runbook-ops.md",
      "docs/tabletop-ops.md",
      "src/lib/ops/monitor.ts",
      "scripts/ops/print-monitor.mjs",
    ],
  },
  {
    id: "household-authorized-only",
    requirement: "Produção contém só a Casa autorizada; onboarding nos dois iPhones",
    kind: "manual",
    evidence: ["docs/production-gate.md", "docs/runbook-household.md"],
  },
  {
    id: "simultaneous-taps",
    requirement: "Toques simultâneos nos dois iPhones (dose + compromisso)",
    kind: "manual",
    evidence: ["docs/production-gate.md"],
  },
  {
    id: "push-matrix",
    requirement: "Matriz Wi‑Fi/móvel/Focus; falha só de push documentada",
    kind: "manual",
    evidence: ["docs/push-spike-result.md", "docs/runbook-push.md"],
    notes: "Falha isolada de push não bloqueia quando o Registro compartilhado funciona.",
  },
  {
    id: "offline-both-devices",
    requirement: "Offline/cache/reconnect/update demonstrados nos dois aparelhos",
    kind: "manual",
    evidence: ["docs/production-gate.md", "docs/checklist-a11y-perf.md"],
  },
  {
    id: "backup-fresh-rehearsed",
    requirement: "Frescor de backup saudável e restauração ensaiada",
    kind: "manual",
    evidence: ["docs/runbook-backup.md", "docs/production-gate.md"],
  },
  {
    id: "no-known-blockers",
    requirement:
      "Sem vazamento RLS, dose dupla, falso persistido, perda silenciosa, cache ausente ou onboarding bloqueado",
    kind: "manual",
    evidence: ["docs/production-gate.md"],
  },
  {
    id: "stabilization-week",
    requirement: "Uma semana de estabilização, depois janela de 30 dias (PRD §2)",
    kind: "manual",
    evidence: ["docs/production-gate.md"],
  },
  {
    id: "release-exceptions",
    requirement: "Exceções de release substituem escopo equivalente e atualizam o PRD",
    kind: "manual",
    evidence: ["PRD.md", "docs/production-gate.md"],
  },
] as const;

export function automatedGateChecks(): ProductionGateCheck[] {
  return PRODUCTION_GATE_CHECKS.filter((c) => c.kind === "automated");
}

export function requiredEvidencePaths(): string[] {
  const paths = new Set<string>();
  for (const check of PRODUCTION_GATE_CHECKS) {
    if (check.kind === "manual") continue;
    for (const p of check.evidence) paths.add(p);
  }
  return [...paths].sort();
}

/** Paths from the catalog that are absent from `present` (repo-relative). */
export function missingEvidencePaths(present: ReadonlySet<string>): string[] {
  return requiredEvidencePaths().filter((rel) => !present.has(rel));
}

export function formatProductionGateCatalog(): string {
  const lines = ["Catálogo do gate de produção (PRD §21 / issue #15):"];
  for (const check of PRODUCTION_GATE_CHECKS) {
    lines.push(`- [${check.kind}] ${check.id}: ${check.requirement}`);
  }
  return lines.join("\n");
}

export type GateDecision = "go" | "hold";

export type GateReadiness = {
  decision: GateDecision;
  reasons: string[];
  missingEvidence: string[];
};

export function evaluateGateReadiness(input: {
  presentEvidencePaths: ReadonlySet<string>;
  automatedSuitesPassed: boolean;
  /** Open manual production blockers (ids or short codes). */
  manualBlockersOpen: string[];
  /** True when every release exception is reflected in the PRD (or there are none). */
  releaseExceptionsInPrd: boolean;
}): GateReadiness {
  const missingEvidence = missingEvidencePaths(input.presentEvidencePaths);
  const reasons: string[] = [];

  if (missingEvidence.length > 0) {
    reasons.push(`missing evidence paths: ${missingEvidence.join(", ")}`);
  }
  if (!input.automatedSuitesPassed) {
    reasons.push("automated suites have not passed");
  }
  for (const blocker of input.manualBlockersOpen) {
    reasons.push(`manual blocker open: ${blocker}`);
  }
  if (!input.releaseExceptionsInPrd) {
    reasons.push("release exceptions not reflected in PRD");
  }

  return {
    decision: reasons.length === 0 ? "go" : "hold",
    reasons,
    missingEvidence,
  };
}
