# Runbook: autenticação

Procedimentos administrativos para os dois adultos autorizados. Executados no
Supabase Studio (SQL Editor ou Authentication → Users) do projeto — nunca a
partir deste repositório, que não recebe segredos (ver PRD §15).

## Provisionar um adulto

Não existe cadastro público. Para criar uma das duas contas:

1. Supabase Studio → Authentication → Users → **Add user**.
2. Informe o e-mail do adulto. Não defina senha nem envie convite por link.
3. Confirme o e-mail manualmente (**Auto Confirm User**), já que o fluxo do
   app é só OTP, não confirmação por e-mail de cadastro.
4. Associe o usuário ao household singleton (membership). Depois de aplicar a
   migration de fundação, use o bootstrap em
   [docs/runbook-household.md](./runbook-household.md).

## Recuperação de acesso (Gmail SMTP indisponível)

Quando o envio de OTP falhar (App Password expirada, Gmail fora do ar):

1. Supabase Studio → Authentication → Users → selecione o adulto afetado.
2. **Reset password** → defina uma senha temporária forte, comunicada fora de
   banda (nunca por e-mail do próprio Gmail SMTP com problema).
3. O adulto acessa pelo próprio PWA: na tela de login, "Usar senha
   temporária" → e-mail + senha. Deve trocá-la ou retomar OTP assim que o
   Gmail for restabelecido.
4. Não deixar senha permanente ativa: trate-a como acesso de emergência.

### Reconfigurar Gmail SMTP / App Password

1. Na conta Gmail dedicada (2FA ligado), revogue a App Password antiga se
   comprometida e gere outra.
2. Em Authentication → SMTP Settings do projeto, atualize usuário/senha com a
   nova App Password (segredo só no painel — nunca no git).
3. Dispare um OTP de teste no PWA. A UI do Adulto **não** deve mencionar Gmail
   ou SMTP em caso de falha (mensagens fixas por código Auth).
4. Se o SMTP continuar indisponível, mantenha o fluxo de senha temporária
   acima. Ver também [runbook-ops.md](./runbook-ops.md).

## Troca de adulto

1. Revogar a membership antiga no household.
2. Provisionar a nova conta seguindo "Provisionar um adulto" acima.
3. Preservar a autoria histórica dos registros do adulto substituído — não
   apagar nem reatribuir eventos passados.
