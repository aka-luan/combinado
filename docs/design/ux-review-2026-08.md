# Revisão de UI/UX — Combinado (08/08/2026)

**Escopo:** superfícies implementadas hoje (Login, primeiro acesso, Hoje/Amanhã,
bottom sheet de Ocorrência, Configurações) verificadas em 390×844, em tema claro
e escuro, com texto a 200% e em desktop.
**Base de julgamento:** [`docs/design/mobile-redesign.md`](mobile-redesign.md)
(contrato aprovado), `PRD.md` e a
[checklist de a11y](../checklist-a11y-perf.md).
**Método:** build estático servido localmente com Supabase mockado (mesma
técnica de `tests/e2e/mobile-shell.spec.ts`), fixtures de 5 e de 100
Ocorrências, medições de foco, nomes acessíveis, geometria e contraste.

Esta revisão descreve problemas e recomendações. Nenhuma alteração de código foi
feita; nada aqui altera a lei do PRD.

## O que já está bom

- Todos os alvos interativos medidos ficaram ≥ 44×44 — nenhum controle abaixo do
  mínimo em Hoje, sheet ou Configurações.
- Os tokens de cor têm folga real de contraste para texto (16:1 no corpo, 5,5:1
  a 6,7:1 nos secundários, claro e escuro).
- `Sem Responsável` combina cor + ícone + texto, como o contrato exige.
- Estados de offline, cache antigo, reconexão e conflito existem de verdade,
  bloqueiam escrita e têm texto próprio — a parte mais difícil do contrato está
  honrada.
- O bottom sheet trata foco, `inert`, `aria-modal`, Escape e botão Voltar com
  cuidado; é a peça mais bem resolvida da interface.
- O tema escuro é tradução de tokens, não inversão.

## P0 — Bloqueadores

### 1. Configurações abre dentro do cabeçalho, não como superfície

`SettingsPanel` é passado como filho da `authenticated-shell__title-row`, que é
um flex `space-between` com o título `Hoje`. Todo o conteúdo de Configurações —
índice, catálogos e formulários — é renderizado dentro dessa coluna.

Medido em viewport de 390: o painel tem **242 px de largura, começando em
x=129**, e `[data-agenda]` continua montado e visível abaixo. Na prática, ao
abrir Rotinas semanais o Adulto vê o formulário espremido em ~62% da tela, o
título `COMBINADO / CASA · Hoje` cortando a lista de itens no meio, e o Hoje
inteiro repetido logo abaixo.

Contraria §6 (área secundária com drill-down focado) e §8.1 (390×844 sem cortar
formulário).

**Recomendação:** manter apenas o gatilho no cabeçalho e renderizar
Configurações como camada que substitui `authenticated-shell__content` (ou
portal, como o sheet já faz), ocupando a largura da superfície. A navegação por
hash e histórico já existente continua valendo.

### 2. O foco se perde ao registrar

Quando `busy` fica verdadeiro, `confirmableEligible` passa a falso e o botão
primário é desmontado, sendo substituído por um `<span>Registrando…</span>`.
Medido: `document.activeElement` cai para `BODY` durante a persistência e
continua em `BODY` depois do sucesso.

Para teclado e VoiceOver, concluir a 40ª Ocorrência devolve o Adulto ao topo da
página. Contraria §3.3 ("pendência explicita a fase no próprio controle") e
§8.1 (ordem de foco lógica).

**Recomendação:** manter o mesmo botão montado, com `disabled` + `aria-busy` e
rótulo `Registrando…`; usar a região viva apenas para anunciar o resultado.
Depois do sucesso, mover o foco deliberadamente para `Desfazer`.

### 3. Texto a 200% quebra Hoje

Com a raiz em 32 px (equivalente a texto grande do iOS / zoom 200%):

- o wordmark `Combinado` sobrepõe a marca no topo;
- o botão `Configurações` é cortado pela borda direita;
- títulos perdem conteúdo (`Antialérg…`, `Buscar na…`);
- o rótulo do CTA (`Confirmar dose`) é cortado dentro da própria pílula;
- `Sem horário` empurra o título para `R e..`.

§8.1 exige explicitamente 200% "sem perda de título, contexto ou ação". Hoje é
uma falha do critério de aceite, não um detalhe estético.

**Recomendação:** permitir quebra na linha da marca (esconder o wordmark quando
não couber), trocar `white-space: nowrap` do CTA por quebra permitida, revisar
`clamp()` do título da superfície e permitir três linhas de título de Ocorrência
quando a fonte estiver ampliada.

## P1 — Alto

### 4. O CTA de largura total transforma a lista em pilha de botões

Abaixo de 30rem, `.occurrence__primary-button { width: 100% }` faz cada linha
virar um bloco de ~230 px de altura dominado por um retângulo verde-escuro. Com
cinco Ocorrências cabe pouco mais de uma tela e meia; com as 100 da fixture, o
Hoje passa de 23.000 px de rolagem e todas as linhas têm o mesmo peso visual —
o bloco `Próximo` deixa de se destacar (§5.1).

O layout de desktop, onde o botão fica compacto à direita, é claramente melhor
e já existe no mesmo componente.

**Recomendação:** manter a grade `1fr auto` também no mobile, com o botão
compacto ao fim da linha e quebra apenas quando o rótulo não couber.

### 5. Ações primárias sem nome acessível distinto

Medido com três Ocorrências: os três botões se chamam exatamente `Concluir`.
Navegando por botões, o leitor de tela ouve "Concluir, Concluir, Concluir".
O mesmo vale para `Desfazer` e `Editar compromisso`.

**Recomendação:** `aria-label` combinando verbo e título
(`Concluir — Buscar na natação`) ou `aria-describedby` apontando para o título
da linha.

### 6. Bordas de campo abaixo do mínimo de contraste

`--color-border` contra o fundo dos campos dá **1,28:1 no claro** e **1,95:1 no
escuro**; o mínimo de 3:1 do WCAG 1.4.11 vale para limites de controle. Na
prática o campo de e-mail e o campo do código OTP mal se distinguem do papel.

**Recomendação:** separar o token de borda decorativa do token de borda de
controle (algo como `#b9b0a2` no claro e `#6f7a66` no escuro) e verificar no
resultado renderizado.

### 7. Controles secundários sem sistema visual

`Cancelar ocorrência`, `Remarcar horário`, `Trocar Responsável`,
`Editar detalhes`, e praticamente todos os botões de Configurações usam o botão
nativo do navegador. No tema escuro viram caixas cinza-claras dentro do sheet
verde-escuro — o oposto de "tradução completa dos tokens" (§2.1). Não existe
nenhuma regra `:hover`, `:active` ou `accent-color` no CSS, então os checkboxes
saem azuis do sistema (visível em `Requer confirmação`) e nenhum controle dá
retorno de pressão.

**Recomendação:** um conjunto pequeno e compartilhado — `primária`,
`secundária`, `destrutiva` — mais `accent-color: var(--color-brand)` e um
estado `:active` curto (respeitando `prefers-reduced-motion`).

### 8. Duas faixas de status dizendo a mesma coisa

No estado feliz, a primeira dobra mostra `Conexão ativa · Última sincronização:
08/08/2026, 11:08` dentro de um card **e** `Registro atualizado · ações
disponíveis` logo abaixo. São ~15% da primeira dobra gastos para dizer "está
tudo normal", com carimbo absoluto de data completa.

**Recomendação:** uma faixa só. Em `online_ready`, uma linha discreta com tempo
relativo (`Sincronizado há 2 min`); a faixa completa fica reservada para
offline, reconectando, cache antigo e erro, que é onde ela informa de verdade.

### 9. `Hoje` aparece duas vezes, e continua aparecendo em Configurações

O shell tem `H1: Hoje`, o conteúdo tem `H2: Hoje` com a data, e o `H1` continua
`Hoje` mesmo com Configurações aberto — reforçando o problema 1.

**Recomendação:** um único título de superfície, que muda para o nome da tela
focada quando Configurações está aberto.

## P2 — Médio

10. **Catálogos.** Os itens trazem metadados corridos numa linha
    (`Antialérgico · Nina · 08:00, 20:00`) e os botões quebram em escada; §6.2
    pede metadados em linhas separadas com ação principal clara. A lista de
    Medicamentos ainda usa marcadores de disco do navegador (falta o reset que
    Crianças, Rotinas e Eventos têm) — inconsistência visível.
11. **Formulário antes da lista.** Medicamentos, Rotinas e Crianças abrem com o
    formulário de criação expandido no topo; a lista, que é o motivo mais comum
    de entrar na tela, fica abaixo. Inverter, com um CTA `Adicionar` que revela
    o formulário.
12. **Estado da Casa.** Cinco parágrafos sem margem, colados, terminando no
    aviso de privacidade longo — um bloco de texto único. Estruturar como pares
    rótulo/valor (Conectividade, Última sincronização, Notificações, Backup) e
    recolher a privacidade.
13. **Rótulos de checkbox em coluna.** A regra genérica
    `label { flex-direction: column }` também pega os checkboxes: `Requer
    confirmação` fica abaixo de uma caixa azul de 44 px, e os sete dias da
    semana viram caixas grandes em duas colunas. Linha para checkbox e chips de
    dia com `aria-pressed` resolvem os dois.
14. **OTP não mostra o destino.** A tela do código nunca exibe o e-mail para
    onde ele foi enviado, e `Corrigir e-mail` aparece acima do campo. Mostrar
    `Enviamos um código para x@y.z` com a correção logo abaixo.
15. **O sheet não age.** Quem abre os detalhes para decidir precisa fechar para
    concluir. O contrato proíbe esconder a ação da linha, não repeti-la no
    sheet; um CTA no rodapé do sheet fecha o ciclo decidir → agir.
16. **Status ruidoso.** `Programado` se repete em todas as linhas. Mostrar
    status apenas quando ele diverge do esperado (`Atrasado`, `Concluído`,
    `Cancelado`, `Sem registro`) devolve significado ao campo.
17. **`Sem horário` ocupa a coluna do horário** e come ~45% da largura da linha,
    truncando o título cedo. Usar um traço com rótulo acessível, ou mover a
    informação para os metadados.
18. **Item concluído.** Opacidade 0,68 aplicada por cima do 0,85 dos metadados
    resulta em 4,07:1 — abaixo de 4,5:1. Usar um token de estado concluído em
    vez de empilhar opacidades.
19. **Marca no tema escuro.** `public/brand-mark.svg` tem uma placa fixa
    `fill="#fcfaf6"`, que vira um quadrado branco sobre o fundo escuro. Um
    `<style>` com `prefers-color-scheme` dentro do próprio SVG resolve sem
    duplicar arquivo.
20. **`role="status"` com carimbo de tempo.** O texto da faixa de conectividade
    muda a cada refetch (5 min), o que provoca releitura periódica pelo leitor
    de tela. Anunciar apenas mudanças de categoria de estado.
21. **Markup.** `<p>` dentro de `<span data-child-archive-confirm>` (e no
    equivalente de reativação) é aninhamento inválido; `occurrence-sheet__facts`
    seria mais honesto como `<dl>`.
22. **Verificar campos nativos em aparelho pt-BR.** No ambiente de teste,
    `input[type=date]` e `input[type=time]` renderizaram `mm/dd/yyyy` e
    `08:00 AM`, seguindo o locale do navegador e não `lang="pt-BR"`. Confirmar
    em iPhone configurado em português antes de considerar o ponto encerrado.

## Fora do contrato — decisão de produto

Criar um Evento avulso exige hoje três toques dentro de uma área que a própria
interface chama de secundária (`Configurações → Eventos avulsos`). Para um app
cuja proposta é "reduzir a distância entre uma decisão e sua ação" (§1),
combinar algo para hoje ou amanhã é ação frequente, não configuração.

Avaliar um CTA `Novo combinado` em Hoje exigiria emenda ao contrato (§5.1 e §6)
e não deve ser implementado sem ela. Fica registrado como pergunta de produto,
não como recomendação de implementação.

## Ordem sugerida de trabalho

1. P0 1 e 2 — são defeitos de superfície e de acessibilidade, não ajustes.
2. P1 4, 6 e 7 — sistema de controles e densidade da lista; resolvem vários P2
   de uma vez.
3. P0 3 depois do 4, porque a linha de Ocorrência muda de estrutura.
4. P1 5, 8, 9 e o bloco P2, que são majoritariamente CSS e cópia.
