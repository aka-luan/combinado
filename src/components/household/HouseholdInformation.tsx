export function HouseholdInformation() {
  return (
    <section data-household-information>
      <h2>Casa, backup e privacidade</h2>
      <h3>Estado de backup</h3>
      <p data-backup-status>
        Backup automático: administrado fora do PWA. O último horário não está disponível
        neste ambiente; a rotina é best effort e usa artefato cifrado.
      </p>
      <h3>Aviso de privacidade</h3>
      <p data-privacy-notice>
        O Registro é compartilhado pelos dois Adultos desta Casa. O app não oferece
        orientação médica. Proteja o aparelho com código ou biometria e não inclua dados
        desnecessários em instruções.
      </p>
    </section>
  );
}
