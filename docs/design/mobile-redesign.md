# Contrato de redesign mobile do Combinado

**Status:** aprovado para handoff de implementação em 01/08/2026  
**Referência principal:** viewport de 390×844; validar também um iPhone menor  
**Escopo:** PWA instalada, somente superfícies mobile  
**Fonte de comportamento:** `PRD.md` e as emendas registradas na seção 9

Este documento é o contrato de implementação do redesign aprovado no mapa
Wayfinder [Definir o redesign mobile completo do Combinado](https://github.com/aka-luan/combinado/issues/33),
resolvido pelo ticket [Aprovar o contrato final de implementação e as emendas
do PRD](https://github.com/aka-luan/combinado/issues/35).

Ele consolida as decisões aprovadas no handoff. Os protótipos usados durante a
exploração foram descartados; este documento é agora a fonte única de
comportamento e apresentação para a implementação.

## 1. Contrato em uma página

O Combinado é uma ferramenta privada de coordenação e Registro para os dois
Adultos de uma Casa. O redesign deve tornar o estado compartilhado legível em
uma mão, preservar a confiança da persistência e reduzir a distância entre
uma decisão e sua ação.

As regras que não podem ser negociadas são:

- Hoje é a única navegação primária. Amanhã aparece inline depois das 19h;
- o Registro compartilhado no servidor é a fonte de verdade; push é apenas
  auxílio;
- cada Ocorrência confirmável tem no máximo um Responsável, mas qualquer um
  dos dois Adultos pode concluí-la;
- uma ação só afirma sucesso depois da resposta do banco;
- offline, cache antigo, reconexão e conflito são estados visíveis e bloqueiam
  escrita insegura;
- o app não interpreta prescrição, atraso ou dose e não oferece aconselhamento
  médico;
- a interface usa `pt-BR`, o fuso da Casa é `America/Sao_Paulo` e os termos
  `Adulto`, `Casa`, `Ocorrência`, `Responsável`, `Hoje`, `Amanhã` e
  `Registro` permanecem canônicos.

O contrato descreve uma única superfície operacional, com camadas de foco:

    Hoje
    ├── leitura do Registro e ações principais da Ocorrência
    ├── bottom sheet de detalhes e ações secundárias
    └── Configurações (índice → catálogo → formulário)

Não há aba de calendário, dashboard, segunda navegação primária, busca ou
filtro.

## 2. Decisões consolidadas

### 2.1 Identidade e sistema visual

- A direção geral é **Registro Vivo**: papel claro, hierarquia editorial,
  serif para títulos de Registro e sans-serif objetiva para a UI.
- A marca é própria, geométrica, representando dois Adultos e uma Casa. O
  wordmark usa texto vivo. A marca compacta, favicon, ícone padrão e ícone
  maskable são derivados do mesmo SVG; o logo raster de referência não é
  recortado.
- O título da superfície é `Hoje`, sem o prefixo `Registro de`.
- Creme e olive formam a base. Terracotta é acento de marca e destaque quente,
  não semântica de erro.
- O tema escuro é uma tradução completa dos tokens, não inversão automática de
  fundo. Login, Hoje denso e Configurações devem ser verificáveis em claro e
  escuro.
- Cada estado importante combina texto, ícone e cor. Cor ou opacidade nunca
  são o único sinal.

Referências preservadas:

- [Referências visuais preservadas](references/README.md);
- [Inventário da UI atual](current-ui-inventory.md).

### 2.2 Contrato de handoff

Este arquivo é a fonte única do handoff. Cada implementação deve conseguir
responder aqui, sem depender de protótipo ou decisão fora deste contrato:

1. qual é a superfície atual e a única ação primária;
2. o que aparece em carregamento, erro, vazio, offline, persistindo e conflito;
3. que informação fica na linha e que informação abre no bottom sheet;
4. como foco, teclado, botão Voltar e texto ampliado se comportam;
5. que cláusula do PRD dá origem ao comportamento;
6. quando uma decisão de UX exige a emenda exata indicada na seção 9.

O redesign não autoriza implementação de novas funcionalidades ou alteração do
modelo de autorização, RLS, auditoria, push ou cálculo de snapshot.

## 3. Quadro visual compartilhado

### 3.1 Tokens mínimos

Os nomes podem ser adaptados ao sistema de estilos existente, mas os papéis
semânticos precisam permanecer estáveis.

| Papel | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| fundo da Casa | `#FCFAF6` | olive muito escuro, sem preto puro | fundo principal |
| superfície | `#FFFFFF` | superfície olive/slate escura | cards, sheets e campos |
| superfície suave | `#F7F2EA` | camada escura elevada | agrupamentos e reasseguro |
| texto principal | `#1E1E1B` | creme claro | títulos, valores e ações |
| texto secundário | `#6E6D68` | creme dessaturado | metadados e ajuda |
| marca primária | `#4E5D32` | olive claro com contraste | CTA, marca e foco |
| marca forte | `#3F4D2A` | olive claro mais forte | títulos e ação pressionada |
| acento | `#D88B63` | terracotta claro controlado | marca e destaque, nunca único alerta |
| atenção | olive/âmbar escuro | âmbar claro | `Sem Responsável`, aviso de ação |
| erro | vermelho semanticamente distinto | vermelho claro | falha, sem reutilizar terracotta |
| offline | slate/olive neutro | slate claro | conectividade e cache |
| persistido | olive | olive claro | `Registrado`, `Confirmada` |

Contraste, foco e estado escuro devem ser verificados no resultado renderizado,
não apenas no valor dos tokens.

### 3.2 Tipografia e composição

- Display e wordmark usam uma serif editorial; UI, corpo, controles e números
  usam sans-serif legível e disponível no aparelho.
- Horários, datas, contagens e títulos longos usam a mesma família de UI para
  facilitar comparação.
- O título de uma Ocorrência ocupa no máximo duas linhas na lista. O detalhe
  mostra até 120 caracteres completos.
- O corpo padrão começa em 16 px; textos secundários não devem cair abaixo de
  14 px. A composição continua utilizável com zoom/texto a 200%.
- A escala usa unidade base de 4 px. Espaçamentos, raios e bordas seguem uma
  família consistente, sem criar um cartão diferente para cada estado.
- O conteúdo respeita safe areas. O `main` reserva espaço para banners fixos e
  nenhum controle fica sob o indicador de casa ou o banner de atualização.

### 3.3 Controles e feedback

- Todo alvo interativo tem pelo menos 44×44 pontos, incluindo inputs, selects,
  checkboxes, fechar sheet e ícones.
- O CTA primário é único por tela e usa verbo específico: `Continuar com
  e-mail`, `Salvar`, `Confirmar`, `Criar combinado e abrir o Hoje`.
- Pendência explicita a fase no próprio controle ou próximo dele:
  `Carregando o Registro…`, `Salvando…`, `Registrando…`, `Ativando
  notificações…`.
- Feedback de persistência só aparece após sucesso do servidor. Uma falha
  informa se nada foi alterado e oferece o próximo passo junto à origem.
- Respeitar `prefers-reduced-motion`; movimento é curto, funcional e nunca
  necessário para identificar um estado.

## 4. Shell, autenticação e configuração inicial

### 4.1 Shell autenticado

O topo autenticado é compacto:

- marca compacta e wordmark vivo quando houver espaço;
- `Privado` como reasseguro curto;
- título da superfície `Hoje`;
- ação discreta para Configurações;
- nenhum indicador técnico, número de rota ou navegação paralela.

O shell global pode mostrar conectividade e atualização do PWA, mas os avisos
não podem se empilhar contraditoriamente. Quando há cache utilizável, a
mensagem explica a data e a última sincronização; quando não há dados, explica
que o Registro está indisponível.

### 4.2 Login

O caminho aprovado é a variante **Passo a passo**:

- em 390×844, Login, código, senha temporária e cada etapa de configuração
  principal cabem em uma dobra sem depender de scroll para descobrir a ação;
- o topo mostra apenas marca e `Privado`;
- a introdução é curta e a privacidade fica dentro do card, perto da ação;
- o e-mail é o campo dominante, com um contorno de foco olive;
- o CTA é `Continuar com e-mail`;
- senha temporária é um link secundário com explicação curta;
- no OTP, o Adulto pode corrigir o e-mail sem recarregar a página;
- erros usam linguagem fixa e não revelam se um endereço não autorizado existe;
- o progresso usa texto de ação, não trilho numerado ou indicador de estado
  decorativo.

Estados obrigatórios: ambiente não configurado, carregando sessão, e-mail
vazio/preenchido/pendente/erro, OTP parcial/completo/pendente/expirado e
cooldown de reenvio, senha temporária e erro de sessão.

### 4.3 Primeiro acesso

Depois do Login, um Adulto sem dados vê `Configurar casa` em vez de Hoje vazio.
O fluxo focado é:

1. cadastrar uma Criança;
2. escolher Rotina semanal ou Medicamento;
3. concluir pelo menos uma dessas configurações;
4. usar `Criar combinado e abrir o Hoje`.

O gate só libera a entrada no Hoje depois de Criança + Rotina ou Medicamento.
Não é necessário cadastrar os dois. Se o Adulto sair antes, o estado permanece
no caminho de configuração e não o deixa diante de uma agenda sem Ocorrência
útil.

O fluxo não é tutorial em carrossel. Uma ilustração editorial pode aparecer
na entrada de Login e em momentos selecionados de reasseguro, mas não em Hoje,
Amanhã, Ocorrências ou Configurações.

### 4.4 Segundo Adulto

O segundo Adulto autentica e abre diretamente o Hoje compartilhado. Não existe
convite, aceite, cadastro público ou permissão diferente. O pedido de push só
ocorre contextualmente após instalação e gesto explícito.

## 5. Hoje, Amanhã e Ocorrências

### 5.1 Hoje

Hoje é uma página contínua e operacional:

- cabeçalho com marca em selo, `COMBINADO / CASA`, título central `Hoje` e
  Configurações;
- estado de conexão e última sincronização em uma faixa curta;
- bloco `Próximo` em destaque;
- restante das Ocorrências em linha compacta agrupada;
- a ação principal permanece alcançável na própria linha;
- Ocorrências concluídas continuam visíveis, riscadas e com opacidade moderada,
  sem perder contraste de `Confirmada`;
- 100 Ocorrências permanecem funcionais sem paginação ou virtualização no v1.

A ordem continua vindo integralmente do snapshot autoritativo. O cliente não
reordena, calcula ou corrige Ocorrências localmente.

### 5.2 Amanhã

Antes das 19h, o fim de Hoje mostra somente a contagem. A partir das 19h,
Amanhã aparece inline abaixo de Hoje, sem aba ou tela primária. A seção mostra
itens programados, sem horário e cancelados; cancelados ficam riscados e fora
da contagem.

Offline, Amanhã só aparece se já existir no snapshot armazenado. A data do
cache e a última sincronização ficam explícitas; um cache de dia anterior nunca
é renomeado como Hoje.

### 5.3 Linha da Ocorrência

A linha recolhida contém somente o necessário para decidir:

- horário ou `Sem horário`;
- título em até duas linhas;
- Criança ou Casa;
- status;
- Responsável, quando aplicável;
- ação principal, quando permitida.

Instrução de medicamento, executor, horário real e exceções ficam no detalhe,
salvo o mínimo indispensável para alertar `Sem Responsável`.

`Sem Responsável` é motivo explícito e combina texto, ícone e cor de atenção.
Informativa não recebe Responsável nem ação de conclusão.

O restante da linha abre detalhes; tocar no CTA dedicado executa a ação
principal. A ação não pode ficar escondida atrás de seleção ambígua.

### 5.4 Bottom sheet de detalhes

Detalhes e ações secundárias abrem um único bottom sheet sobre a superfície
atual. O sheet:

- preserva visualmente a Ocorrência e a posição da lista;
- move o foco para o título ou primeiro controle e devolve o foco ao elemento
  que o abriu ao fechar;
- torna o fundo inerte para teclado e leitor de tela;
- fecha por `Voltar`/`Escape` e por um controle rotulado, antes de sair da
  superfície;
- usa `aria-modal` e nome acessível apropriado;
- respeita safe area, teclado e texto ampliado;
- contém confirmação inline contextual para ações destrutivas;
- não transforma erro de campo ou falha de persistência em modal genérico.

Há no máximo um sheet aberto. A camada pode rolar internamente, mas a lista de
Hoje não perde o contexto.

### 5.5 Ações por origem e dia

| Origem | Hoje | Amanhã | Depois do Registro |
| --- | --- | --- | --- |
| Dose | confirmar; confirmação neutra se mais de 30 min cedo; detalhes | somente detalhes | desfazer por 10 s; depois corrigir até o fim do dia |
| Evento confirmável | concluir; detalhes; cancelar | editar; cancelar; detalhes | desfazer por 10 s; depois corrigir até o fim do dia |
| Evento informativo | detalhes; cancelar | editar; cancelar; detalhes | não se aplica |
| Rotina confirmável | concluir; cancelar/exceção; detalhes | cancelar, remarcar ou trocar Responsável | mesmo ciclo de Registro de Evento confirmável |
| Rotina informativa | detalhes; cancelar, remarcar ou trocar Responsável | as mesmas ações permitidas | não se aplica |

Não é permitido confirmar dose ou concluir compromisso amanhã. Remarcação de
Rotina permanece na mesma data. Alterar a data de uma Ocorrência exige evento
avulso quando a regra do PRD assim determinar.

### 5.6 Registro e concorrência

Toda conclusão ou confirmação segue a mesma sequência:

    toque → feedback imediato "Registrando…" → resposta do banco
          ├── sucesso → Registro compartilhado atualizado e autoria exibida
          ├── conflito → autor e horário do primeiro Registro
          └── falha → estado anterior restaurado e nova tentativa oferecida

Uma Rotina confirmável não tem um ciclo especial: registra executor e horário
real, preserva Responsável planejado, permite desfazer por 10 segundos e
correção deliberada até o fim do dia, com auditoria.

Offline ou durante reconexão, os controles de escrita ficam desabilitados. A
interface nunca pinta uma Ocorrência como confirmada antes da persistência.

## 6. Configurações

Configurações continua sendo área secundária aberta a partir de Hoje. A
navegação é um índice agrupado com drill-down focado, apoiado por histórico e
hash do navegador, sem rota pública nova e sem competir com Hoje.

### 6.1 Índice

Os grupos e a ordem são:

1. **Casa:** Adultos, Crianças;
2. **Planejamento:** Rotinas semanais, Medicamentos, Compromissos avulsos;
3. **Aplicativo:** Estado da Casa, Notificações;
4. rodapé isolado: Sair.

Estado da Casa consolida sincronização, backup, privacidade e limites
operacionais. O status de backup não é duplicado em outra seção. O índice não
monta nem carrega todos os módulos; somente o catálogo focado atual é ativo.

Cada tela focada oferece `Voltar` para Configurações ou Hoje, preserva o
contexto no botão Voltar do aparelho e tem uma ação primária clara.

### 6.2 Catálogos

Cada catálogo:

- apresenta Ativos antes de Arquivados;
- separa visualmente os dois grupos sem esconder arquivados;
- mostra título, metadados legíveis em linhas separadas e ação principal;
- oferece `Editar` para ativos e `Reativar amanhã` para arquivados quando
  aplicável;
- mostra estado vazio, carregando e erro na própria tela;
- usa erro próximo ao campo ou à linha que originou o problema;
- não tem busca ou filtro.

Adultos são leitura da UI; troca de Adulto continua operação administrativa
documentada fora do caminho normal.

### 6.3 Formulários

Criação e edição compartilham tela focada e estrutura:

- título da tarefa e contexto do item, se edição;
- labels explícitos e associação programática com cada controle;
- somente campos estruturalmente obrigatórios bloqueiam salvar;
- erros junto ao campo, com texto que diz o que corrigir;
- `Cancelar` e `Salvar` sempre visíveis no final e acessíveis por teclado;
- feedback de sucesso somente após persistência;
- arquivos de formulário não incorporam aconselhamento médico.

Padrões específicos:

- Criança: nome;
- Rotina: título, alvo, dias individuais, horário opcional, confirmação,
  Responsável padrão e validade;
- Medicamento: nome, Criança, instrução textual opcional conforme prescrição,
  datas e um controle `HH:mm` por slot, com remoção individual;
- Evento avulso: data, título, alvo, confirmação, horário opcional e
  Responsável.

Arquivamento, interrupção imediata, cancelamento e saída usam confirmação
inline contextual com `Confirmar`, `Cancelar` e feedback persistido. Referências
ativas bloqueiam arquivamento quando o PRD exige resolver dependências antes.

### 6.4 Edição de Evento avulso

Um Evento avulso futuro e não concluído pode ser editado em Amanhã (e em seu
catálogo) por formulário focado. A edição pode alterar título, data, alvo,
horário, requer confirmação e Responsável, respeitando as regras de data futura
ou do mesmo dia.

Salvar uma edição cria uma nova revisão auditável do planejamento e torna a
revisão mais recente a vigente. A revisão anterior não é apagada. Se a nova
data for Hoje, o evento aparece em Hoje no snapshot seguinte; se continuar em
Amanhã, permanece na seção inline. Um Evento já concluído não é editado: usa o
fluxo de correção do Registro.

## 7. Estados transversais

| Estado | Sinal obrigatório | Ação permitida |
| --- | --- | --- |
| carregando | verbo específico e layout preservado quando possível | aguardar |
| online pronto | última sincronização quando relevante | ações do domínio |
| sem conexão | `Sem conexão. Mostrando a última versão sincronizada; ações ficam bloqueadas até atualizar o Registro.` | leitura do cache |
| reconectando | `Atualizando o Registro…` | nenhuma escrita até sucesso |
| cache antigo | data original, `offline` e última sincronização | leitura; nenhuma escrita |
| vazio | texto do PRD, sem ilustração ou pressão | ação de configuração se aplicável |
| persistindo | `Salvando…`/`Registrando…`, controle desabilitado | aguardar resposta |
| sucesso | confirmação textual, autoria quando houver | desfazer/corrigir conforme janela |
| conflito | outra alteração, Adulto e hora quando disponível | atualizar e revisar |
| erro | falha, estado de persistência e próximo passo na origem | tentar novamente |
| atualização do PWA | banner com foco e espaço reservado | atualizar só sem edição/Registro em andamento |

O aviso de privacidade aprovado explica Registro compartilhado no servidor,
cache local removido ao sair, push opcional e backup cifrado que pode atrasar.
Ele não diz que dados ficam somente no aparelho e não expõe Supabase, RPC,
migrations ou schema ao Adulto.

## 8. Acessibilidade e matriz de validação

### 8.1 Critérios de aceite visual e de interação

- 390×844 e viewport menor sem cortar CTA, sheet ou formulário;
- zoom/texto a 200% sem perda de título, contexto ou ação;
- Dynamic Type e títulos de 120 caracteres sem sobreposição;
- cinco Crianças e 100 Ocorrências sem regressão de leitura ou ação;
- todos os controles com alvo mínimo de 44×44 pontos;
- foco visível e ordem de teclado lógica em shell, formulário e sheet;
- leitor de tela identifica labels, status, erro, diálogo e retorno de foco;
- `prefers-reduced-motion` remove transições não essenciais;
- tema escuro preserva contraste e semântica;
- safe areas não ocultam `main`, CTA, banner ou fechamento do sheet;
- ações offline e durante reconexão ficam realmente desabilitadas;
- o item concluído permanece visível, riscado e com contraste suficiente;
- `Sem Responsável` é entendido sem depender da cor;
- nenhum texto de medicamento interpreta o que fazer com uma dose.

### 8.2 Estados a exercitar

Cada superfície representativa deve ser verificada em carregando, vazio, erro,
offline, desatualizado, persistindo, conflito, sucesso e tema escuro. Em
Hoje/Amanhã, incluir doses pendentes/atrasadas/confirmadas/sem registro,
Rotina confirmável, evento informativo, evento editado, cancelamento,
Responsável ausente e concorrência entre os dois Adultos.

### 8.3 Evidência

- [Inventário da UI atual](current-ui-inventory.md) é a linha de base e lista
  garantias que não podem regredir;
- [Referências visuais preservadas](references/README.md) registra a
  proveniência das referências, mas não são assets de produção;
- este contrato registra as decisões aprovadas e a validação necessária para
  a fixture de 100 Ocorrências.

## 9. Emendas exatas ao PRD

As decisões de Rotina confirmável e onboarding alinham a implementação à lei
que o PRD já contém em §§8.1, 8.3 e 12.1. A edição de Evento avulso em Amanhã
está declarada em §7.2, mas precisa de semântica de persistência. As mudanças
abaixo são as únicas emendas comportamentais deste contrato.

### Emenda P1 — conclusão de Rotina confirmável

**Seção:** PRD §8.3 — Conclusão  
**Ação:** acrescentar antes da lista de regras:

> Toda Ocorrência confirmável — incluindo Dose, Evento avulso e Rotina
> semanal — pode ser concluída na data da Ocorrência por qualquer Adulto. A
> conclusão registra o Responsável planejado, quando houver, e o Adulto
> executor com o horário real.

**Motivo:** a lei do produto já permite concluir uma Rotina confirmável, mas o
fluxo deve ser explícito e não pode depender de uma implementação especial ou
de uma interpretação da origem da Ocorrência.

### Emenda P2 — gate de configuração inicial

**Seção:** PRD §12.1 — Primeiro adulto  
**Ação:** substituir o fluxo mínimo por:

> Sem dados úteis, Hoje mostra `Configurar casa`. O fluxo focado exige:
>
> 1. cadastrar uma Criança;
> 2. escolher e cadastrar uma Rotina semanal ou um Medicamento;
> 3. retornar ao Hoje pelo CTA `Criar combinado e abrir o Hoje`.
>
> O gate só libera o Hoje depois de existir uma Criança ativa e pelo menos uma
> Rotina ou um Medicamento ativo. Não é necessário cadastrar os dois.

**Motivo:** o caminho aprovado não termina em Hoje vazio depois de somente uma
Criança e não deve transformar Rotina em requisito artificial quando o PRD já
admite Medicamento como configuração útil.

### Emenda P3 — revisão de Evento avulso futuro

**Seção:** PRD §7.2 — Amanhã  
**Ação:** após `editar ou cancelar evento avulso`, acrescentar:

> Editar um Evento avulso futuro e não concluído abre o formulário focado e
> pode alterar título, data, alvo, horário, requer confirmação e Responsável,
> respeitando as regras de data do §8.7. A edição torna-se uma nova revisão
> auditável do planejamento; a revisão anterior não é apagada. Se a nova data
> for Hoje, a Ocorrência aparece em Hoje após o snapshot seguinte. Um Evento já
> concluído não é editado diretamente; sua correção usa o fluxo de conclusão do
> §8.3.

**Seção:** PRD §8.7 — Evento avulso  
**Ação:** acrescentar ao fim:

> Eventos futuros não concluídos podem receber revisões de planejamento
> auditáveis. A revisão vigente é a mais recente; cancelar preserva o evento e
> sua auditoria. Conclusão e correção continuam referenciando o planejamento
> vigente no momento da ação.

**Motivo:** §7.2 já promete edição em Amanhã, mas sem uma regra explícita a
implementação poderia apagar histórico, editar uma conclusão ou alterar a
Ocorrência localmente sem nova leitura autoritativa.

### Fora das emendas

Bottom sheet, tokens, marca, tipografia, hierarquia, foco, safe areas, estados
offline e padrões de Configurações são contrato de apresentação e acessibilidade
para implementação. Não alteram a lei de domínio do PRD e não exigem novas
seções de comportamento.

## 10. Fora do escopo

- Implementar o redesign neste ticket;
- migrar componentes, escrever plano de commits ou alterar backend sem uma
  tarefa de implementação derivada deste contrato;
- protótipos desktop;
- novas superfícies primárias, calendários, dashboards, busca, filtros,
  gamificação ou itens do PRD §23;
- novas ilustrações além da arte de Login preservada;
- multi-tenancy, permissões diferentes entre Adultos ou contas de Criança;
- aconselhamento médico, interpretação de atraso ou compensação de dose.
