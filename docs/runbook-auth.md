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
4. Associe o usuário ao household singleton (membership), conforme o schema
   definido no ticket de fundação (M1).

## Recuperação de acesso (Gmail SMTP indisponível)

Quando o envio de OTP falhar (App Password expirada, Gmail fora do ar):

1. Supabase Studio → Authentication → Users → selecione o adulto afetado.
2. **Reset password** → defina uma senha temporária forte, comunicada fora de
   banda (nunca por e-mail do próprio Gmail SMTP com problema).
3. O adulto acessa pelo próprio PWA: na tela de login, "Usar senha
   temporária" → e-mail + senha. Deve trocá-la ou retomar OTP assim que o
   Gmail for restabelecido.
4. Não deixar senha permanente ativa: trate-a como acesso de emergência.

## Troca de adulto

1. Revogar a membership antiga no household.
2. Provisionar a nova conta seguindo "Provisionar um adulto" acima.
3. Preservar a autoria histórica dos registros do adulto substituído — não
   apagar nem reatribuir eventos passados.
