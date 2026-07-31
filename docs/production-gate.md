# Gate de entrada em produção (dois iPhones)

Evidência para issue #15 / PRD §§2, 20, 21, 25. **Não adiciona escopo de
produto** — só prova que a Casa pode coordenar as duas dores com segurança
antes da semana de estabilização e da janela de 30 dias.

Catálogo canônico (ids ↔ suites): `src/lib/ops/production-gate.ts`.
Corrida automatizada:

```bash
COMBINADO_REQUIRE_RLS=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
  pnpm run test:production-gate
# suite completa (build + e2e):
COMBINADO_GATE_FULL=1 COMBINADO_REQUIRE_RLS=1 DATABASE_URL=… pnpm run test:production-gate
```

## Decisão

| Campo | Valor |
| --- | --- |
| Data | ____ |
| Build / hostname | ____ (ex.: `combinado.pages.dev`) |
| iPhone A / Adulto | ____ |
| iPhone B / Adulto | ____ |
| Facilitador | ____ |
| Decisão | ☐ **Go** — iniciar estabilização · ☐ **Hold** — blockers abaixo |

Exceções de release (devem substituir escopo equivalente e estar no PRD
**antes** do Go): _nenhuma_ / _listar:_

---

## 1. Bloqueadores de produção (PRD §21)

Marcar só quando verificado. Qualquer item aberto = **Hold**.

| Bloqueador | Status |
| --- | --- |
| Vazamento conhecido de RLS | ☐ ausente |
| Caminho de dose dupla | ☐ ausente (suite + toques simultâneos) |
| Confirmação visual sem persistência | ☐ ausente |
| Perda silenciosa de ação | ☐ ausente |
| Ausência de cache offline | ☐ ausente |
| Restauração não testada | ☐ ensaiada (rehearsal Actions e/ou restore controlado) |
| Onboarding impossível em um dos iPhones | ☐ ambos Adultos onboarded |

Falha **isolada** de push: ☐ documentada · Registro compartilhado ☐ ok → **não**
bloqueia (ver §5 e [push-spike-result.md](./push-spike-result.md)).

---

## 2. Suites automatizadas

| Requisito (PRD §21) | Evidência | Resultado |
| --- | --- | --- |
| Regras de ocorrência | `tests/sql/agenda_snapshot.sql`, `tests/unit/agenda.test.mjs` | ☑ |
| Vigência / versionamento | `tests/sql/weekly_routine_*.sql` | ☑ |
| Constraints | `rls_household`, `household_maintenance`, `weekly_routine_create`, `routines.test.mjs` | ☑ |
| RLS | `tests/sql/rls_household.sql` | ☑ |
| Dose concorrente | `tests/sql/medication_doses.sql` | ☑ |
| Compromisso concorrente | `tests/sql/events.sql` | ☑ |
| Relógio 19h | `agenda_snapshot.sql`, `sync-offline.test.mjs` | ☑ |
| Relógio 22h | `agenda_snapshot.sql` (Hoje estável; Amanhã revelado) | ☑ |
| Relógio meia-noite | agenda + doses + events + sync-offline | ☑ |
| Início/fim de tratamento | `medication_doses.sql` (interrupt) | ☑ |
| Datas efetivas | `weekly_routine_planning`, `household_maintenance` | ☑ |
| Offline / reconexão | `sync-offline.test.mjs`, `service-worker.test.mjs` | ☑ |
| Backup / restore path | `backup_status` + [runbook-backup.md](./runbook-backup.md) | ☑ |

Registro da corrida:

- Comando: `COMBINADO_REQUIRE_RLS=1 DATABASE_URL=postgres://… pnpm run test:production-gate`
- Data/hora: 2026-07-31 (cloud agent) — typecheck + unit (128) + RLS/SQL suites **PASSED**; decisão `hold` enquanto linhas manuais abertas
- `COMBINADO_GATE_FULL=1`: build OK; e2e autoritativo no CI (`config-missing` pula quando `CI` + secrets; login autenticado precisa Casa bootstrap + `TEST_LOGIN_*`)
- Exit code (gate padrão): 0

---

## 3. Toques simultâneos (manual, dois iPhones)

Com a mesma ocorrência visível nos dois aparelhos, online:

| Cenário | Esperado | A | B |
| --- | --- | --- | --- |
| Dose: ambos tocam Confirmar quase juntos | Uma confirmação ativa; perdedor vê executor/horário | ☐ | ☐ |
| Compromisso: ambos tocam Concluir quase juntos | Uma conclusão ativa; perdedor vê quem concluiu | ☐ | ☐ |

---

## 4. Relógio / fronteiras (manual complementar)

Suites cobrem 19h / 22h / meia-noite com relógio controlado. Nos aparelhos,
opcionalmente anotar observação em produção real:

| Fronteira | Observação |
| --- | --- |
| Após 19h | Amanhã inline: ☐ |
| Por volta de 22h | Hoje inalterado; Amanhã ainda visível: ☐ |
| Após meia-noite | Virada; cache obsoleto rotulado se offline: ☐ |
| Início/fim tratamento | Doses respeitam fronteira / interrupt: ☐ |
| Edição efetiva amanhã | Hoje preserva versão anterior: ☐ |

---

## 5. Matriz de push (Wi‑Fi / móvel / Focus)

Preencher [push-spike-result.md](./push-spike-result.md). Resumo aqui:

| | Wi‑Fi Focus off | Móvel Focus off | Focus + Combinado | Focus sem allowlist (silêncio esperado) |
| --- | --- | --- | --- | --- |
| iPhone A | ☐ | ☐ | ☐ | ☐ |
| iPhone B | ☐ | ☐ | ☐ | ☐ |

- Falha só de push documentada: ☐
- Registro compartilhado permanece fonte de verdade: ☐
- Go/No-go de notificações (spike): ☐

Workers de dose/resumo 22h além do spike `send-test-push` / outbox skeleton:
tratar atraso ou ausência como **best effort** — não bloqueia se §1 e Registro
ok ([runbook-ops.md](./runbook-ops.md), [tabletop-ops.md](./tabletop-ops.md)).

---

## 6. Offline, cache e atualização (dois aparelhos)

| Cenário | Esperado | A | B |
| --- | --- | --- | --- |
| Cache após sync | Abre casca offline; banner com data + última sync | ☐ | ☐ |
| Data obsoleta pós-meia-noite | Rótulo da data do cache (não “hoje” falso) | ☐ | ☐ |
| Escrita offline | Confirmar/concluir/config bloqueados até refetch online | ☐ | ☐ |
| Reconexão | Refetch; escritas liberadas só após snapshot ok | ☐ | ☐ |
| Update PWA | Sem reload no meio de confirmação; “Atualizar” só ocioso | ☐ | ☐ |

Ver também [checklist-a11y-perf.md](./checklist-a11y-perf.md).

---

## 7. Backup e operação

| Item | Evidência | Status |
| --- | --- | --- |
| Frescor de backup | Configurações + `get_backup_status` / monitor | ☐ saudável (&lt; 26 h) |
| Rehearsal semanal Actions | workflow `backup-restore-rehearsal` | ☐ |
| Restore controlado (se feito) | [runbook-backup.md](./runbook-backup.md) | ☐ / N/A |
| Monitoramento administrativo | `get_ops_monitor_snapshot` / `print-monitor.mjs` | ☐ |
| Runbook administrativo | [runbook-ops.md](./runbook-ops.md) + pointers auth/household/push/backup | ☐ |
| Tabletop T1–T5 | [tabletop-ops.md](./tabletop-ops.md) | ☐ |

---

## 8. Casa autorizada e onboarding

| Item | Status |
| --- | --- |
| Única Casa; só os dois Adultos autorizados | ☐ |
| Adulto A onboarded no iPhone alvo (PWA na Tela de Início) | ☐ |
| Adulto B onboarded no iPhone alvo | ☐ |
| Criança + rotina mínimas usáveis em Hoje | ☐ |

---

## 9. Estabilização e sucesso (PRD §2)

Só após **Go** acima:

1. ☐ Semana de estabilização inicia em ____ (data)
2. ☐ Ao fim da semana sem incidente central, janela de 30 dias inicia em ____
3. Critério de sucesso da janela: sem dose duplicada/esquecida por falha de
   coordenação; sem compromisso perdido por ambiguidade de responsável; ambos
   usam o app diretamente.

Incidente central → registrar, classificar (regra / UX / adoção / infra),
corrigir, reiniciar a janela só se o critério de sucesso for comprometido.

---

## 10. Governança (PRD §25)

Durante o v1 / validação: novas ideias fora do backlog ativo, salvo bloqueio
direto de uma das duas dores + troca de escopo equivalente + PRD atualizado
antes da implementação.
