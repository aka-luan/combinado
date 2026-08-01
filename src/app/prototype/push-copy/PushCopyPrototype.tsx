"use client";

// PROTÓTIPO DESCARTÁVEL — três hierarquias de copy, alternadas por ?variant=, na rota /prototype/push-copy.
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PrototypeSwitcher, type PrototypeVariant } from "../../../components/prototype/PrototypeSwitcher";
import styles from "./PushCopyPrototype.module.css";

type ScenarioKey = "dose" | "dose-long-name" | "dose-long-instruction" | "summary" | "summary-singular" | "summary-zero" | "test";
type CopyPayload = { title: string; body: string };
type Scenario = {
  label: string;
  kind: "Dose" | "Resumo" | "Teste";
  child?: string;
  medicine?: string;
  time?: string;
  instruction?: string;
  commitments?: number;
  doses?: number;
  unowned?: number;
};

const variants: PrototypeVariant[] = [
  { key: "A", name: "Ação primeiro" },
  { key: "B", name: "Identidade primeiro" },
  { key: "C", name: "Horário ou total primeiro" },
];

const scenarios: Record<ScenarioKey, Scenario> = {
  dose: { label: "Dose comum", kind: "Dose", child: "Nina", medicine: "Amoxicilina", time: "08:00" },
  "dose-long-name": { label: "Nomes longos", kind: "Dose", child: "Maria Eduarda", medicine: "Cloridrato de desloratadina", time: "20:30" },
  "dose-long-instruction": { label: "Instrução longa", kind: "Dose", child: "Nina", medicine: "Amoxicilina", time: "08:00", instruction: "agitar o frasco antes de usar e manter o texto exatamente como foi registrado pela Casa" },
  summary: { label: "Resumo plural", kind: "Resumo", commitments: 2, doses: 3, unowned: 1 },
  "summary-singular": { label: "Resumo singular", kind: "Resumo", commitments: 1, doses: 1, unowned: 1 },
  "summary-zero": { label: "Categoria zerada", kind: "Resumo", commitments: 0, doses: 3, unowned: 1 },
  test: { label: "Notificação de teste", kind: "Teste" },
};

function noun(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sentenceParts(scenario: Scenario) {
  return [
    scenario.commitments ? noun(scenario.commitments, "compromisso", "compromissos") : null,
    scenario.doses ? noun(scenario.doses, "dose", "doses") : null,
    scenario.unowned ? noun(scenario.unowned, "item sem Responsável", "itens sem Responsável") : null,
  ].filter((part): part is string => Boolean(part));
}

function joinPtBr(parts: string[]) {
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

function copyFor(variant: string, scenario: Scenario): CopyPayload {
  if (scenario.kind === "Teste") {
    if (variant === "B") return { title: "Notificação de teste", body: "Este teste chegou a este aparelho." };
    if (variant === "C") return { title: "Teste recebido", body: "O Combinado entregou esta notificação neste aparelho." };
    return { title: "Teste do Combinado", body: "Notificação de teste recebida neste aparelho." };
  }

  if (scenario.kind === "Resumo") {
    const total = (scenario.commitments ?? 0) + (scenario.doses ?? 0) + (scenario.unowned ?? 0);
    if (variant === "B") {
      return {
        title: "Resumo de amanhã",
        body: `Compromissos: ${scenario.commitments} · Doses: ${scenario.doses} · Sem Responsável: ${scenario.unowned}`,
      };
    }
    if (variant === "C") {
      return { title: `Amanhã: ${noun(total, "ocorrência", "ocorrências")}`, body: sentenceParts(scenario).join(" · ") };
    }
    return { title: "Amanhã no Combinado", body: `${joinPtBr(sentenceParts(scenario))}.` };
  }

  const identity = `${scenario.child} · ${scenario.medicine}`;
  const instruction = scenario.instruction ? `\nInstrução registrada: ${scenario.instruction}` : "";
  if (variant === "B") return { title: identity, body: `${scenario.time} · Verifique no Registro.${instruction}` };
  if (variant === "C") return { title: `Dose das ${scenario.time}`, body: `${identity}. Hora de verificar no Registro.${instruction}` };
  return { title: "Hora de verificar", body: `${identity} · ${scenario.time}.${instruction}` };
}

function VariantNote({ variant }: { variant: string }) {
  const notes: Record<string, { thesis: string; tradeoff: string; order: string }> = {
    A: { thesis: "O título explica a ação; o corpo preserva todos os detalhes essenciais em sequência.", tradeoff: "O título é estável, mas não identifica a dose quando o corpo está oculto.", order: "ação → criança → medicamento → horário → instrução" },
    B: { thesis: "A identidade da dose ocupa o espaço mais proeminente; a ação vem depois.", tradeoff: "Nomes longos podem consumir o título antes que o horário apareça.", order: "criança → medicamento → horário → ação → instrução" },
    C: { thesis: "O dado mais escaneável abre o título: horário para dose, total para resumo.", tradeoff: "Cria títulos diferentes por tipo e pode dar peso excessivo ao total agregado.", order: "horário/total → criança → medicamento → ação → instrução" },
  };
  const note = notes[variant] ?? notes.A;
  return <section className={styles.rationale}><p>{note.thesis}</p><dl><div><dt>Ordem</dt><dd>{note.order}</dd></div><div><dt>Risco</dt><dd>{note.tradeoff}</dd></div></dl></section>;
}

export function PushCopyPrototype() {
  const searchParams = useSearchParams();
  const requestedVariant = searchParams.get("variant")?.toUpperCase() ?? "A";
  const variant = variants.some((item) => item.key === requestedVariant) ? requestedVariant : "A";
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>("dose");
  const [visibleLines, setVisibleLines] = useState(3);
  const scenario = scenarios[scenarioKey];
  const payload = copyFor(variant, scenario);

  return (
    <main className={styles.stage}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>PROTÓTIPO DESCARTÁVEL · COPY DE PUSH</span>
        <h1>O essencial sobrevive ao corte?</h1>
        <p>Compare a hierarquia, não o acabamento. A simulação é direcional; o iPhone real decide o truncamento.</p>
      </header>

      <section className={styles.controls} aria-label="Cenário do protótipo">
        <label>Caso<select value={scenarioKey} onChange={(event) => setScenarioKey(event.target.value as ScenarioKey)}>{Object.entries(scenarios).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
        <label>Linhas simuladas<select value={visibleLines} onChange={(event) => setVisibleLines(Number(event.target.value))}><option value={2}>2 linhas</option><option value={3}>3 linhas</option><option value={4}>4 linhas</option></select></label>
      </section>

      <section className={styles.workspace}>
        <div className={styles.phone} aria-label={`Prévia da variante ${variant}`}>
          <div className={styles.dynamicIsland} />
          <div className={styles.lockHeader}><strong>22:00</strong><span>sábado, 1 de agosto</span></div>
          <article className={styles.notification}>
            <div className={styles.appRow}><span className={styles.icon}>C</span><strong>COMBINADO</strong><time>agora</time></div>
            <h2>{payload.title}</h2>
            <p style={{ WebkitLineClamp: visibleLines }}>{payload.body}</p>
          </article>
          <small className={styles.simulationNote}>Simulação com prévias habilitadas</small>
        </div>

        <aside className={styles.inspector}>
          <div className={styles.variantTitle}><span>Variante {variant}</span><strong>{variants.find((item) => item.key === variant)?.name}</strong></div>
          <VariantNote variant={variant} />
          <section className={styles.payload}>
            <h2>Payload completo</h2>
            <dl><div><dt>Título · {payload.title.length}</dt><dd>{payload.title}</dd></div><div><dt>Corpo · {payload.body.length}</dt><dd>{payload.body}</dd></div></dl>
          </section>
          <p className={styles.guardrail}>Sem orçamento fixo de caracteres. Criança, medicamento e horário precisam vir antes da instrução literal.</p>
        </aside>
      </section>

      <PrototypeSwitcher variants={variants} current={variant} />
    </main>
  );
}
