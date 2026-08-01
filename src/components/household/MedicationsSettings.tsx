"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCurrentHouseholdId, listChildren, type ChildRow } from "@/lib/household/children";
import { notifyHouseholdChanged } from "@/lib/household/events";
import {
  archiveMedication,
  createMedication,
  editMedication,
  interruptMedicationImmediate,
  listMedications,
  restoreMedication,
  type MedicationListItem,
} from "@/lib/household/medications";
import { localDateInHousehold } from "@/lib/household/routine-form";
import { partitionChildren } from "@/lib/household/partition";
import {
  extractAppErrorToken,
  householdWriteErrorCopy,
  isSchemaMissingError,
  membershipMissingCopy,
  medicationSchemaMissingCopy,
  schemaMissingCopy,
} from "@/lib/household/setup-home";
import { useInteractionBusy } from "@/lib/pwa/use-interaction-busy";

function mapMedicationError(message?: string, code?: string): string {
  if (isSchemaMissingError(code, message)) return medicationSchemaMissingCopy();
  const token = extractAppErrorToken(message) ?? message;
  switch (token) {
    case "name_required":
      return "Informe o nome do medicamento.";
    case "child_required":
      return "Escolha a criança.";
    case "child_not_in_household":
      return "A criança selecionada não está ativa nesta Casa amanhã.";
    case "slots_required":
      return "Informe ao menos um horário.";
    case "duplicate_slots":
      return "Horários iguais não podem se repetir.";
    case "invalid_slot":
      return "Horário inválido (use HH:mm).";
    case "valid_from_required":
      return "Informe a data inicial.";
    case "invalid_valid_until":
      return "Data final inválida.";
    case "invalid_valid_range":
      return "Data final deve ser após a inicial.";
    case "medication_version_conflict":
      return "Outra alteração chegou. Recarregue os medicamentos antes de salvar.";
    case "medication_not_active_tomorrow":
      return "O tratamento precisa continuar válido amanhã para essa ação.";
    case "invalid_medication_restore_response":
      return "Não foi possível reativar o medicamento.";
    default: {
      const mapped = householdWriteErrorCopy(message, code);
      return mapped === "Não foi possível salvar."
        ? "Não foi possível salvar o medicamento."
        : mapped;
    }
  }
}

type MedicationField = "name" | "child" | "slots" | "validFrom" | "validUntil";

function medicationErrorField(message?: string): MedicationField | null {
  switch (extractAppErrorToken(message) ?? message) {
    case "name_required":
    case "Informe o nome do medicamento.":
      return "name";
    case "child_required":
    case "child_not_in_household":
    case "Escolha a criança.":
    case "A criança selecionada não está ativa nesta Casa amanhã.":
      return "child";
    case "slots_required":
    case "duplicate_slots":
    case "invalid_slot":
    case "Informe ao menos um horário.":
    case "Horários iguais não podem se repetir.":
    case "Horário inválido (use HH:mm).":
      return "slots";
    case "valid_from_required":
    case "Informe a data inicial.":
      return "validFrom";
    case "invalid_valid_until":
    case "invalid_valid_range":
    case "Data final inválida.":
    case "Data final deve ser após a inicial.":
      return "validUntil";
    default:
      return null;
  }
}

export function MedicationsSettings({ client }: { client: SupabaseClient }) {
  const [medications, setMedications] = useState<MedicationListItem[] | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [householdReady, setHouseholdReady] = useState(false);
  const [interruptConfirmId, setInterruptConfirmId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [childId, setChildId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [slots, setSlots] = useState(["08:00"]);
  const [validFrom, setValidFrom] = useState(() => localDateInHousehold());
  const [validUntil, setValidUntil] = useState("");
  useInteractionBusy(
    pending ||
      editingId !== null ||
      interruptConfirmId !== null ||
      archiveConfirmId !== null ||
      restoreConfirmId !== null ||
      name.trim().length > 0,
  );

  const activeChildren = useMemo(() => partitionChildren(children).active, [children]);
  const activeMedications = useMemo(
    () => (medications ?? []).filter((medication) => !medication.archived && !medication.interruptedAt),
    [medications],
  );
  const archivedMedications = useMemo(
    () => (medications ?? []).filter((medication) => medication.archived || medication.interruptedAt),
    [medications],
  );
  const childNames = useMemo(
    () => new Map(children.map((child) => [child.id, child.name])),
    [children],
  );

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
      setError(
        isSchemaMissingError(medsResult.error.code, medsResult.error.message)
          ? medicationSchemaMissingCopy()
          : "Não foi possível carregar os medicamentos.",
      );
      setMedications([]);
    } else {
      setMedications(medsResult.data);
      if (editingId === null) setError(null);
    }
    if (childrenResult.ok) {
      setChildren(childrenResult.data);
      const active = partitionChildren(childrenResult.data).active;
      if (!childId && active[0]) setChildId(active[0].id);
    }
  }, [childId, client, editingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setEditingVersionId(null);
    setName("");
    setInstruction("");
    setSlots(["08:00"]);
    setValidUntil("");
    setValidFrom(localDateInHousehold());
  }

  function beginEdit(medication: MedicationListItem) {
    setEditingId(medication.id);
    setEditingVersionId(medication.versionId);
    setName(medication.name);
    setChildId(medication.childId);
    setInstruction(medication.instruction ?? "");
    setSlots(medication.slots.length > 0 ? medication.slots : ["08:00"]);
    setValidFrom(medication.validFrom);
    setValidUntil(medication.validUntil ?? "");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const input = {
      childId,
      name,
      instruction: instruction.trim() || null,
      slots: slots.filter((slot) => slot.trim()),
      validFrom,
      validUntil: validUntil.trim() || null,
    };
    const result = editingId && editingVersionId
      ? await editMedication(client, { ...input, medicationId: editingId, expectedVersionId: editingVersionId })
      : await createMedication(client, input);
    setPending(false);
    if (!result.ok) {
      setError(mapMedicationError(result.error.message, result.error.code));
      return;
    }
    resetForm();
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

  async function handleArchive(medication: MedicationListItem) {
    if (archiveConfirmId !== medication.id) {
      setArchiveConfirmId(medication.id);
      return;
    }
    setPending(true);
    setError(null);
    const result = await archiveMedication(client, medication.id, medication.versionId);
    setPending(false);
    setArchiveConfirmId(null);
    if (!result.ok) {
      setError(mapMedicationError(result.error.message, result.error.code));
      return;
    }
    notifyHouseholdChanged();
    await refresh();
  }

  async function handleRestore(medication: MedicationListItem) {
    if (restoreConfirmId !== medication.id) {
      setRestoreConfirmId(medication.id);
      return;
    }
    setPending(true);
    setError(null);
    const result = await restoreMedication(client, medication.id, medication.versionId);
    setRestoreConfirmId(null);
    setPending(false);
    if (!result.ok) {
      setError(mapMedicationError(result.error.message, result.error.code));
      return;
    }
    notifyHouseholdChanged();
    await refresh();
  }

  function renderMedication(medication: MedicationListItem, archived = false) {
    return (
      <li key={medication.id} data-medication-id={medication.id} data-medication-archived={archived || undefined}>
        <span>
          {medication.name}
          {" · "}
          {childNames.get(medication.childId) ?? "criança"}
          {" · "}
          {medication.slots.join(", ")}
          {medication.interruptedAt ? " · interrompido" : null}
        </span>
        {!archived ? (
          <span className="medication-actions">
            <button type="button" disabled={pending} onClick={() => beginEdit(medication)}>
              Editar amanhã
            </button>
            {archiveConfirmId === medication.id ? (
              <>
                <button type="button" disabled={pending} onClick={() => void handleArchive(medication)}>
                  Confirmar arquivamento
                </button>
                <button type="button" disabled={pending} onClick={() => setArchiveConfirmId(null)}>
                  Voltar
                </button>
              </>
            ) : (
              <button type="button" disabled={pending} onClick={() => void handleArchive(medication)}>
                Arquivar amanhã
              </button>
            )}
            {!medication.interruptedAt ? (
              interruptConfirmId === medication.id ? (
                <span data-interrupt-confirm>
                  <p>Encerrar tratamento agora e cancelar doses restantes de hoje?</p>
                  <button type="button" disabled={pending} onClick={() => void handleInterrupt(medication.id)}>
                    Confirmar interrupção
                  </button>
                  <button type="button" disabled={pending} onClick={() => setInterruptConfirmId(null)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button type="button" data-interrupt-medication disabled={pending} onClick={() => setInterruptConfirmId(medication.id)}>
                  Interromper agora
                </button>
              )
            ) : null}
          </span>
        ) : medication.archived ? (
          restoreConfirmId === medication.id ? (
            <span data-medication-restore-confirm>
              <p>Reativar este Medicamento a partir de amanhã?</p>
              <button type="button" disabled={pending} onClick={() => void handleRestore(medication)}>
                Confirmar reativação
              </button>
              <button type="button" disabled={pending} onClick={() => setRestoreConfirmId(null)}>
                Cancelar
              </button>
            </span>
          ) : (
            <button type="button" disabled={pending} onClick={() => void handleRestore(medication)}>
              Reativar amanhã
            </button>
          )
        ) : null}
      </li>
    );
  }

  if (medications === null) return <p data-medications-status="loading">Carregando medicamentos…</p>;

  const fieldError = medicationErrorField(error ?? undefined);

  return (
    <section data-medications-settings>
      <h2>Medicamentos</h2>
      <p data-medications-create-hint>Cadastro de doses programadas. Sem orientação clínica.</p>
      {error && <p data-medications-error>{error}</p>}

      <form data-medication-create={editingId ? undefined : true} data-medication-edit={editingId ?? undefined} onSubmit={handleSubmit}>
        <label aria-invalid={fieldError === "name" || undefined}>
          Nome
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            disabled={pending}
            required
            aria-describedby={fieldError === "name" ? "medication-name-error" : undefined}
          />
          {fieldError === "name" ? <span id="medication-name-error" data-field-error>{error}</span> : null}
        </label>
        <label aria-invalid={fieldError === "child" || undefined}>
          Criança
          <select
            value={childId}
            onChange={(event) => setChildId(event.target.value)}
            disabled={pending || activeChildren.length === 0}
            required
            aria-describedby={fieldError === "child" ? "medication-child-error" : undefined}
          >
            {activeChildren.length === 0 ? <option value="">Cadastre uma criança primeiro</option> : activeChildren.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </select>
          {fieldError === "child" ? <span id="medication-child-error" data-field-error>{error}</span> : null}
        </label>
        <label>
          Instrução (opcional)
          <input value={instruction} onChange={(event) => setInstruction(event.target.value)} autoComplete="off" disabled={pending} placeholder="Conforme a prescrição" />
        </label>
        <fieldset data-medication-slots aria-invalid={fieldError === "slots" || undefined}>
          <legend>Horários (HH:mm)</legend>
          {slots.map((slot, index) => (
            <label key={index}>
              Horário {index + 1}
              <span className="medication-slot-row">
                <input
                  type="time"
                  value={slot}
                  onChange={(event) => {
                    const next = [...slots];
                    next[index] = event.target.value;
                    setSlots(next);
                  }}
                  disabled={pending}
                  required
                  aria-describedby={fieldError === "slots" ? "medication-slots-error" : undefined}
                />
                {slots.length > 1 ? (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Remover horário ${index + 1}`}
                    onClick={() => setSlots(slots.filter((_, valueIndex) => valueIndex !== index))}
                  >
                    Remover
                  </button>
                ) : null}
              </span>
            </label>
          ))}
          <button type="button" disabled={pending} onClick={() => setSlots([...slots, "08:00"])}>
            Adicionar horário
          </button>
          {fieldError === "slots" ? <span id="medication-slots-error" data-field-error>{error}</span> : null}
        </fieldset>
        <label aria-invalid={fieldError === "validFrom" || undefined}>
          Data inicial
          <input
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            disabled={pending}
            required
            aria-describedby={fieldError === "validFrom" ? "medication-valid-from-error" : undefined}
          />
          {fieldError === "validFrom" ? <span id="medication-valid-from-error" data-field-error>{error}</span> : null}
        </label>
        <label aria-invalid={fieldError === "validUntil" || undefined}>
          Data final (opcional)
          <input
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            disabled={pending}
            aria-describedby={fieldError === "validUntil" ? "medication-valid-until-error" : undefined}
          />
          {fieldError === "validUntil" ? <span id="medication-valid-until-error" data-field-error>{error}</span> : null}
        </label>
        <div className="medication-form-actions">
          <button type="submit" disabled={pending || !householdReady || activeChildren.length === 0}>
            {editingId ? "Salvar alteração para amanhã" : "Salvar medicamento"}
          </button>
          <button type="button" disabled={pending} onClick={resetForm}>
            Cancelar
          </button>
        </div>
      </form>

      <h3>Ativos</h3>
      {activeMedications.length === 0 ? <p data-medications-empty>Nenhum medicamento ativo.</p> : <ul data-medications-list>{activeMedications.map((medication) => renderMedication(medication))}</ul>}
      <h3>Arquivados</h3>
      {archivedMedications.length === 0 ? <p data-medications-archived-empty>Nenhum medicamento arquivado.</p> : <ul data-medications-archived>{archivedMedications.map((medication) => renderMedication(medication, true))}</ul>}
    </section>
  );
}
