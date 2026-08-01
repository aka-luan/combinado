# Contexto do domínio — Combinado

Este glossário registra os termos e limites que devem permanecer estáveis no
produto, nos testes e nas decisões de design.

## Termos

- **Casa:** a única unidade familiar do Combinado. Há exatamente dois Adultos
  autenticados com permissões iguais.
- **Adulto:** uma das duas pessoas autorizadas a consultar e operar o Registro
  da Casa. Não existe papel de administrador na interface.
- **Criança:** pessoa vinculada à Casa, sem conta própria, que pode ser alvo de
  uma Ocorrência.
- **Ocorrência:** compromisso exibido em Hoje ou Amanhã, derivado de uma Rotina
  semanal, Evento avulso ou Dose.
- **Rotina semanal:** compromisso recorrente apenas por dias da semana, com uma
  versão vigente e possíveis exceções por data.
- **Evento avulso:** compromisso de uma data específica, sem recorrência.
- **Dose:** ocorrência de um slot programado de Medicamento para uma Criança.
  O Combinado registra o que foi programado e quem registrou a administração;
  não interpreta prescrição nem orienta conduta médica.
- **Confirmável:** Ocorrência que pode ser concluída ou confirmada no app e
  produz um Registro de execução. Inclui Rotina semanal, Evento avulso e Dose,
  respeitando as regras específicas da Dose.
- **Informativa:** Ocorrência compartilhada para leitura, sem Responsável e sem
  ação de conclusão.
- **Responsável:** no máximo um Adulto planejado para uma Ocorrência
  confirmável. Responsabilidade planejada não impede o outro Adulto de executar.
- **Executor:** Adulto que efetivamente concluiu ou confirmou uma Ocorrência,
  com o horário real registrado separadamente do Responsável.
- **Registro:** conjunto compartilhado de fatos persistidos da Casa, incluindo
  conclusões, confirmações, reversões, cancelamentos e autoria. O Registro
  supera notificações.
- **Revisão de planejamento:** nova versão auditável do planejamento futuro de
  um Evento avulso ainda não concluído. Ela substitui o planejamento vigente,
  não apaga a revisão anterior e não reescreve uma conclusão já registrada.
- **Hoje:** superfície primária que responde pelo dia local da Casa.
- **Amanhã:** continuação inline de Hoje, revelada depois das 19h e limitada ao
  dia seguinte.
- **Sem Responsável:** condição explícita de uma Ocorrência confirmável sem
  Adulto planejado; é um alerta e nunca depende apenas de cor.
