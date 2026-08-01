"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createChild,
  type ChildRow,
} from "@/lib/household/children";
import { notifyHouseholdChanged } from "@/lib/household/events";
import {
  createMedication,
  type MedicationCreateInput,
} from "@/lib/household/medications";
import { createWeeklyRoutine } from "@/lib/household/routines";
import { localDateInHousehold } from "@/lib/household/routine-form";
import {
  extractAppErrorToken,
  hasUsefulHouseholdSetup,
  householdWriteErrorCopy,
  isSchemaMissingError,
  medicationSchemaMissingCopy,
  schemaMissingCopy,
  type HouseholdSetupProgress,
} from "@/lib/household/setup-home";
import { useInteractionBusy } from "@/lib/pwa/use-interaction-busy";

type SetupStep = "child" | "choice" | "routine" | "medication" | "finish";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

function mapSetupError(
  error: { message?: string; code?: string },
  kind: "child" | "routine" | "medication",
): string {
  if (isSchemaMissingError(error.code, error.message)) {
    return kind === "medication" ? medicationSchemaMissingCopy() : schemaMissingCopy();
  }

  const token = extractAppErrorToken(error.message) ?? error.message;
  switch (token) {
    case "name_required":
      return kind === "medication" ? "Informe o nome do medicamento." : "Informe o nome da Criança.";
    case "title_required":
      return "Informe o título da Rotina semanal.";
    case "weekdays_required":
      return "Escolha ao menos um dia da semana.";
    case "invalid_time":
      return "Horário inválido. Use HH:mm.";
    case "child_required":
      return "Escolha uma Criança.";
    case "slots_required":
      return "Informe ao menos um horário.";
    case "invalid_slot":
      return "Horário inválido. Use HH:mm.";
    case "duplicate_slots":
      return "Horários iguais não podem se repetir.";
    case "valid_from_required":
      return "Informe a data inicial.";
    case "invalid_valid_range":
      return "A data final deve ser depois da inicial.";
    default:
      {
        const mapped = householdWriteErrorCopy(error.message, error.code);
        return mapped === "Não foi possível salvar."
          ? "Não foi possível salvar. Nada foi alterado; tente novamente."
          : mapped;
      }
  }
}

export function HouseholdSetupFlow({
  client,
  activeChildren,
  progress,
  onOpenToday,
}: {
  client: SupabaseClient;
  activeChildren: ChildRow[];
  progress: HouseholdSetupProgress;
  onOpenToday: () => Promise<void>;
}) {
  const [step, setStep] = useState<SetupStep>(activeChildren.length === 0 ? "child" : "choice");
  const [selectedChildId, setSelectedChildId] = useState(activeChildren[0]?.id ?? "");
  const [childName, setChildName] = useState("");
  const [routineTitle, setRoutineTitle] = useState("");
  const [routineWeekdays, setRoutineWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [routineTime, setRoutineTime] = useState("08:00");
  const [medicationName, setMedicationName] = useState("");
  const [medicationSlots, setMedicationSlots] = useState("08:00");
  const [medicationInstruction, setMedicationInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useInteractionBusy(
    pending ||
      childName.trim().length > 0 ||
      routineTitle.trim().length > 0 ||
      medicationName.trim().length > 0,
  );

  useEffect(() => {
    if (activeChildren.length === 0) {
      return;
    }
    if (!activeChildren.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(activeChildren[0].id);
    }
  }, [activeChildren, selectedChildId]);

  useEffect(() => {
    if (
      hasUsefulHouseholdSetup(progress) &&
      (step === "child" || step === "choice")
    ) {
      setStep("finish");
    }
  }, [progress, step]);

  function clearError() {
    setError(null);
  }

  function chooseConfig(nextStep: "routine" | "medication") {
    clearError();
    setStep(nextStep);
  }

  function toggleWeekday(day: number) {
    setRoutineWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  async function handleChildSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    clearError();
    try {
      const result = await createChild(client, childName);
      if (!result.ok) {
        setError(mapSetupError(result.error, "child"));
        return;
      }
      setChildName("");
      setSelectedChildId(result.data.id);
      setStep("choice");
      notifyHouseholdChanged();
    } catch {
      setError("Não foi possível salvar a Criança. Nada foi alterado; tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function handleRoutineSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    clearError();
    try {
      const result = await createWeeklyRoutine(client, {
        title: routineTitle,
        targetKind: "child",
        childId: selectedChildId,
        weekdays: routineWeekdays,
        scheduledTime: routineTime.trim() || null,
        requiresConfirmation: true,
        defaultOwnerUserId: null,
        validFrom: localDateInHousehold(),
        validUntil: null,
      });
      if (!result.ok) {
        setError(mapSetupError(result.error, "routine"));
        return;
      }
      setStep("finish");
      notifyHouseholdChanged();
    } catch {
      setError("Não foi possível salvar a Rotina semanal. Nada foi alterado; tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function handleMedicationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    clearError();
    const input: MedicationCreateInput = {
      childId: selectedChildId,
      name: medicationName,
      instruction: medicationInstruction.trim() || null,
      slots: medicationSlots.split(/[,;\s]+/).filter(Boolean),
      validFrom: localDateInHousehold(),
      validUntil: null,
    };
    try {
      const result = await createMedication(client, input);
      if (!result.ok) {
        setError(mapSetupError(result.error, "medication"));
        return;
      }
      setStep("finish");
      notifyHouseholdChanged();
    } catch {
      setError("Não foi possível salvar o Medicamento. Nada foi alterado; tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function handleOpenToday() {
    setPending(true);
    clearError();
    try {
      await onOpenToday();
    } catch {
      setError("Não foi possível abrir o Hoje. Nada foi alterado; tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="household-setup" data-household-setup data-setup-step={step}>
      <p className="household-setup__eyebrow">Primeiro acesso</p>
      <h2>Configurar casa</h2>
      <p>
        Vamos registrar o mínimo para o Registro ter uma Ocorrência útil. Você poderá completar o
        restante em Configurações.
      </p>
      <p
        className="household-setup__progress"
        data-setup-progress
        data-setup-progress-state={hasUsefulHouseholdSetup(progress) ? "ready" : "pending"}
      >
        <span className="household-setup__progress-icon" aria-hidden="true">
          {hasUsefulHouseholdSetup(progress) ? "✓" : "!"}
        </span>
        <span>
          {progress.activeChildCount > 0 ? "Criança registrada" : "Falta uma Criança"} · {hasUsefulHouseholdSetup(progress) ? "configuração pronta" : "falta uma Rotina semanal ou Medicamento"}
        </span>
      </p>

      {error ? (
        <p className="household-setup__error" data-setup-error role="alert">
          {error}
        </p>
      ) : null}

      {step === "child" ? (
        <form className="household-setup__form" data-setup-child-form onSubmit={handleChildSubmit}>
          <h3>1. Adicione uma Criança</h3>
          <label htmlFor="setup-child-name">Nome da Criança</label>
          <input
            id="setup-child-name"
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
            autoComplete="off"
            disabled={pending}
            required
            autoFocus
          />
          <button type="submit" disabled={pending || childName.trim().length === 0}>
            {pending ? "Salvando Criança…" : "Continuar"}
          </button>
        </form>
      ) : null}

      {step === "choice" ? (
        <div className="household-setup__choice" data-setup-choice>
          <h3>2. Escolha a primeira configuração</h3>
          <label htmlFor="setup-child-select">Criança</label>
          <select
            id="setup-child-select"
            value={selectedChildId}
            onChange={(event) => setSelectedChildId(event.target.value)}
            disabled={pending}
          >
            {activeChildren.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
          <div className="household-setup__choice-actions">
            <button type="button" onClick={() => chooseConfig("routine")} disabled={pending}>
              Criar Rotina semanal
            </button>
            <button type="button" onClick={() => chooseConfig("medication")} disabled={pending}>
              Cadastrar Medicamento
            </button>
          </div>
        </div>
      ) : null}

      {step === "routine" ? (
        <form className="household-setup__form" data-setup-routine-form onSubmit={handleRoutineSubmit}>
          <h3>2. Crie uma Rotina semanal</h3>
          <label htmlFor="setup-routine-title">O que precisa ser combinado?</label>
          <input
            id="setup-routine-title"
            value={routineTitle}
            onChange={(event) => setRoutineTitle(event.target.value)}
            autoComplete="off"
            disabled={pending}
            required
            maxLength={120}
            autoFocus
          />
          <fieldset className="household-setup__weekdays">
            <legend>Dias</legend>
            {WEEKDAYS.map((day) => (
              <label key={day.value}>
                <input
                  type="checkbox"
                  checked={routineWeekdays.includes(day.value)}
                  onChange={() => toggleWeekday(day.value)}
                  disabled={pending}
                />
                {day.label}
              </label>
            ))}
          </fieldset>
          <label htmlFor="setup-routine-time">Horário (opcional)</label>
          <input
            id="setup-routine-time"
            type="time"
            value={routineTime}
            onChange={(event) => setRoutineTime(event.target.value)}
            disabled={pending}
          />
          <div className="household-setup__form-actions">
            <button type="submit" disabled={pending || !selectedChildId || routineWeekdays.length === 0}>
              {pending ? "Salvando Rotina…" : "Salvar Rotina semanal"}
            </button>
            <button type="button" onClick={() => setStep("choice")} disabled={pending}>
              Voltar
            </button>
          </div>
        </form>
      ) : null}

      {step === "medication" ? (
        <form className="household-setup__form" data-setup-medication-form onSubmit={handleMedicationSubmit}>
          <h3>2. Cadastre um Medicamento</h3>
          <p>Registre somente o que já foi definido. O Combinado não oferece orientação médica.</p>
          <label htmlFor="setup-medication-name">Nome do Medicamento</label>
          <input
            id="setup-medication-name"
            value={medicationName}
            onChange={(event) => setMedicationName(event.target.value)}
            autoComplete="off"
            disabled={pending}
            required
            autoFocus
          />
          <label htmlFor="setup-medication-slots">Horários (HH:mm, separados)</label>
          <input
            id="setup-medication-slots"
            value={medicationSlots}
            onChange={(event) => setMedicationSlots(event.target.value)}
            autoComplete="off"
            disabled={pending}
            required
          />
          <label htmlFor="setup-medication-instruction">Instrução já prescrita (opcional)</label>
          <input
            id="setup-medication-instruction"
            value={medicationInstruction}
            onChange={(event) => setMedicationInstruction(event.target.value)}
            autoComplete="off"
            disabled={pending}
          />
          <div className="household-setup__form-actions">
            <button type="submit" disabled={pending || !selectedChildId || medicationName.trim().length === 0}>
              {pending ? "Salvando Medicamento…" : "Salvar Medicamento"}
            </button>
            <button type="button" onClick={() => setStep("choice")} disabled={pending}>
              Voltar
            </button>
          </div>
        </form>
      ) : null}

      {step === "finish" ? (
        <div className="household-setup__finish" data-setup-finish>
          <h3>Casa pronta para o primeiro combinado</h3>
          <p>A configuração foi registrada no Registro compartilhado.</p>
          <button type="button" onClick={() => void handleOpenToday()} disabled={pending}>
            {pending ? "Abrindo Hoje…" : "Criar combinado e abrir o Hoje"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
