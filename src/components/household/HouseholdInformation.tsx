"use client";

/**
 * Privacy copy belongs to the focused Estado da Casa screen. Operational
 * values, including backup freshness, are owned by OpsStatusSettings so the
 * backup status is not presented twice.
 */
export function HouseholdInformation() {
  return (
    <section data-household-information>
      <h3>Aviso de privacidade</h3>
      <p data-privacy-notice>
        O Registro é compartilhado pelos dois Adultos desta Casa. Dados da família
        ficam no cache offline deste aparelho; o app shell público pode permanecer
        após sair. Notificações push podem mostrar conteúdo de dose na tela de
        bloqueio. Exclusão total da Casa é administrativa e invalida sessões e
        inscrições; backups cifrados expiram pela política de retenção. O app não
        oferece orientação médica. Proteja o aparelho com código ou biometria e não
        inclua dados desnecessários em instruções.
      </p>
    </section>
  );
}
