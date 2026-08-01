# Inventário da UI atual

Este documento responde ao ticket Wayfinder **Inventariar superfícies, estados
e fricções atuais**. Ele descreve a UI em `main` em 01/08/2026, antes do
redesign mobile.

Não é uma especificação futura. O comportamento pretendido continua definido
por `PRD.md`; quando código e PRD divergem, a divergência aparece como lacuna e
não como precedente para o protótipo.

## Fontes examinadas

- shell e estados globais em [`src/app`](../../src/app/);
- componentes renderizados em [`src/components`](../../src/components/);
- regras de apresentação em [`src/lib`](../../src/lib/);
- cobertura atual em [`tests/unit`](../../tests/unit/) e
  [`tests/e2e`](../../tests/e2e/);
- PRD §§7–14 e §§17–19;
- [norteadores visuais preservados](references/README.md).

## Garantias atuais que o redesign deve preservar

1. Hoje permanece a única superfície primária; Amanhã aparece inline ou apenas
   como contagem conforme o horário da Casa.
2. A ordem das Ocorrências vem do snapshot autoritativo; Realtime invalida e
   dispara nova leitura, sem reconstrução local.
3. Ações ficam bloqueadas offline e durante a leitura obrigatória após
   reconexão.
4. Uma confirmação mostra `registrando…` antes da persistência, mas só altera o
   estado compartilhado depois da resposta do banco.
5. Concorrência de dose e evento avulso informa quem registrou primeiro.
6. `Sem responsável` combina cor, ícone e texto.
7. Títulos de Ocorrência usam no máximo duas linhas na lista e até 120
   caracteres no domínio.
8. Conclusões e cancelamentos continuam visíveis, riscados e com opacidade
   reduzida.
9. Botões cobertos pelo CSS atual têm alvo mínimo de 44×44; o app declara
   `light dark` e usa controles nativos navegáveis por teclado.
10. A atualização do PWA só é oferecida quando nenhuma edição ou confirmação
    está em andamento.
11. Configurações separa registros ativos e arquivados e mantém operações
    administrativas fora da interface.
12. A UI de medicamento descreve programação e Registro, sem aconselhamento
    médico.

## Mapa de superfícies

### Shell global e PWA

| Superfície | Estados atuais | Ações / saída |
| --- | --- | --- |
| Shell | título `Combinado`; marcador de ambiente fora de produção | contém autenticação ou app autenticado |
| Conectividade | oculto online; aviso textual offline | nenhuma ação |
| Atualização | oculto; banner fixo quando há Service Worker aguardando e nenhuma interação ativa | `Atualizar` recarrega após ativação |
| Instalação | manifest, ícones 192/512 e Apple touch icon | instalação é conduzida pelo sistema |

O shell inteiro é uma única página. Não há rotas ou histórico de navegação para
Configurações, detalhes ou formulários.

### Autenticação

| Etapa / gate | Estados atuais | Ações |
| --- | --- | --- |
| Configuração ausente | mensagem de ambiente sem Supabase | nenhuma |
| Sessão | `Carregando…`, login ou conteúdo autenticado | transição pelo estado do Supabase |
| E-mail | vazio, preenchido, pendente, erro | `Enviar código`; `Usar senha temporária` |
| OTP | código parcial/completo, pendente, erro, expirado, cooldown de reenvio | `Confirmar`; `Reenviar código` |
| Senha temporária | campos vazios/preenchidos, pendente, erro | `Entrar`; voltar ao código por e-mail |

O e-mail persiste ao alternar para senha temporária. Na etapa OTP não existe
ação para corrigir o endereço digitado; recarregar a página é a única saída
visível para a etapa inicial.

### Gate da Casa

| Estado | Apresentação atual |
| --- | --- |
| Carregando | parágrafo `Carregando…` |
| Cliente indisponível | não renderiza conteúdo |
| Adulto sem Casa | texto técnico com `bootstrap_household` |
| Schema ausente | texto técnico sobre migrations e cache da API |
| Sem Criança ativa | parágrafo instruindo cadastro em Configurações |
| Pronto | Hoje/Amanhã |

### Hoje e Amanhã

| Superfície | Estados atuais | Ações |
| --- | --- | --- |
| Agenda | carregando, indisponível, erro, online, cache offline do dia, cache de dia antigo | atualização automática; nenhuma ação manual de tentar novamente |
| Hoje | vazio ou lista ordenada | ações por Ocorrência |
| Amanhã antes das 19h | contagem no fim de Hoje | nenhuma |
| Amanhã após as 19h | vazio ou lista completa inline | ações permitidas por tipo de Ocorrência |
| Cache offline | data do cache e última sincronização; escrita bloqueada | somente leitura |
| Cache de dia anterior | título `Registro em cache`; não renomeia dados antigos como Hoje | somente leitura |

Cada Ocorrência é hoje uma superfície arredondada independente, empilhada com
espaço entre itens. O conteúdo principal é um botão transparente que abre e
fecha detalhes dentro da própria linha.

#### Anatomia atual da Ocorrência

- horário ou `Sem horário`;
- título;
- Criança ou Casa;
- status;
- Responsável quando existe;
- executor e horário real quando existe;
- instrução de medicamento quando existe;
- alerta de Responsável ausente;
- ação principal, feedback e detalhes variáveis.

#### Matriz de ações por origem

| Origem | Hoje | Amanhã | Após Registro |
| --- | --- | --- | --- |
| Dose | `Confirmar dose`; confirmação adicional quando mais de 30 minutos cedo; detalhes de instrução | somente detalhes | `Desfazer` por 10 segundos; depois `Corrigir registro` com confirmação |
| Evento avulso confirmável | `Concluir`; detalhes; cancelar | detalhes; cancelar | `Desfazer` por 10 segundos; depois `Corrigir registro` |
| Evento avulso informativo | detalhes; cancelar | detalhes; cancelar | não se aplica |
| Rotina | detalhes; cancelar Ocorrência; remarcar; trocar Responsável; editar detalhes; restaurar padrão | as mesmas exceções | não há ação de conclusão implementada |

Os detalhes de Rotina podem abrir um segundo nível inline com checkbox de
cancelamento, horário e Responsável. Confirmações de cancelamento, correção e
registro antecipado também expandem dentro do item.

### Configurações

`Configurações` é um botão abaixo de Hoje. Ao abrir, todos os módulos são
montados e exibidos em uma única coluna, nesta ordem:

1. Estado operacional;
2. Adultos;
3. Crianças;
4. Rotinas semanais;
5. Medicamentos;
6. Compromissos avulsos;
7. Notificações;
8. Casa, backup e privacidade;
9. Sair.

Offline ou durante reconexão, um único `fieldset` desabilita Adultos, Crianças,
Rotinas, Medicamentos, Eventos e Notificações. Estado operacional, aviso de
privacidade e logout continuam fora desse gate.

#### Catálogo de Configurações

| Módulo | Conteúdo / estados | Ações atuais |
| --- | --- | --- |
| Estado operacional | online/offline, última sincronização, push, backup, limites best effort | nenhuma |
| Adultos | carregando, erro, ativos e arquivados | somente leitura; troca é administrativa |
| Crianças | carregando, erro, ativas e arquivadas | adicionar, renomear inline, arquivar, reativar amanhã |
| Rotinas | carregando, erro, formulário, ativas e arquivadas | criar, editar para amanhã, arquivar amanhã, reativar amanhã |
| Medicamentos | carregando, erro, formulário, ativos e arquivados | criar, editar para amanhã, arquivar amanhã, interromper agora, reativar amanhã |
| Eventos avulsos | carregando, erro, formulário, próximos e cancelados | criar e cancelar; não editar |
| Notificações | carregando; ativa, permissão necessária, reparo/reinstalação, indisponível ou não configurada | ativar ou reparar quando aplicável |
| Casa, backup e privacidade | backup carregando/desconhecido/saudável/atrasado e aviso longo | nenhuma |
| Sessão | normal ou confirmação inline | sair / confirmar saída / cancelar |

#### Campos dos cadastros

| Cadastro | Campos atuais |
| --- | --- |
| Criança | nome |
| Rotina | título, alvo, dias da semana, horário, requer confirmação, Responsável padrão, data inicial, data final |
| Medicamento | nome, Criança, instrução, horários como texto separado por vírgulas, data inicial, data final |
| Evento avulso | título, data, alvo, horário, requer confirmação, Responsável planejado |

Os formulários de criação ficam permanentemente abertos antes das listas.
Rotina e Medicamento reutilizam esse formulário no topo para edição de um item
selecionado mais abaixo.

## Estados transversais atuais

| Família | Implementação atual |
| --- | --- |
| Carregamento | parágrafo curto; sem skeleton e normalmente sem preservação do layout |
| Pendente | controles desabilitados; confirmação de Ocorrência e ativação/reparo de push explicitam progresso, mas os formulários mantêm o rótulo original |
| Erro | texto no início da seção ou junto à Ocorrência; formulários não associam o erro ao campo específico |
| Vazio | texto simples; sem ilustração |
| Confirmação destrutiva | expansão inline com ação e `Voltar`/`Cancelar`; padrão varia entre módulos |
| Offline | aviso global, aviso da Agenda e aviso de escrita em Configurações podem coexistir |
| Conflito | texto informa que outra alteração chegou; edição local permanece em memória |
| Tema escuro | `light-dark()` sobre uma paleta azul/slate mínima; sem tokens semânticos completos |
| Foco | foco nativo, com regra explícita apenas em detalhes de Ocorrência e banner de atualização |
| Movimento | praticamente inexistente |

## Lacunas contra a lei atual do produto

Estas lacunas não pedem uma decisão de redesign nem uma emenda do PRD. O
protótipo deve representar o comportamento já exigido pelo PRD, e a futura
implementação precisa fechar a diferença.

### L1 — Rotina confirmável não pode ser concluída

O snapshot pode produzir Rotina com `requires_confirmation = true`, status e
alerta de Responsável. Porém a UI considera confirmável apenas Dose ou Evento
avulso, e o banco possui conclusão somente para evento avulso. Não existe ação,
RPC, persistência, auditoria ou teste de concorrência para concluir uma
Ocorrência de Rotina.

Impacto: uma das formas centrais de compromisso pode ficar `atrasada` sem meio
de produzir o Registro exigido pelo PRD §8.3.

### L2 — Configuração inicial termina cedo demais

O gate considera a Casa pronta assim que existe uma Criança ativa. O PRD exige
Criança mais Rotina **ou Medicamento** antes de voltar a Hoje. A mensagem atual
também menciona somente Rotina e não oferece um controle que abra o fluxo.

Impacto: o primeiro Adulto pode cair em Hoje vazio antes de configurar qualquer
Ocorrência útil e precisa descobrir sozinho onde continuar.

### L3 — Evento avulso de Amanhã não pode ser editado

O PRD §7.2 permite editar ou cancelar evento avulso em Amanhã. A Ocorrência e a
lista de Eventos oferecem apenas cancelamento; não existe formulário ou API de
edição.

Impacto: corrigir título, horário, alvo ou Responsável exige cancelar e recriar,
comportamento não definido como substituto pelo PRD.

## Registro de fricções para os protótipos

### Prioridade alta — clareza, segurança e tarefa principal

| ID | Evidência atual | Risco / pergunta para o protótipo | Destino |
| --- | --- | --- | --- |
| F01 | aviso global diz que `dados precisam de conexão`, mesmo quando a Agenda mostra cache válido; até três avisos offline coexistem | preservar verdade, última sincronização e gate de escrita sem repetição ou contradição | componentes/estados e linguagem |
| F02 | erro ao carregar Agenda não oferece tentativa manual; erros de formulário ficam no topo da seção | tornar recuperação evidente e manter erro próximo da origem/campo | componentes/estados e linguagem |
| F03 | Configurações monta oito módulos e todos os formulários numa coluna | encontrar uma tarefa secundária exige varrer uma página longa; validar índice com drill-down | Configurações |
| F04 | cada Ocorrência é um card vertical com diversos metadados | 100 Ocorrências produzem rolagem extrema apesar de a preparação de dados ser rápida | Hoje/Amanhã |
| F05 | detalhes e ações secundárias expandem dentro da lista, às vezes em dois níveis | reflow desloca contexto e controles em uma Agenda longa | Hoje/Amanhã |
| F06 | Rotina/Medicamento editam no formulário localizado antes da lista | a ação ocorre longe do item e pode exigir rolagem manual de volta ao topo | Configurações |
| F07 | horários de medicamento são digitados como texto `08:00, 20:00` | formato eficiente para código, mas propenso a erro e difícil no teclado mobile | Configurações |

### Prioridade média — hierarquia, acesso e consistência

| ID | Evidência atual | Risco / pergunta para o protótipo | Destino |
| --- | --- | --- | --- |
| F08 | shell e Login podem renderizar dois `h1`; ações primária e secundária usam aparência nativa equivalente | hierarquia de marca, etapa e ação não é explícita | identidade e Login |
| F09 | OTP não permite corrigir o e-mail | um endereço incorreto cria beco sem saída visível | Login |
| F10 | pendência de Login e formulários só desabilita controles, sem rótulo estável de progresso | ação pode parecer ignorada em rede lenta | componentes/estados |
| F11 | linhas de Eventos, Rotinas e Medicamentos concatenam atributos com `·` | leitura e comparação ficam difíceis com nomes longos ou Dynamic Type | Configurações |
| F12 | confirmação destrutiva varia: Criança arquiva imediatamente; Rotina, Medicamento, Evento e logout expandem confirmações diferentes | risco e reversibilidade não têm linguagem consistente | componentes/estados |
| F13 | status de backup aparece em Estado operacional e novamente em Casa, backup e privacidade | conteúdo e chamada de rede duplicados | Configurações |
| F14 | mensagens de Casa/schema expõem RPC, migrations e cache da API ao Adulto | linguagem operacional compete com uma ação clara de recuperação | linguagem |
| F15 | instrução de medicamento aparece na linha recolhida além dos detalhes | aumenta densidade e exposição sem decisão explícita de prioridade | Hoje/Amanhã |

### Prioridade estrutural — sistema visual e validação

| ID | Evidência atual | Risco / pergunta para o protótipo | Destino |
| --- | --- | --- | --- |
| F16 | paleta mínima azul/slate, controles nativos, ausência de tokens de espaço/raio/tipo/semântica | não existe sistema reutilizável para aplicar o norte visual de modo consistente | identidade e componentes/estados |
| F17 | CSS garante 44×44 para grupos de botões, mas não para inputs, selects e checkboxes | requisito de toque não está assegurado em todos os controles | componentes/estados e validação |
| F18 | renomear Criança mostra um input sem label acessível explícito | leitor de tela perde o propósito do campo | Configurações e validação |
| F19 | `main` não usa safe-area; banner de atualização é fixo e não reserva espaço no conteúdo | recorte ou sobreposição em PWA instalada | componentes/estados e validação |
| F20 | tema do navegador usa um único `#0f172a` enquanto a página alterna claro/escuro | chrome do PWA pode não acompanhar a superfície | identidade e componentes/estados |
| F21 | teste de 100 Ocorrências mede apenas criação/mapeamento do fixture, não DOM, altura, rolagem ou interação | a meta funcional não prova usabilidade densa | validação |
| F22 | teste de acessibilidade procura regex de CSS; E2E autenticado verifica presença dos módulos, não fluxos, foco, zoom ou estados | regressões de experiência permanecem invisíveis | validação |

## Entregas necessárias por ticket posterior

### Aprovar a identidade visual, tipografia e ícones do PWA

- substituir a paleta azul/slate e o `themeColor` isolado por identidade coerente;
- comparar tipografia com números, horários, títulos longos e tema escuro;
- aprovar marca hero, marca compacta, favicon e ícones padrão/maskable;
- definir hierarquia entre marca, título da tela e ação primária.

### Aprovar Login e configuração inicial da Casa

- cobrir todos os gates e três etapas de autenticação;
- oferecer correção de e-mail no OTP e progresso explícito;
- transformar `Configurar casa` em fluxo focado até Criança + Rotina ou
  Medicamento;
- manter mensagens administrativas fora do caminho normal do Adulto.

### Aprovar a experiência de Hoje, Amanhã e Ocorrências

- prototipar linha compacta agrupada, com ação principal ainda visível;
- definir o que permanece na linha e o que migra para bottom sheet;
- representar Dose, Evento e Rotina confirmável conforme o PRD, inclusive as
  lacunas L1 e L3 como comportamento esperado;
- cobrir persistindo, falha, tentar novamente, concorrência, desfazer,
  correção, exceção, offline e cache de dia anterior.

### Aprovar a arquitetura secundária de Configurações e formulários

- substituir a coluna monolítica por índice e telas focadas;
- definir padrões comuns de lista, criação, edição, confirmação, ativo e
  arquivado;
- validar controles mobile para dias, datas e múltiplos horários;
- preservar sem busca/filtros e sem transformar Configurações em navegação
  primária.

### Aprovar componentes, temas e estados semânticos

- unificar loading, pending, erro, recuperação, offline, stale, conflito,
  confirmação, update e feedback persistido;
- especificar inputs e todos os alvos de toque, foco, safe areas e movimento;
- separar terracotta decorativa de warning, erro, sucesso e conectividade;
- definir claro/escuro completos sem reduzir contraste de conteúdo concluído.

### Aprovar a linguagem da interface e as declarações de privacidade

- corrigir F01, F02, F09, F10 e F14;
- reduzir duplicação operacional sem ocultar limites best effort;
- manter vocabulário Adulto, Casa, Ocorrência, Responsável, Hoje, Amanhã e
  Registro;
- preservar a descrição correta de Supabase, cache local, push e backup.

### Validar densidade, acessibilidade e estados degradados

- transformar F17–F22 em verificações comportamentais e visuais;
- exercitar combinações reais, não apenas presença de seletores ou custo de
  mapear dados;
- confirmar que melhorias de hierarquia não escondem persistência, autoria ou
  Responsável ausente.

## Limite da descoberta

Este inventário descreve o que pode ser provado pelo repositório e pelo PRD.
Não há dados de observação com os dois Adultos usando o app em produção; logo,
as fricções são hipóteses fundamentadas para os protótipos, não alegações de
pesquisa com usuários.
