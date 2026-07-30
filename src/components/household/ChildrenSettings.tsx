"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archiveChild,
  createChild,
  listChildren,
  renameChild,
  unarchiveChild,
  type ChildRow,
} from "@/lib/household/children";
import { notifyHouseholdChanged } from "@/lib/household/events";
import { partitionChildren } from "@/lib/household/partition";
import { CASA_TARGET } from "@/lib/household/targets";

function mapChildrenLoadError(code?: string, message?: string): string {
  if (message === "household_missing") {
    return "Casa ainda não configurada no servidor.";
  }
  // PostgREST / Postgres signals when membership or schema is missing.
  if (code === "PGRST202" || code === "42883" || code === "42P01") {
    return "Casa ainda não configurada no servidor.";
  }
  return "Não foi possível carregar as crianças.";
}

export function ChildrenSettings({ client }: { client: SupabaseClient }) {
  const [children, setChildren] = useState<ChildRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const refresh = useCallback(async () => {
    const result = await listChildren(client);
    if (!result.ok) {
      setError(mapChildrenLoadError(result.error.code, result.error.message));
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
          : result.error.message === "household_missing"
            ? "Casa ainda não configurada no servidor."
            : "Não foi possível cadastrar.",
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
    setPending(true);
    setError(null);
    const result = await archiveChild(client, childId);
    setPending(false);
    if (!result.ok) {
      setError("Não foi possível arquivar.");
      return;
    }
    await afterMutation(true);
  }

  async function handleUnarchive(childId: string) {
    setPending(true);
    setError(null);
    const result = await unarchiveChild(client, childId);
    setPending(false);
    if (!result.ok) {
      setError("Não foi possível reativar.");
      return;
    }
    await afterMutation(true);
  }

  if (children === null) {
    return <p data-children-status="loading">Carregando crianças…</p>;
  }

  const { active, archived } = partitionChildren(children);

  return (
    <section data-children-settings>
      <h2>Crianças</h2>
      <p data-casa-target>
        Alvo fixo da casa: <strong>{CASA_TARGET.label}</strong> (não é um cadastro editável).
      </p>

      {error && <p data-children-error>{error}</p>}

      <form data-child-create onSubmit={handleCreate}>
        <label>
          Nova criança
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <button type="submit" disabled={pending}>
          Adicionar
        </button>
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
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={pending}
                  />
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
                  <button type="button" disabled={pending} onClick={() => handleArchive(child.id)}>
                    Arquivar
                  </button>
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
                <span>{child.name}</span>
                <button type="button" disabled={pending} onClick={() => handleUnarchive(child.id)}>
                  Reativar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
