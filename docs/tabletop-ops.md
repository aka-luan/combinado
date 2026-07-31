# Tabletop: operação free stack

Exercício tabletop (issue #14 / PRD §22) seguindo [runbook-ops.md](./runbook-ops.md).
Todos os cenários são **best effort** (sem SLA).

| Cenário | Facilitador | Data | Passou? | Notas |
| --- | --- | --- | --- | --- |
| T1 Acesso (senha temporária) | cloud-agent (#14) | 2026-07-31 | sim (papel) | Passos em runbook-auth; UI sem Gmail/SMTP |
| T2 Backend pausado / reativação | cloud-agent (#14) | 2026-07-31 | sim (papel) | runbook-ops → reativar → monitor + snapshot |
| T3 SMTP / App Password | cloud-agent (#14) | 2026-07-31 | sim (papel) | App Password no painel Auth ou senha temporária |
| T4 Push falhou (Registro ok) | cloud-agent (#14) | 2026-07-31 | sim (papel) | Monitor outbox/cron; produto segue sem push |
| T5 Restauração de backup | cloud-agent (#14) | 2026-07-31 | sim (papel) | runbook-backup / rehearsal; chave privada offline |

## Walkthrough (papel)

### T1 — Recuperação de acesso
1. Sintoma: OTP não chega.
2. Passo: [runbook-auth.md](./runbook-auth.md) → senha temporária → “Usar senha temporária” no PWA.
3. Esperado: Adulto entra; SMTP tratado à parte; UI sem nomes de fornecedor.

### T2 — Backend pausado
1. Sintoma: agenda/sync falham; Configurações mostra offline ou sync antigo.
2. Passo: reativação no painel do projeto → `household_agenda_snapshot` → `get_ops_monitor_snapshot`.
3. Esperado: serviço volta; atraso Free classificado best effort.

### T3 — SMTP quebrado
1. Sintoma: igual T1 + reenvio OTP falha.
2. Passo: nova App Password nos secrets SMTP **ou** manter senha temporária.
3. Esperado: login sem vazar Gmail/SMTP na UI (`mapAuthError`).

### T4 — Push falhou
1. Sintoma: sem notificação; Registro compartilhado ok.
2. Passo: monitor outbox/cron → disparo manual da Function → estados de push em Configurações.
3. Esperado: produto segue; push não encerra o v1 (PRD §21).

### T5 — Restauração de DB
1. Sintoma: drill / perda lógica.
2. Passo: [runbook-backup.md](./runbook-backup.md) restore em alvo controlado ou rehearsal semanal.
3. Esperado: dados representativos ok; privada `age` permanece offline.

Critérios de “passou”:

- O facilitador encontrou o passo no runbook sem inventar procedimento.
- A UI do Adulto **não** exige nomes de fornecedor para concluir a ação.
- Falhas Free/Gmail/atraso foram descritas como best effort, não SLA.

Gaps anotados: heartbeat de cron hoje vem do spike `send-test-push` até o worker de dose/resumo existir; outbox permanece vazia sem enfileiramento de entregas.
