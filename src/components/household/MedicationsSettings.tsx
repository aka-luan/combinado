"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCurrentHouseholdId,
  listChildren,
  type ChildRow,
} from "@/lib/household/children";
import { notifyHouseholdChanged } from "@/lib/household/events";
import {
  createMedication,
  interruptMedicationImmediate,
  listMedications,
  type MedicationListItem,
} from "@/lib/household/medications";
import { localDateInHousehold } from "@/lib/household/routine-form";
import { partitionChildren } from "@/lib/household/partition";
import {
  householdWriteErrorCopy,
  isSchemaMissingError,
  membershipMissingCopy,
  schemaMissingCopy,
} from "@/lib/household/setup-home";

function mapMedicationError(message?: string, code?: string): string {
  switch (message) {
    case "name_required":
      return "Informe o nome do medicamento.";
    case "child_required":
      return "Escolha a criança.";
    case "slots_required":
      return "Informe ao menos um horário.";
    case "duplicate_slots":
      return "Horários iguais não podem se repetir.";
    case "invalid_slot":
      return "Horário inválido (use HH:mm).";
    case "valid_from_required":
      return "Informe a data inicial.";
    case "invalid_valid_range":
      return "Data final deve ser após a inicial.";
    case "household_missing":
      return householdWriteErrorCopy(message, code);
    default: {
      const mapped = householdWriteErrorCopy(message, code);
      return mapped === "Não foi possível salvar."
        ? "Não foi possível salvar o medicamento."
        : mapped;
    }
  }
}

export function MedicationsSettings({ client }: { client: SupabaseClient }) {
  const [medications, setMedications] = useState<MedicationListItem[] | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [householdReady, setHouseholdReady] = useState(false);
  const [interruptConfirmId, setInterruptConfirmId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [childId, setChildId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [slotsText, setSlotsText] = useState("08:00");
  const [validFrom, setValidFrom] = useState(() => localDateInHousehold());
  const [validUntil, setValidUntil] = useState("");

  const activeChildren = useMemo(() => partitionChildren(children).active, [children]);

  const refresh = useCallback(async () => {
    const household = await fetchCurrentHouseholdId(client);
    if (!household.ok) {
      setHouseholdReady(false);
      setError(
        isSchemaMissingError(household.error.code, household.error.message)
          ? schemaMissingCopy()
          : membershipMissingCopy(),
      );
      setMedications([]);
      return;
    }
    if (!household.data) {
      setHouseholdReady(false);
      setError(membershipMissingCopy());
      setMedications([]);
      return;
    }
    setHouseholdReady(true);

    const [medsResult, childrenResult] = await Promise.all([
      listMedications(client),
      listChildren(client),
    ]);
    if (!medsResult.ok) {
      setError("Não foi possível carregar os medicamentos.");
      setMedications([]);
    } else {
      setMedications(medsResult.data);
      setError(null);
    }
    if (childrenResult.ok) {
      setChildren(childrenResult.data);
      const active = partitionChildren(childrenResult.data).active;
      if (!childId && active[0]) setChildId(active[0].id);
    }
  }, [client, childId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const slots = slotsText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await createMedication(client, {
      childId,
      name,
      instruction: instruction.trim() || null,
      slots,
      validFrom,
      validUntil: validUntil.trim() || null,
    });

    setPending(false);
    if (!result.ok) {
      setError(mapMedicationError(result.error.message, result.error.code));
      return;
    }

    setName("");
    setInstruction("");
    setSlotsText("08:00");
    setValidUntil("");
    setValidFrom(localDateInHousehold());
    notifyHouseholdChanged();
    await refresh();
  }

  async function handleInterrupt(medicationId: string) {
    setPending(true);
    setError(null);
    const result = await interruptMedicationImmediate(client, medicationId);
    setPending(false);
    setInterruptConfirmId(null);
    if (!result.ok) {
      setError("Não foi possível interromper o tratamento.");
      return;
    }
    notifyHouseholdChanged();
    await refresh();
  }

  if (medications === null) {
    return <p data-medications-status="loading">Carregando medicamentos…</p>;
  }

  return (
    <section data-medications-settings>
      <h2>Medicamentos</h2>
      <p data-medications-create-hint>
        Cadastro de doses programadas. Sem orientação clínica.
      </p>

      {error && <p data-medications-error>{error}</p>}

      <form data-medication-create onSubmit={handleCreate}>
        <label>
          Nome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            disabled={pending}
            required
          />
        </label>

        <label>
          Criança
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            disabled={pending || activeChildren.length === 0}
            required
          >
            {activeChildren.length === 0 ? (
              <option value="">Cadastre uma criança primeiro</option>
            ) : (
              activeChildren.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Instrução (opcional)
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            autoComplete="off"
            disabled={pending}
            placeholder="Conforme a prescrição"
          />
        </label>

        <label>
          Horários (HH:mm, separados)
          <input
            value={slotsText}
            onChange={(e) => setSlotsText(e.target.value)}
            autoComplete="off"
            disabled={pending}
            placeholder="08:00, 20:00"
            required
          />
        </label>

        <label>
          Data inicial
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            disabled={pending}
            required
          />
        </label>

        <label>
          Data final (opcional)
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            disabled={pending}
          />
        </label>

        <button type="submit" disabled={pending || !householdReady || activeChildren.length === 0}>
          Adicionar medicamento
        </button>
      </form>

      <h3>Cadastrados</h3>
      {medications.length === 0 ? (
        <p data-medications-empty>Nenhum medicamento ainda.</p>
      ) : (
        <ul data-medications-list>
          {medications.map((med) => (
            <li key={med.id} data-medication-id={med.id}>
              <span>
                {med.name}
                {" · "}
                {activeChildren.find((c) => c.id === med.childId)?.name ?? "criança"}
                {" · "}
                {med.slots.join(", ")}
                {med.interruptedAt ? " · interrompido" : null}
              </span>
              {!med.interruptedAt ? (
                interruptConfirmId === med.id ? (
                  <div data-interrupt-confirm>
                    <p>Encerrar tratamento agora e cancelar doses restantes de hoje?</p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void handleInterrupt(med.id)}
                    >
                      Confirmar interrupção
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setInterruptConfirmId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-interrupt-medication
                    disabled={pending}
                    onClick={() => setInterruptConfirmId(med.id)}
                  >
                    Interromper agora
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
