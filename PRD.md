# PRD — Combinado

**Status:** v2 aprovada para decomposição

**Owner:** Luan

**Usuários:** dois adultos responsáveis por uma única casa

**Plataforma principal:** PWA instalada em iPhone

**Última atualização:** 23/07/2026

---

## 1. Visão

O Combinado é um aplicativo privado de coordenação familiar para uma única casa.

Ele existe para eliminar duas falhas:

1. **Ambiguidade de responsabilidade:** “Achei que você ia buscar.”
2. **Incerteza sobre medicação:** “Você já deu o remédio?”

As duas dores são obrigatórias. O produto não está validado se resolver apenas uma.

O aplicativo registra tanto:

- quem deveria executar um compromisso;
- quem efetivamente o executou e quando;
- qual dose estava programada;
- quem registrou sua administração e quando.

O Combinado é uma ferramenta doméstica de coordenação e registro. Ele não recomenda dosagem, não interpreta atrasos, não orienta compensação e não substitui prescrição ou aconselhamento médico.

---

## 2. Critério de sucesso

Depois da versão completa e de uma semana de estabilização, inicia-se uma janela de 30 dias consecutivos.

O produto é bem-sucedido quando os dois adultos confirmam que, durante essa janela:

- não houve dose duplicada ou esquecida por falha de coordenação;
- não houve compromisso perdido por ambiguidade de responsável;
- ambos consultaram e registraram diretamente no aplicativo, sem depender do outro adulto para operá-lo.

As frases originais deixarem de ocorrer é evidência auxiliar. Métricas de engajamento, retenção e tempo de uso não são critérios de sucesso.

Se uma falha central ocorrer:

1. registrar o incidente;
2. classificá-lo como regra, UX, adoção ou infraestrutura;
3. corrigir a causa;
4. reiniciar a janela apenas quando o incidente comprometer o critério de sucesso.

Se a validação falhar, o escopo não será ampliado automaticamente. A decisão será corrigir o mecanismo central ou encerrar o projeto.

---

## 3. Usuários e limites do produto

- Existe exatamente uma casa.
- Existem exatamente dois adultos autenticados.
- Crianças não possuem conta.
- Avós, babás, terceiros e outras casas não fazem parte do v1.
- Os dois adultos têm permissões idênticas.
- Não existe administrador na interface.
- Não existe cadastro público.
- Não existe seleção de família ou multi-tenancy visível.
- Internamente existe um único `household` para compartilhamento e RLS.
- Não há limite artificial de crianças, mas a interface deve ser testada com até cinco ativas.

Cada adulto possui:

- nome de exibição;
- e-mail autorizado;
- estado ativo ou arquivado.

Cada criança possui:

- nome;
- estado ativo ou arquivado.

Nomes não precisam ser únicos. Espaços externos são normalizados e valores vazios são rejeitados.

O alvo compartilhado que não é uma criança chama-se **Casa** e é uma opção fixa.

---

## 4. Princípios

Estes princípios precedem novas funcionalidades:

| Princípio | Implicação |
| --- | --- |
| Uma superfície responde a rotina | Hoje é a única navegação primária; Amanhã aparece inline depois das 19h |
| Leitura instantânea, escrita rara | Estado compartilhado aparece antes de controles de edição |
| Ausência de dono é o alerta central | Somente ocorrência confirmável sem responsável usa cor de alerta |
| Registro supera lembrete | Push pode falhar sem tornar o estado compartilhado incorreto |
| Visibilidade compartilhada não é responsabilidade coletiva | Ambos veem; cada compromisso tem no máximo um dono |
| Segurança supera falsa certeza | Estado desatualizado é explícito; ações inseguras são bloqueadas |
| O app não pergunta o que já sabe | Valores registrados não exigem reconfirmação |
| Escopo cresce somente por bloqueio comprovado | Uma entrada nova deve substituir escopo equivalente |

O alerta “sem responsável” usa cor, ícone e texto; nunca depende somente de cor.

---

## 5. Modelo de domínio

### 5.1 Ocorrência

Tudo exibido em Hoje ou Amanhã é uma **Ocorrência**.

Uma ocorrência é derivada de:

- versão vigente de rotina semanal;
- evento avulso;
- slot de medicamento.

Ocorrências não são materializadas como tabela de agenda. São calculadas no servidor durante a leitura.

Cada ocorrência possui chave determinística:

- tipo de fonte;
- identificador lógico da fonte;
- data local;
- slot, quando aplicável.

Exemplos:

- `rotina + data`;
- `evento_avulso`;
- `medicamento + data + slot_de_horário`.

Conclusões, reversões, exceções e confirmações são persistidas e referenciam essa chave.

### 5.2 Precedência

O estado efetivo é calculado nesta ordem:

1. versão vigente da rotina ou medicamento;
2. validade, término ou arquivamento;
3. exceção da data;
4. conclusão, confirmação ou reversão.

Eventos avulsos entram diretamente antes da etapa de conclusão.

### 5.3 Versionamento

Rotinas e medicamentos são versionados por vigência. Uma edição cria nova versão com `effective_from`; não sobrescreve a configuração histórica.

Por padrão:

- edição ou arquivamento vale a partir de amanhã;
- uma mudança de Hoje usa exceção;
- interrupção explícita de medicamento pode valer imediatamente.

Conclusões guardam snapshot do planejado:

- título;
- criança ou Casa;
- horário;
- responsável planejado.

---

## 6. Tempo

- O fuso da casa é fixo em `America/Sao_Paulo`.
- Viagens e o fuso do aparelho não alteram a agenda.
- Datas usam o fuso da casa.
- Horários são armazenados como texto normalizado `HH:mm`.
- A interface usa 24 horas e localidade `pt-BR`.
- Datas curtas usam `dd/MM`.
- Datas inicial e final são inclusivas.
- O servidor fornece sua hora no snapshot para detectar diferença do relógio do aparelho.
- O agendador executa em UTC e converte regras para o fuso da casa.

---

## 7. Tela principal

### 7.1 Hoje

Hoje é a única navegação primária.

Ordem:

1. doses ainda não confirmadas;
2. compromissos atrasados;
3. compromissos futuros com horário;
4. compromissos sem horário;
5. ocorrências concluídas.

O grupo de doses fica no início, mas não permanece preso durante rolagem.

Empates são resolvidos de forma estável:

- doses: horário, criança, medicamento, identificador;
- demais ocorrências: horário, título, identificador;
- cadastros sem horário: nome, identificador.

Cada item apresenta:

- horário programado, quando existir;
- título;
- criança ou Casa;
- responsável efetivo, quando aplicável;
- status;
- indicador discreto quando o responsável é uma exceção.

Itens concluídos:

- permanecem abertos e visíveis;
- usam opacidade reduzida e texto riscado;
- mostram executor e horário real;
- são ordenados pelo horário programado.

Títulos aparecem em até duas linhas; detalhes mostram o conteúdo completo. O limite é 120 caracteres.

Com 100 ocorrências no mesmo dia a tela deve continuar funcional, sem paginação ou virtualização no v1.

### 7.2 Amanhã

Antes das 19h, o rodapé mostra apenas a contagem de amanhã.

A partir das 19h:

- surge uma seção inline **Amanhã** abaixo de Hoje;
- não existe aba, calendário ou segunda tela;
- a seção permanece até a meia-noite;
- a seção mostra doses, compromissos, itens sem horário e cancelamentos;
- responsáveis ausentes aparecem em alerta;
- cancelamentos aparecem riscados e não entram na contagem.

Ações permitidas em Amanhã:

- cancelar ocorrência de rotina;
- remarcar dentro da mesma data;
- trocar ou remover responsável;
- editar ou cancelar evento avulso.

Editar um Evento avulso futuro e não concluído abre o formulário focado e pode
alterar título, data, alvo, horário, requer confirmação e Responsável,
respeitando as regras de data do §8.7. A edição torna-se uma nova revisão
auditável do planejamento; a revisão anterior não é apagada. Se a nova data
for Hoje, a Ocorrência aparece em Hoje após o snapshot seguinte. Um Evento já
concluído não é editado diretamente; sua correção usa o fluxo de conclusão do
§8.3.

Não é permitido:

- concluir compromisso amanhã;
- confirmar dose do dia seguinte;
- criar exceção de rotina para depois de amanhã.

Eventos avulsos podem ser cadastrados para qualquer data futura.

À meia-noite, Amanhã passa a ser Hoje por nova leitura do servidor.

### 7.3 Estados vazios

- Hoje vazio: “Nada combinado para hoje”.
- Amanhã vazio depois das 19h: “Nada combinado para amanhã”.
- O estado vazio não usa ilustração, gamificação ou pressão para cadastrar dados.

---

## 8. Agenda

### 8.1 Tipos

Rotinas e eventos avulsos declaram `requer confirmação`.

Quando `requer confirmação = false`:

- a ocorrência é informativa;
- não possui responsável;
- não pode ser concluída;
- não fica atrasada;
- permanece visível até terminar o dia.

Quando `requer confirmação = true`:

- possui no máximo um responsável;
- pode ser salva explicitamente sem responsável;
- pode ser concluída por qualquer adulto;
- registra planejado e executado separadamente.

Visibilidade é sempre compartilhada. Não existe “ambos responsáveis”.

### 8.2 Responsabilidade

Estados:

- responsável padrão;
- responsável alterado para a ocorrência;
- sem responsável.

Apenas `sem responsável` em ocorrência confirmável usa alerta.

Troca de responsável:

- é imediata;
- não exige aceite;
- aparece por Realtime;
- não gera push individual.

Se o adulto não planejado concluir:

- a atribuição original permanece;
- o executor real é registrado separadamente.

### 8.3 Conclusão

Toda Ocorrência confirmável — incluindo Dose, Evento avulso e Rotina semanal —
pode ser concluída na data da Ocorrência por qualquer Adulto. A conclusão
registra o Responsável planejado, quando houver, e o Adulto executor com o
horário real.

- Um check dedicado conclui com um toque.
- Tocar no restante da linha abre detalhes e ações.
- É permitido concluir antes do horário, desde que seja a data da ocorrência.
- A interface mostra `registrando…` imediatamente.
- O item só fica confirmado após resposta do banco.
- Falha restaura o estado anterior e oferece tentar novamente.
- Existe desfazer por 10 segundos.
- Depois disso, `corrigir registro` permanece disponível até o fim do dia, com confirmação adicional.
- Reversões preservam auditoria.
- Uma constraint permite apenas uma conclusão ativa por ocorrência.
- Em concorrência, o segundo adulto vê quem concluiu e quando.

Depois de concluída, a ocorrência não pode ser editada diretamente. É necessário corrigir a conclusão antes.

### 8.4 Status

Ocorrência confirmável:

- `programado`;
- `atrasado`;
- `concluído`;
- `cancelado`.

`sem responsável` é condição adicional.

Uma ocorrência com horário fica atrasada no primeiro minuto após o horário. Sem horário, permanece programada até conclusão ou fim do dia.

Ocorrência informativa:

- `programada`;
- `cancelada`.

### 8.5 Rotina semanal

Campos:

- título;
- criança ou Casa;
- conjunto de dias da semana;
- horário;
- requer confirmação;
- responsável padrão opcional;
- data inicial;
- data final opcional.

Regras:

- repetição apenas semanal;
- sem quinzenal, mensal ou “a cada N semanas”;
- sem ajuste automático por feriados;
- criação com início hoje gera a ocorrência de hoje, mesmo se já atrasada;
- edição vale amanhã;
- rotina informativa não pode ter responsável.

### 8.6 Exceção

Existe uma exceção efetiva por `rotina + data local`.

Ela pode combinar:

- cancelamento;
- novo horário;
- novo responsável, inclusive ausência de responsável.

Cada edição grava um evento com o estado completo. A versão mais recente é efetiva.

`Restaurar rotina` grava nova versão de exceção e volta ao padrão.

Remarcação:

- permanece na mesma data;
- para outro dia, cancelar a original e criar evento avulso.

Fluxo rápido:

1. tocar ocorrência;
2. escolher cancelar, remarcar ou trocar responsável;
3. confirmar.

Alterações combinadas usam `editar detalhes`.

### 8.7 Evento avulso

Campos:

- data;
- título;
- criança ou Casa;
- requer confirmação;
- horário opcional;
- responsável opcional.

Defaults:

- data = hoje;
- requer confirmação = ligado;
- responsável = criador.

O usuário pode escolher explicitamente o outro adulto ou deixar sem responsável.

Eventos:

- não podem ser retroativos;
- podem ser criados para qualquer data futura;
- não possuem duração, horário final, local, notas ou anexos;
- são cancelados com auditoria, nunca apagados fisicamente.

Eventos futuros não concluídos podem receber revisões de planejamento
auditáveis. A revisão vigente é a mais recente; cancelar preserva o evento e
sua auditoria. Conclusão e correção continuam referenciando o planejamento
vigente no momento da ação.

---

## 9. Medicação

### 9.1 Limite

Somente doses programadas fazem parte do v1.

Ficam excluídos:

- medicamento “se necessário”;
- administração sem dose programada;
- orientação clínica;
- compensação de dose;
- pausa temporária como conceito próprio.

### 9.2 Cadastro

Cada medicamento pertence a exatamente uma criança.

Campos:

- nome;
- criança;
- instrução textual opcional conforme prescrição;
- data inicial obrigatória;
- data final inclusiva opcional;
- lista de slots com `HH:mm`.

Uso contínuo significa ausência de data final.

Regras:

- slots iguais não podem repetir no mesmo medicamento;
- horários iguais entre medicamentos diferentes são permitidos;
- medicamentos de mesmo nome para a mesma criança são permitidos;
- um tratamento interrompido e retomado vira um novo tratamento.

No dia inicial:

- são geradas somente doses posteriores ao momento do cadastro;
- horários já passados não aparecem retroativamente.

### 9.3 Dose

Identidade:

- medicamento;
- data local programada;
- identificador do slot.

O horário programado e o horário real são dados distintos.

Estados:

- `programada`;
- `pendente`;
- `atrasada`;
- `confirmada`;
- `cancelada por alteração`;
- `sem registro`.

Antes do horário, a dose é programada. No horário, torna-se pendente. No primeiro minuto posterior, torna-se atrasada. Essa comparação não oferece orientação médica.

Uma dose:

- pode ser confirmada por qualquer adulto;
- é confirmada com um toque dentro do aplicativo;
- aguarda resposta do banco antes de aparecer confirmada;
- registra adulto e horário real;
- sincroniza por Realtime;
- oferece desfazer por 10 segundos;
- permite correção deliberada até o fim do dia.

Confirmação antecipada é permitida no mesmo dia. Se ocorrer mais de 30 minutos antes, exige confirmação adicional neutra.

Depois da meia-noite:

- dose não confirmada vira `sem registro`;
- não migra para o novo dia;
- não pode ser preenchida retroativamente no v1.

Ausência de registro não afirma que a dose não foi administrada.

### 9.4 Concorrência e auditoria

Uma constraint no banco garante uma única confirmação ativa por dose.

Em conflito, o segundo adulto vê:

- quem confirmou;
- horário real.

Desfazer não apaga. Registra reversão com:

- autor da confirmação;
- momento da confirmação;
- autor da reversão;
- momento da reversão.

Depois de reversão, uma nova confirmação é permitida.

### 9.5 Alteração imediata

Edições comuns valem amanhã.

Encerrar ou arquivar um tratamento pode valer imediatamente mediante confirmação explícita:

- cancela doses restantes daquele dia;
- cancela notificações ainda não enviadas;
- mostra `cancelada por alteração`;
- preserva auditoria.

---

## 10. Notificações

Push é auxílio. O estado compartilhado é a fonte de verdade.

### 10.1 Dose

- Enviar aos dois adultos.
- Enviar a todas as instalações ativas de cada adulto.
- Uma tentativa por dose e instalação.
- Enviar no horário programado somente se ainda não confirmada.
- TTL de 30 minutos.
- Sem lembretes repetidos.
- Sem ação personalizada de confirmação na notificação.

Conteúdo:

> Hora de verificar — [criança], [medicamento], [horário], [instrução].

O conteúdo completo pode aparecer na tela bloqueada por decisão consciente de privacidade.

A mensagem não afirma que a dose continua pendente.

Ao tocar:

- abrir a ocorrência exata no app;
- se pendente, permitir confirmar com um toque;
- se já confirmada, destacar quem registrou e quando;
- nunca oferecer segunda confirmação.

### 10.2 Resumo

- Horário: 22h no fuso da casa.
- Destinatários: os dois adultos, em todas as instalações ativas.
- Enviar somente quando amanhã tiver ocorrência.
- Conteúdo do push: contagem de compromissos, doses e itens sem responsável.
- Sem nomes ou detalhes no resumo bloqueado.
- Tocar abre Hoje e rola para Amanhã.
- Alterações posteriores não geram um segundo resumo.

### 10.3 Alterações comuns

Cancelamento, horário e responsável:

- atualizam por Realtime;
- não geram push individual.

### 10.4 Permissão e Focus

- Solicitar permissão somente após detectar instalação como PWA e após gesto explícito.
- Explicar opcionalmente como permitir o app nos Modos Foco relevantes.
- Focus sem allowlist pode silenciar notificações e não é falha.
- Web Push não oferece nível Time Sensitive.
- Negar ou revogar push não bloqueia o aplicativo.

Configurações mostram:

- notificações ativas;
- permissão necessária;
- reinstalação necessária.

Ao abrir:

- verificar permissão;
- recuperar subscription existente;
- criar outra se permitido e ausente;
- fazer upsert por instalação;
- remover endpoints após 404/410.

Não há garantia de recuperação se permissão foi revogada ou o PWA removido.

### 10.5 Entrega

Uma outbox registra:

- tipo;
- ocorrência;
- usuário;
- instalação;
- validade;
- tentativas;
- próxima tentativa;
- resultado.

Chave única evita duplicação lógica. O sistema garante tentativa idempotente, não exibição exatamente uma vez.

Logs de push permanecem 30 dias e não contêm criança, medicamento ou instrução.

---

## 11. Autenticação

Fluxo principal:

- conta Gmail dedicada usada como SMTP customizado do Supabase;
- 2FA habilitado no Gmail;
- App Password armazenada nos segredos do Supabase;
- OTP de seis dígitos enviado por e-mail;
- código digitado dentro do PWA;
- validade de 10 minutos;
- reenvio após 60 segundos;
- no máximo cinco tentativas por código;
- limites nativos por endereço e IP.

As duas contas são provisionadas previamente. OTP usa `shouldCreateUser: false`.

Não existe:

- cadastro público;
- Magic Link no v1;
- CAPTCHA inicial;
- expiração por inatividade comum.

A sessão:

- persiste e renova automaticamente;
- termina por logout, revogação ou perda dos dados do PWA.

Fallback:

- não existe senha permanente dormente;
- se Gmail falhar, operação administrativa define senha temporária;
- o adulto troca a senha ou retorna ao OTP depois da recuperação.

Logout fica nas configurações e exige confirmação.

Troca de adulto é administrativa:

1. revogar associação antiga;
2. criar conta autorizada;
3. preservar autoria histórica.

---

## 12. Onboarding e configurações

### 12.1 Primeiro adulto

Sem dados, Hoje mostra `Configurar casa`.

Fluxo mínimo:

1. cadastrar uma Criança;
2. escolher e cadastrar uma Rotina semanal ou um Medicamento;
3. retornar ao Hoje pelo CTA `Criar combinado e abrir o Hoje`.

O gate só libera o Hoje depois de existir uma Criança ativa e pelo menos uma
Rotina ou um Medicamento ativo. Não é necessário cadastrar os dois.

Não existe tutorial em carrossel.

### 12.2 Segundo adulto

1. instalar PWA;
2. autenticar por OTP;
3. abrir diretamente Hoje compartilhado;
4. ativar notificações contextualmente.

Não há convite ou aceite adicional.

### 12.3 Configurações

Um botão discreto em Hoje abre área secundária com:

- adultos;
- crianças;
- rotinas;
- medicamentos;
- próximos eventos;
- estado da instalação de push;
- estado de backup;
- logout;
- aviso de privacidade.

Listas:

- separam ativos e arquivados;
- não possuem busca ou filtros no v1.

Cadastros referenciados não são apagados. São arquivados.

Não é permitido arquivar criança com rotina ou medicamento ativo; as dependências devem ser tratadas primeiro.

Reativação vale amanhã e não recria ocorrências anteriores.

---

## 13. Leitura, Realtime e concorrência

O servidor/banco expõe uma única função que retorna snapshot consistente de:

- Hoje;
- Amanhã;
- hora do servidor;
- identificador de versão ou hash.

O cliente não reimplementa cálculo de ocorrência.

Realtime:

- apenas invalida o snapshot;
- dispara leitura completa;
- não reconstrói estado localmente.

Também atualizar:

- ao voltar ao primeiro plano;
- ao reconectar;
- a cada cinco minutos enquanto aberto;
- à meia-noite.

Edições simultâneas:

- usam controle de versão;
- não adotam “último a salvar vence” silencioso;
- preservam entrada local;
- informam que outra alteração chegou;
- permitem revisar depois de recarregar.

---

## 14. Offline

O aplicativo é leitura somente offline.

Armazenar em IndexedDB:

- snapshot de Hoje;
- snapshot de Amanhã;
- data e horário da última sincronização;
- identificador do usuário.

O Service Worker armazena apenas o app shell e arquivos estáticos versionados.

Regras:

- todas as ações ficam desabilitadas offline;
- dados exibem estado offline e última sincronização;
- Amanhã pode ser revelado às 19h a partir do snapshot já armazenado;
- se o dia virar offline, não renomear cache antigo como Hoje;
- mostrar `Dados de DD/MM — offline`;
- sem snapshot, mostrar dados indisponíveis;
- nunca recalcular ocorrências a partir de cadastros locais.

Ao reconectar, buscar snapshot novo antes de reabilitar ações.

Logout remove:

- sessão;
- snapshots;
- subscriptions locais;
- formulários em memória;
- caches identificados do usuário.

O app shell público pode permanecer.

Primeira instalação exige conexão para login e sincronização.

---

## 15. Arquitetura

| Camada | Escolha |
| --- | --- |
| Frontend | Next.js gerado como aplicação estática |
| Hospedagem | Cloudflare Pages Free em hostname `*.pages.dev` estável |
| PWA | Manifest + Service Worker |
| Banco | Supabase Postgres Free |
| Auth | Supabase Auth com OTP via Gmail SMTP |
| Autorização | RLS por `household_id` e membership |
| Realtime | Supabase Realtime |
| Leitura | função/RPC de snapshot |
| Scheduler | Supabase Cron/pg_cron a cada minuto |
| Trabalho privilegiado | Supabase Edge Functions |
| Push | Web Push + VAPID |
| Backup | GitHub Actions + dump cifrado com `age` |

O frontend recebe somente credenciais públicas do Supabase.

Segredos:

- VAPID e Gmail App Password ficam no Supabase;
- senha do banco fica em GitHub Actions;
- chave pública de backup fica na automação;
- chave privada de backup permanece offline em duas cópias controladas.

O endereço do app é público, mas Auth e RLS impedem leitura de dados.

### 15.1 RLS

- Cada linha compartilhada possui `household_id`.
- Membership liga os dois usuários ao household singleton.
- Policies usam `auth.uid()` e membership.
- Nenhuma autorização depende de `user_metadata`.
- Tabelas expostas possuem RLS.
- Usuário não autenticado não lê dados.
- Os dois adultos possuem acesso equivalente.

### 15.2 Operação gratuita

Todos os serviços ficam em planos gratuitos e sem cartão:

- Supabase Free;
- Cloudflare Pages Free;
- GitHub Actions Free;
- Gmail SMTP.

Contrato operacional:

- best effort;
- sem SLA;
- projeto Supabase pode pausar;
- jobs gratuitos podem atrasar;
- Gmail/App Password pode falhar;
- limites interrompem serviço em vez de gerar cobrança.

Migração para plano pago ocorre somente após falha real numa dor central ou aproximação consistente de cota.

---

## 16. Backup e recuperação

GitHub Actions executa diariamente:

1. dump de roles, schema e dados;
2. compactação;
3. criptografia com `age`;
4. upload do artefato cifrado;
5. retenção de sete dias.

Requisitos:

- nenhum dado em claro no artefato;
- nenhum segredo em logs;
- alerta quando o último backup bem-sucedido ultrapassar 26 horas;
- teste de restauração antes do uso real;
- operação reconhecida como best effort.

Pedido de exclusão total é administrativo e remove:

- household;
- dados;
- sessões;
- subscriptions;
- acesso dos usuários;
- backups conforme expiram pela política.

---

## 17. Privacidade e segurança

Premissas:

- iPhones pessoais protegidos por código ou biometria;
- sem PIN adicional no app;
- conteúdo completo de dose pode aparecer na lock screen;
- dados familiares ficam no cache offline do aparelho;
- proteção do dispositivo é considerada suficiente no v1.

Não existem analytics comportamentais.

Telemetria operacional pode registrar:

- erros;
- latência;
- cron;
- outbox;
- Realtime;
- push;
- backup.

Telemetria não registra:

- nomes;
- títulos;
- crianças;
- medicamentos;
- instruções.

Configurações exibem aviso curto sobre:

- dados armazenados;
- cache offline;
- push;
- exclusão administrativa.

Auditoria completa não é navegável. É acessível apenas em operação administrativa excepcional.

Segredos não têm rotação periódica fixa; são rotacionados após suspeita, vazamento, troca de operador ou exigência do provedor.

---

## 18. Acessibilidade e experiência

- Tema claro/escuro segue o sistema.
- Dynamic Type e zoom são suportados.
- Áreas de toque têm pelo menos 44×44 pontos.
- Contraste é adequado.
- Controles possuem rótulos para leitor de tela.
- Fluxos permanecem navegáveis por teclado.
- Erros aparecem junto ao campo.
- Modal genérico não substitui erro específico.
- Somente campos estruturalmente obrigatórios bloqueiam salvamento.
- Atualização do PWA é baixada em segundo plano.
- Nova versão é oferecida quando não houver ação em andamento.
- O app nunca recarrega durante confirmação ou edição.

---

## 19. Performance

Metas no percentil 95, em iPhone suportado, serviço ativo e conexão doméstica ou 4G normal:

| Medida | Meta |
| --- | --- |
| Feedback visual de toque | < 100 ms |
| Snapshot recebido até render | < 300 ms |
| Persistência de ação | < 1 s |
| Realtime entre aparelhos | < 1 s |
| Abertura completa | < 2 s |

Pausa ou indisponibilidade de plano gratuito fica fora das metas e aparece explicitamente.

---

## 20. Milestones

### M0 — Spikes de risco

- Publicar PWA estática no Cloudflare Pages.
- Instalar nos dois iPhones.
- Validar OTP via Gmail SMTP dentro do standalone.
- Validar persistência de sessão.
- Validar Web Push.
- Validar Supabase Cron e Edge Function no plano gratuito.

Matriz de push:

- app fechado em Wi‑Fi;
- app fechado em rede móvel;
- Focus desligado;
- Focus ligado com PWA permitido;
- Focus ligado sem allowlist como limitação esperada.

Falha de push remove notificações do v1, mas não encerra o projeto.

### M1 — Fundação

- schema;
- household singleton;
- dois adultos;
- crianças;
- Auth;
- RLS;
- versionamento;
- auditoria;
- bootstrap idempotente.

### M2 — Setup mínimo e leitura de Hoje e Amanhã

Ordem de implementação: o cadastro mínimo na PWA (criança existente em configurações + criação de rotina semanal create-only, campos §8.5) precede a demonstração de Hoje/Amanhã. Semente SQL fica restrita a testes automatizados — não é o caminho de demo enquanto se implementa.

- setup mínimo via `Configurar casa` (criança + rotina semanal);
- snapshot do servidor;
- ordenação;
- estados;
- alerta sem responsável;
- Amanhã a partir das 19h.

### M3 — Medicação

- cadastro;
- cálculo;
- confirmação;
- desfazer;
- correção;
- interrupção imediata;
- proteção contra dose dupla.

### M4 — Sincronização e resiliência

- Realtime;
- cache offline;
- reconexão;
- virada do dia;
- concorrência;
- falhas explícitas.

### M5 — Escrita de agenda

- eventos avulsos;
- conclusão;
- correção;
- edição/versionamento de rotinas e exceções (a primeira criação de rotina já ocorreu no setup mínimo de M2);
- troca de responsável;
- fluxo rápido em até três toques.

### M6 — Cadastros e onboarding

- adultos;
- crianças (além do create já disponível);
- listagem/gestão de rotinas além do create-only de M2;
- medicamentos;
- eventos futuros;
- arquivamento;
- onboarding do segundo adulto;
- configurações completas.

O first-run `Configurar casa` (criança + rotina) foi antecipado para M2; M6 completa o restante da superfície administrativa.

### M7 — Operação

- cron;
- outbox;
- push de dose;
- resumo das 22h;
- limpeza de subscriptions;
- backup;
- telemetria;
- runbook;
- produção.

Cada milestone entrega um fluxo demonstrável e testes correspondentes.

O v1 só está funcionalmente completo após M7.

---

## 21. Critérios de entrada em produção

Bloqueiam produção:

- falha conhecida de RLS;
- possibilidade de dose dupla;
- confirmação visual sem persistência;
- perda silenciosa de ação;
- ausência de cache offline;
- restauração não testada;
- onboarding impossível em um dos dois iPhones.

Falha isolada de push não bloqueia produção quando:

- a limitação é explícita;
- o registro compartilhado funciona.

Testes obrigatórios:

- regras de ocorrência;
- vigência e versionamento;
- constraints;
- RLS;
- dois usuários simultâneos;
- dose e compromisso concorrentes;
- 19h, 22h e meia-noite com relógio controlado;
- início e fim de tratamento;
- offline e reconexão;
- push nos dois iPhones;
- restauração do backup.

Monitoramento mínimo:

- último cron;
- tamanho da outbox;
- falhas de push;
- última sincronização;
- erros de Realtime;
- último backup;
- último teste de restauração.

---

## 22. Runbook administrativo

Deve documentar:

- bootstrap;
- troca de adulto;
- recuperação de acesso;
- reativação do Supabase;
- configuração e recuperação do Gmail SMTP;
- subscriptions e VAPID;
- restauração;
- exclusão total;
- rotação de segredos;
- diagnóstico de cron e push.

Fornecedores não aparecem para o usuário comum. A interface mostra somente estados úteis.

---

## 23. Fora do escopo

- calendário semanal ou mensal;
- visão de datas além de Hoje e Amanhã;
- exceção de rotina depois de amanhã;
- tarefas domésticas;
- lista de compras;
- controle financeiro;
- anexos;
- comentários;
- chat;
- histórico navegável;
- exportação por autosserviço;
- múltiplas famílias;
- perfis infantis;
- avós, babás e terceiros;
- dashboards;
- estatísticas;
- gamificação;
- pontuação;
- ranking;
- localização;
- duração de compromisso;
- recorrência não semanal;
- feriados automáticos;
- medicamentos “se necessário”;
- registro de dose não programada;
- preenchimento retroativo;
- aconselhamento médico;
- confirmação de dose diretamente pela notificação;
- push individual para alteração de agenda;
- escrita offline;
- gerenciamento completo de dispositivos.

---

## 24. Decisões rejeitadas e limitações

### Responsabilidade coletiva

Rejeitada porque “todos responsáveis” reintroduz ambiguidade. Todos veem; um adulto é responsável.

### Confirmação pelo push

Rejeitada porque ações personalizadas não são confiavelmente suportadas pelo Web Push no iPhone e a execução em background não oferece confirmação durável.

### Magic Link

Rejeitado porque links de e-mail podem autenticar o navegador externo em vez do contexto isolado do PWA. OTP permanece dentro do app.

### Domínio próprio

Adiado para preservar custo zero. O app usa `*.pages.dev`; Gmail dedicado entrega OTP.

### Cloudflare Cron

Rejeitado porque Supabase Cron evita um runtime e cofre de segredos adicionais.

### SLA

Não existe no v1 gratuito. A interface expõe indisponibilidade e preserva último snapshot.

### Time Sensitive

Web Push no iPhone não oferece essa prioridade. Focus depende da configuração do usuário.

---

## 25. Governança

Novas ideias ficam fora do backlog ativo durante o v1.

Só entram quando:

1. existe evidência de bloqueio direto de uma das duas dores;
2. a mudança substitui escopo equivalente;
3. o PRD é atualizado antes da implementação.

As exclusões desta versão são vinculantes até o fim da validação.
