# Restrições de exibição do Web Push no iPhone

Pesquisa para o ticket **“Determinar as restrições reais de exibição do Web Push no iPhone”**, consultada em 1º de agosto de 2026.

## Resposta curta

As fontes primárias não publicam um limite estável de caracteres, pixels ou linhas para título e corpo de Web Push no iPhone, nem garantem que a Tela Bloqueada e a Central de Notificações exibam a mesma quantidade de texto sem expansão. A Apple orienta usar título curto e conteúdo sucinto e afirma que o sistema trunca a mensagem quando necessário. A única indicação quantitativa encontrada é de **duas a quatro linhas do corpo** na apresentação abreviada de uma notificação iOS; ela não é um contrato específico de Web Push, de Tela Bloqueada ou de Central de Notificações.

Consequentemente, a copy do Combinado não deve adotar um orçamento fixo de caracteres. Deve preservar a informação principal pela ordem: **criança, medicamento e horário programado primeiro; instrução registrada, quando houver, por último**. A instrução continua verbatim e pode ser truncada pelo sistema. A legibilidade sem expansão precisa ser verificada nos dois iPhones reais da Casa e registrada como evidência daqueles aparelhos e versões do iOS, não como garantia geral.

## O que está documentado

### Web Push usa a apresentação normal de notificações do iPhone

O WebKit documenta que, desde iOS e iPadOS 16.4, Web Push está disponível para web apps adicionados à Tela de Início. Essas notificações “funcionam exatamente como” notificações de outros apps e aparecem na Tela Bloqueada e na Central de Notificações. Portanto, a apresentação não é uma superfície própria controlada pelo PWA; é a interface de notificações do sistema.

Fonte: [WebKit — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

### O sistema decide quando truncar

As diretrizes de interface da Apple dizem que o título ocupa a área mais proeminente e deve ser curto, útil e legível de relance. Para o conteúdo, orientam texto sucinto e dizem para o autor não truncar manualmente a mensagem, porque o próprio sistema a trunca quando necessário. A documentação da propriedade `title` também recomenda títulos curtos, normalmente de poucas palavras.

Essas fontes não fornecem número máximo de caracteres, largura ou corte reproduzível.

Fontes:

- [Apple HIG — Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications)
- [Apple Developer — `UNNotificationContent.title`](https://developer.apple.com/documentation/usernotifications/unnotificationcontent/title)

### A apresentação inicial é abreviada

A documentação da Apple sobre a interface de notificações informa que a apresentação abreviada mostra título, subtítulo e **duas a quatro linhas do corpo**; ao pressioná-la, a pessoa vê a interface completa.

Há duas ressalvas importantes:

1. o documento descreve a interface geral do iOS no contexto de extensões de conteúdo de apps nativos, não um limite específico de Web Push;
2. ele não promete que “duas a quatro linhas” seja a capacidade fixa da Tela Bloqueada ou da Central de Notificações em toda combinação de aparelho, versão, tamanho de texto e estado de agrupamento.

Assim, o intervalo é evidência direcional de pouco espaço inicial, não um critério de aceitação quantitativo para o Combinado.

Fonte: [Apple Developer — Customizing the Appearance of Notifications](https://developer.apple.com/documentation/usernotificationsui/customizing-the-appearance-of-notifications).

### A configuração da pessoa muda o que fica visível

Na Tela Bloqueada, a pessoa pode escolher visualização por contagem, pilha ou lista. Também pode configurar as prévias como **Sempre**, **Quando Desbloqueado** ou **Nunca**. Notificações podem ser agrupadas por app tanto na Tela Bloqueada quanto na Central de Notificações, e tocar ou manter pressionado muda o estado de apresentação.

Isso significa que “sem expansão” não é uma única superfície estável. Com prévias ocultas ou a Tela Bloqueada em modo de contagem, a copy detalhada pode não aparecer; nenhuma redação resolve essa escolha do sistema. Também não há, nessas fontes, garantia de que uma notificação recolhida na Central de Notificações mostre mais texto que na Tela Bloqueada.

Fontes:

- [Apple Support — Change notification settings on iPhone](https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios)
- [Apple Support — View and respond to notifications on iPhone](https://support.apple.com/guide/iphone/view-and-respond-to-notifications-iph6534c01bc/ios)

## O que não está documentado

Não foi encontrado, nas fontes primárias consultadas:

- limite de caracteres ou pixels para título ou corpo de Web Push no iPhone;
- ponto exato e estável de truncamento;
- quantidade garantida de linhas sem expansão na Tela Bloqueada;
- quantidade garantida de linhas sem expansão na Central de Notificações;
- relação garantida segundo a qual uma dessas superfícies sempre exibe mais conteúdo que a outra.

Portanto, não é válido converter as duas a quatro linhas da apresentação abreviada em um número de caracteres. O corte depende da composição realizada pelo sistema; qualquer número obtido por captura de tela é observação daquela configuração.

## Prioridades para a especificação de copy

As prioridades abaixo são **inferências de produto**, derivadas das restrições documentadas e das leis do PRD; não são regras publicadas pela Apple.

1. **Título curto e orientador.** Reservar o título para a razão imediata da notificação, sem repetir “Combinado”, pois o sistema já identifica o app. A escolha da frase final pertence ao ticket de copy.
2. **Informação indispensável primeiro.** No corpo de dose, colocar criança, medicamento e horário programado antes de qualquer informação opcional. Esses três elementos precisam sobreviver ao corte com maior probabilidade.
3. **Instrução registrada por último e verbatim.** Quando houver, identificar que é texto registrado, sem interpretar nem oferecer orientação médica. Não abreviar, resumir ou reescrever para caber; permitir que o sistema trunque.
4. **Nada essencial somente no fim ou após expansão.** A notificação não pode depender do final da instrução, de som, de ícone ou de interação expandida para deixar claro que o Adulto deve verificar o Registro.
5. **Sem afirmação de estado atual.** A copy não afirma que a dose continua pendente; o Registro compartilhado é a fonte de verdade.
6. **Resumo das 22h compacto por construção.** Manter apenas as contagens previstas no PRD, com itens sem Responsável visíveis na mesma frase; não adicionar nomes ou detalhes.

Uma estrutura para testar — não a decisão final de copy — é:

```text
Título curto
Criança · Medicamento · HH:MM. Instrução registrada: <texto verbatim>
```

## Critério de validação em aparelho real

“Legível sem expansão” deve significar que **criança, medicamento e horário** permanecem identificáveis na apresentação recolhida com prévias habilitadas. Não deve significar que toda instrução longa precisa caber.

Validar pelo menos nos dois iPhones da Casa, com a versão de iOS usada em produção:

- Tela Bloqueada em lista e em pilha;
- Central de Notificações, com notificação isolada e agrupada;
- tamanho de texto padrão e um tamanho maior usado pelos Adultos;
- nomes realistas longos de criança e medicamento;
- sem instrução, com instrução curta e com instrução longa.

Registrar aparelho, versão do iOS, tamanho de texto, modo de apresentação e capturas. Se um caso falhar, mudar a ordem ou a construção da copy; não instituir um “limite do iPhone” com base no corte observado. Prévia oculta e visualização por contagem devem ser documentadas como escolhas do sistema fora do alcance da copy.
