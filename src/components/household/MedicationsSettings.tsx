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

export function MedicationsSettings({ client }: { client: SupabaseClient }) {
  const [medications, setMedications] = useState<MedicationListItem[] | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [householdReady, setHouseholdReady] = useState(false);
  const [interruptConfirmId, setInterruptConfirmId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [childId, setChildId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [slotsText, setSlotsText] = useState("08:00");
  const [validFrom, setValidFrom] = useState(() => localDateInHousehold());
  const [validUntil, setValidUntil] = useState("");

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
    setSlotsText("08:00");
    setValidUntil("");
    setValidFrom(localDateInHousehold());
  }

  function beginEdit(medication: MedicationListItem) {
    setEditingId(medication.id);
    setEditingVersionId(medication.versionId);
    setName(medication.name);
    setChildId(medication.childId);
    setInstruction(medication.instruction ?? "");
    setSlotsText(medication.slots.join(", "));
    setValidFrom(medication.validFrom);
    setValidUntil(medication.validUntil ?? "");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const slots = slotsText
      .split(/[,;\s]+/)
      .map((slot) => slot.trim())
      .filter(Boolean);
    const input = {
      childId,
      name,
      instruction: instruction.trim() || null,
      slots,
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
    setPending(true);
    setError(null);
    const result = await restoreMedication(client, medication.id, medication.versionId);
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
          <button type="button" disabled={pending} onClick={() => void handleRestore(medication)}>
            Reativar amanhã
          </button>
        ) : null}
      </li>
    );
  }

  if (medications === null) return <p data-medications-status="loading">Carregando medicamentos…</p>;

  return (
    <section data-medications-settings>
      <h2>Medicamentos</h2>
      <p data-medications-create-hint>Cadastro de doses programadas. Sem orientação clínica.</p>
      {error && <p data-medications-error>{error}</p>}

      <form data-medication-create={editingId ? undefined : true} data-medication-edit={editingId ?? undefined} onSubmit={handleSubmit}>
        <label>
          Nome
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" disabled={pending} required />
        </label>
        <label>
          Criança
          <select value={childId} onChange={(event) => setChildId(event.target.value)} disabled={pending || activeChildren.length === 0} required>
            {activeChildren.length === 0 ? <option value="">Cadastre uma criança primeiro</option> : activeChildren.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </select>
        </label>
        <label>
          Instrução (opcional)
          <input value={instruction} onChange={(event) => setInstruction(event.target.value)} autoComplete="off" disabled={pending} placeholder="Conforme a prescrição" />
        </label>
        <label>
          Horários (HH:mm, separados)
          <input value={slotsText} onChange={(event) => setSlotsText(event.target.value)} autoComplete="off" disabled={pending} placeholder="08:00, 20:00" required />
        </label>
        <label>
          Data inicial
          <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} disabled={pending} required />
        </label>
        <label>
          Data final (opcional)
          <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} disabled={pending} />
        </label>
        <div className="medication-form-actions">
          <button type="submit" disabled={pending || !householdReady || activeChildren.length === 0}>
            {editingId ? "Salvar alteração para amanhã" : "Adicionar medicamento"}
          </button>
          {editingId ? <button type="button" disabled={pending} onClick={resetForm}>Cancelar edição</button> : null}
        </div>
      </form>

      <h3>Ativos</h3>
      {activeMedications.length === 0 ? <p data-medications-empty>Nenhum medicamento ativo.</p> : <ul data-medications-list>{activeMedications.map((medication) => renderMedication(medication))}</ul>}
      <h3>Arquivados</h3>
      {archivedMedications.length === 0 ? <p data-medications-archived-empty>Nenhum medicamento arquivado.</p> : <ul data-medications-archived>{archivedMedications.map((medication) => renderMedication(medication, true))}</ul>}
    </section>
  );
}
