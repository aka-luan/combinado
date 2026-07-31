# Checklist: acessibilidade e performance (dois iPhones)

Checklist manual para issue #12 / PRD §§18–19. Rodar em **dois iPhones** com o PWA
instalado na Tela de Início, um Adulto por aparelho, Casa já configurada.

Automatizado em CI (unit): tema `light dark`, alvos 44×44, clamp de título em
duas linhas, fixture de 100 ocorrências, gate de atualização do PWA, e
separação feedback vs persistência — ver `tests/unit/a11y-perf.test.mjs` e
`tests/unit/pwa-update.test.mjs`.

## Acessibilidade

| Cenário | Resultado esperado |
| --- | --- |
| Tema claro do sistema | Alertas (erro, sem responsável) legíveis com contraste adequado |
| Tema escuro do sistema | Idem |
| Zoom / texto maior do iOS | Hoje e Configurações continuam usáveis; sem corte crítico |
| Teclado externo / Voice Control | Foco visível; confirmar / concluir / voltar alcançáveis |
| VoiceOver nos fluxos primários | Rótulos ouvem-se em login, confirmação de dose, compromisso, sem responsável |
| Áreas de toque | Confirmar / Concluir / Atualizar / Configurações ≥ 44×44 pt |
| Sem responsável | Cor + ícone `!` + texto “Sem responsável” (nunca só cor) |
| Título longo (≤120) | Lista: até duas linhas; detalhes: título completo |

## Performance (serviço ativo, Wi‑Fi doméstico ou 4G normal)

Medir no percentil aproximado (vários toques). **Separar** feedback imediato
da persistência no servidor — não misturar as duas metas.

| Medida | Meta p95 | Como medir |
| --- | --- | --- |
| Feedback visual de toque | < 100 ms | Do toque até “registrando…” / estado ocupado |
| Snapshot → render | < 300 ms | Do fim do fetch até lista de Hoje estável |
| Persistência de ação | < 1 s | Do início da chamada até Registro atualizado |
| Realtime entre aparelhos | < 1 s | Confirmar no iPhone A; ver no B |
| Abertura completa | < 2 s | Do ícone até Hoje utilizável (sessão válida) |

Hoje com ≥100 ocorrências (fixture de teste ou dados densos): scroll e
confirmação continuam responsivos; sem travar a UI.

## Atualização segura do PWA

| Cenário | Resultado esperado |
| --- | --- |
| Novo deploy com app aberto | Download em segundo plano; **sem** reload sozinho |
| Ação/edição em andamento | Banner “Nova versão” **não** força reload |
| App ocioso com versão pronta | Oferece “Atualizar”; só então aplica |
| Confirmar durante waiting | Confirmação/form não se perde por reload |

## Registro

Data: ____ · iPhone A: ____ · iPhone B: ____ · build/deploy: ____

Notas / falhas:
