"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archiveChild,
  createChild,
  fetchCurrentHouseholdId,
  listChildren,
  renameChild,
  unarchiveChild,
  type ChildRow,
} from "@/lib/household/children";
import { notifyHouseholdChanged } from "@/lib/household/events";
import { partitionChildren } from "@/lib/household/partition";
import {
  extractAppErrorToken,
  householdWriteErrorCopy,
  isSchemaMissingError,
  membershipMissingCopy,
  schemaMissingCopy,
} from "@/lib/household/setup-home";
import { localDateInHousehold } from "@/lib/household/routine-form";
import { CASA_TARGET } from "@/lib/household/targets";
import { useInteractionBusy } from "@/lib/pwa/use-interaction-busy";

export function ChildrenSettings({ client }: { client: SupabaseClient }) {
  const [children, setChildren] = useState<ChildRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [householdReady, setHouseholdReady] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState<string | null>(null);
  useInteractionBusy(
    pending ||
      editingId !== null ||
      archiveConfirmId !== null ||
      restoreConfirmId !== null ||
      newName.trim().length > 0,
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
      setChildren([]);
      return;
    }
    if (!household.data) {
      setHouseholdReady(false);
      setError(membershipMissingCopy());
      setChildren([]);
      return;
    }
    setHouseholdReady(true);

    const result = await listChildren(client);
    if (!result.ok) {
      setError(
        isSchemaMissingError(result.error.code, result.error.message)
          ? schemaMissingCopy()
          : "Não foi possível carregar as crianças.",
      );
      setChildren([]);
      return;
    }
    setError(null);
    setChildren(result.data);
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function afterMutation(ok: boolean) {
    if (ok) {
      notifyHouseholdChanged();
      await refresh();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await createChild(client, newName);
    setPending(false);
    if (!result.ok) {
      setError(
        result.error.message === "name_required"
          ? "Informe um nome."
          : householdWriteErrorCopy(result.error.message, result.error.code),
      );
      return;
    }
    setNewName("");
    await afterMutation(true);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setPending(true);
    setError(null);
    const result = await renameChild(client, editingId, editName);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message === "name_required" ? "Informe um nome." : "Não foi possível renomear.");
      return;
    }
    setEditingId(null);
    await afterMutation(true);
  }

  async function handleArchive(childId: string) {
    if (archiveConfirmId !== childId) {
      setArchiveConfirmId(childId);
      return;
    }
    setPending(true);
    setError(null);
    const result = await archiveChild(client, childId);
    setArchiveConfirmId(null);
    setPending(false);
    if (!result.ok) {
      setError(
        extractAppErrorToken(result.error.message) === "child_has_active_dependencies"
          ? "Resolva ou arquive as rotinas e os medicamentos ativos desta criança antes de arquivar."
          : "Não foi possível arquivar.",
      );
      return;
    }
    await afterMutation(true);
  }

  async function handleUnarchive(childId: string) {
    if (restoreConfirmId !== childId) {
      setRestoreConfirmId(childId);
      return;
    }
    setPending(true);
    setError(null);
    const result = await unarchiveChild(client, childId);
    setRestoreConfirmId(null);
    setPending(false);
    if (!result.ok) {
      setError("Não foi possível reativar a criança.");
      return;
    }
    await afterMutation(true);
  }

  if (children === null) {
    return <p data-children-status="loading">Carregando crianças…</p>;
  }

  const { active, archived } = partitionChildren(children, localDateInHousehold());
  const nameError = error === "Informe um nome.";

  return (
    <section data-children-settings>
      <h2>Crianças</h2>
      <p data-casa-target>
        Alvo fixo da casa: <strong>{CASA_TARGET.label}</strong> (não é um cadastro editável).
      </p>

      {error && <p data-children-error>{error}</p>}

      <form data-child-create onSubmit={handleCreate}>
        <label>
          Nome da Criança
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
            disabled={pending || !householdReady}
            required
            aria-describedby={nameError ? "child-name-error" : undefined}
          />
          {nameError ? <span id="child-name-error" data-field-error>{error}</span> : null}
        </label>
        <span className="child-form-actions">
          <button type="submit" disabled={pending || !householdReady}>Salvar</button>
          <button type="button" disabled={pending} onClick={() => setNewName("")}>Cancelar</button>
        </span>
      </form>

      <h3>Ativas</h3>
      {active.length === 0 ? (
        <p data-children-active-empty>Nenhuma criança ativa.</p>
      ) : (
        <ul data-children-active>
          {active.map((child) => (
            <li key={child.id} data-child-id={child.id}>
              {editingId === child.id ? (
                <form data-child-rename onSubmit={handleRename}>
                  <label>
                    Nome da Criança
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={pending}
                      required
                    />
                  </label>
                  <button type="submit" disabled={pending}>
                    Salvar
                  </button>
                  <button type="button" disabled={pending} onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <span>{child.name}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setEditingId(child.id);
                      setEditName(child.name);
                    }}
                  >
                    Renomear
                  </button>
                  {archiveConfirmId === child.id ? (
                    <span data-child-archive-confirm>
                      <p>Arquivar esta Criança depois de resolver as dependências?</p>
                      <button type="button" disabled={pending} onClick={() => void handleArchive(child.id)}>
                        Confirmar arquivamento
                      </button>
                      <button type="button" disabled={pending} onClick={() => setArchiveConfirmId(null)}>
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => void handleArchive(child.id)}>
                      Arquivar
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <>
          <h3>Arquivadas</h3>
          <ul data-children-archived>
            {archived.map((child) => (
              <li key={child.id} data-child-id={child.id} data-archived>
                <span>
                  {child.name}
                  {child.active_from > localDateInHousehold()
                    ? ` · reativação em ${child.active_from}`
                    : ""}
                </span>
                {restoreConfirmId === child.id ? (
                  <span data-child-restore-confirm>
                    <p>Reativar esta Criança a partir de amanhã?</p>
                    <button type="button" disabled={pending} onClick={() => void handleUnarchive(child.id)}>
                      Confirmar reativação
                    </button>
                    <button type="button" disabled={pending} onClick={() => setRestoreConfirmId(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button type="button" disabled={pending} onClick={() => void handleUnarchive(child.id)}>
                    Reativar amanhã
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
