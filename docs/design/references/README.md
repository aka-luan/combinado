# Norteadores visuais do redesign mobile

Este diretório preserva as referências fornecidas pelo owner do Combinado em
01/08/2026 para o mapa Wayfinder
**Definir o redesign mobile completo do Combinado**.

São fontes de direção visual, não lei do produto. Em qualquer conflito,
`PRD.md`, `AGENTS.md` e os ADRs vigentes prevalecem.

## Artefatos

| Arquivo | Papel | Dimensões / formato | SHA-256 |
| --- | --- | --- | --- |
| [`design-system-reference.md`](design-system-reference.md) | Design brief extraído do mockup; cores e medidas são aproximadas | Markdown UTF-8, 612 linhas | `4ae4b03a1c22ba3039b8efe25591ec5b89c835abfd2ea88e08e39d1c42c1472d` |
| [`login-mobile-north-star.jpeg`](login-mobile-north-star.jpeg) | Norte visual do Login mobile; não é uma composição literal a reproduzir | JPEG, 711×1536 | `a1d3e45d550d6acc6954421edb59ebac918e3dabb2e537478e0baf4a1673d690` |
| [`login-interior-illustration.png`](login-interior-illustration.png) | Ilustração-fonte candidata ao Login | PNG RGBA, 1672×941 | `7e2d2f866f6008f23cfb41827f5ccf838c9790c677dbb977611b26480bedcadc` |

Os arquivos foram copiados byte por byte das versões fornecidas na conversa.
Os nomes originais eram, respectivamente, `design(1).md`,
`030C535D-1724-43F3-8C8D-D0558248074E.jpeg` e `tmpADA1.png`.

## Contrato de uso

- O mockup governa paleta, tipografia, suavidade, espaçamento, marca e calor
  doméstico; fluxos, conteúdo, acessibilidade e altura útil do aparelho podem
  exigir outra composição.
- A ilustração fica restrita ao Login e a momentos de configuração/reasseguro
  que venham a ser explicitamente aprovados. Ela não pertence aos estados
  vazios de Hoje ou Amanhã.
- A ilustração-fonte não deve ser servida diretamente por `public/`. A futura
  implementação deve gerar um derivado responsivo e otimizado, mantendo este
  original imutável como referência.
- O mockup é apenas referência e não deve ser enviado no bundle do PWA.
- O logo visto no mockup não existe como asset separado. Um SVG próprio para
  dois Adultos/Casa será decidido no ticket de identidade; não se deve recortar
  o raster.
- Afirmações de privacidade presentes nas referências não são aprovadas por
  associação. O texto final deve refletir Registro compartilhado no Supabase,
  cache local e backup da Casa.
- Tema escuro, estados semânticos, tipografia final e componentes serão
  definidos pelos tickets posteriores do mapa.

## Proveniência e direitos

O owner forneceu estes três arquivos para orientar o redesign deste PWA
privado. Autoria, licença e cadeia de geração não foram verificadas de forma
independente. Esta nota registra a proveniência conhecida sem fazer uma
declaração adicional de titularidade ou permissão para redistribuição pública.
