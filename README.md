# AXYSBOT

Painel para gerenciar **a sua** conta no X (Twitter) **sem API paga**: escreve e
agenda posts e threads, avisa quando cada um chega na hora e publica, responde e
reposta pelos **links oficiais do X (Web Intents)**, sempre com a sua confirmação
na tela do próprio x.com. Sem créditos, cartão, assinatura ou cobrança por requisição.

| Tela | O que faz |
|---|---|
| **Painel** | Liga/pausa os lembretes, fila em trilho de horários com "Publicar no X", publicações por dia e o log do que aconteceu. Atualiza sozinho a cada 20 s. |
| **Escrever** | Editor de thread com contagem do jeito do X (link = 23), dividir texto longo em thread, IA para variações, virar thread ou revisar, agendar ou "Publicar agora no X". |
| **Agenda** | Calendário do mês + lista filtrável. Publicar, cancelar, reagendar, excluir. |
| **No X** (X Controller) | Atalhos para Feed, Explorar, Notificações e Menções; pesquisa de posts e perfis; ver um post pelo embed oficial; responder e repostar com confirmação; posts prontos para publicar; publicados por você. |
| **Ajustes** | Identificar a conta pelo @, tema Branco / Bege / Escuro, densidade Compacto / Amplo. |

## Como funciona sem API paga

| Ação | Como | Custo |
|---|---|---|
| Publicar / thread | `x.com/intent/tweet?text=…` (thread: `&in_reply_to=` com o link do post anterior) | grátis |
| Responder | `x.com/intent/tweet?in_reply_to=ID` | grátis |
| Repostar | `x.com/intent/retweet?tweet_id=ID` | grátis |
| Ver um post | oEmbed oficial (`publish.twitter.com/oembed`) + `widgets.js` | grátis |
| Feed, Explorar, pesquisa | abre a página do x.com numa aba nova | grátis |
| Conta | só o @, conferido pelo embed oficial; nenhuma senha, cookie ou token | grátis |

O que **não** dá para fazer de graça e dentro das regras do X: ler o feed ou os
resultados de busca dentro do painel, importar menções e métricas do perfil
sozinho, saber se você já curtiu um post, e publicar sem um clique seu. Isso só
existe pela API paga, ou por automação com cookies e endpoints internos do x.com
(caso do XActions), o que os Termos do X proíbem.

## Escopo

Uma conta, a sua, dentro das
[regras de automação do X](https://help.x.com/en/rules-and-policies/x-automation).
Nada de curtida automática, bloco de contas, proxy, disfarce de automação,
follow/unfollow em massa ou endpoints privados.

## Como dar o start (uns 10 minutos)

### 1. Banco (Supabase)
1. Crie um projeto em supabase.com.
2. Abra **SQL Editor**, cole `supabase/schema.sql` inteiro e rode.
   O script é idempotente: pode rodar de novo sem perder dados.
3. Em **Project Settings > API Keys**, copie a URL e a chave secreta
   (`sb_secret_...`, ou a `service_role` legada).

### 2. X
Nada para configurar: sem app no console.x.com, sem Client ID, sem créditos.
Basta estar logado no x.com no navegador onde você usa o painel.

### 3. Vercel
1. Importe este repositório.
2. Em **Settings > Environment Variables**, preencha tudo do `.env.example`.
   Para gerar segredos: `openssl rand -hex 32`
3. Faça o deploy.

### 4. Lembretes (a cada 5 minutos, sem configurar nada)
O GitHub Actions chama o agendador a cada 5 minutos. Ele marca os posts que
chegaram na hora (um aviso por post) para aparecerem em "Prontos para publicar".
Quem chama é o GitHub Actions
(`.github/workflows/agendador.yml`), grátis em repositório público. Não há
segredo para cadastrar: cada execução apresenta um token OIDC assinado pelo
GitHub, e o painel só aceita tokens **deste repositório, deste workflow, na
main** (`src/lib/oidc.ts`). Se o painel não estiver em
`https://axysbotpuro.vercel.app`, crie a variável `APP_URL` em
**Settings > Secrets and variables > Actions > Variables**.

Para rodar na hora: **Actions > Agendador > Run workflow**. O GitHub pode
atrasar alguns minutos em horário de pico, e pausa workflows agendados de
repositórios sem commits há 60 dias (reative em Actions).

### 5. No painel
1. Entre com usuário `admin` (ou `ADMIN_USER`) e a `ADMIN_PASSWORD`. Se faltar algo, a primeira tela mostra a lista
   do que falta configurar, item por item.
2. **Ajustes > Seu @ no X > Identificar conta**.
3. Escreva um post e agende. Na hora, clique em **Publicar no X**: o x.com abre
   com o texto pronto e você clica em Postar lá. Numa thread, cole o link de cada
   post publicado para o próximo sair como resposta.

### Variáveis do projeto antigo

O painel aceita os nomes que o `axysbotpuro` já tinha no Vercel:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
`ENCRYPTION_MASTER_KEY` (de onde deriva a chave de sessão).
Falta só `ADMIN_PASSWORD` e, opcional, `ANTHROPIC_API_KEY` (a IA do composer
é da Anthropic, não do X, e é cobrada à parte; sem ela o painel funciona igual).

Se o Supabase for o mesmo do painel antigo e já tiver tabelas com os nomes
usados aqui (`posts`, `settings`…), a tela inicial avisa qual tabela conflita.

## Visual

Fundo Branco, Bege ou Escuro e densidade Compacto ou Amplo. Efeito Liquid Glass
(adaptado de [stormaref/LiquidGlassSkill](https://github.com/stormaref/LiquidGlassSkill),
refração MIT de [liquid-glass-js](https://github.com/dashersw/liquid-glass-js))
em pontos escolhidos: botões principais em vidro azul, barra do agendador,
cartão de login, barras do celular, seletores e avisos. Cards com gráfico e
texto ficam sólidos para leitura. A refração roda no Chrome e no Edge; no
Safari e no Firefox fica um vidro fosco.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha
npm run dev
```

## Testes

```bash
npm test            # 48 testes unitarios: intents, embed, thread, sessao, OIDC, IA
npm run typecheck
npm run test:e2e    # ponta a ponta (50 verificacoes), ver abaixo
```

O ponta a ponta sobe o app em modo produção com o servidor em UTC (como o Vercel),
um emulador do PostgREST sobre Postgres real (PGlite), um oEmbed do X e uma
Anthropic falsos, e troca `window.open` por um registro para conferir cada URL do
X sem abri-la. Cobre: login, checklist sem itens pagos, identificação pelo @,
composer com IA e sem custo, **lembretes sem duplicar com 4 crons simultâneos**,
thread publicada com `in_reply_to` encadeado, pausa, atalhos e pesquisa do X
Controller, embed sem script injetado, resposta e repost com confirmação, tema
sem piscar e celular sem rolagem lateral. Requer Python 3 com Playwright e Chrome.

## Segurança

- Nenhuma credencial do X fica no painel: as ações acontecem no seu navegador, no x.com.
- O HTML do embed só é aceito no formato oficial (blockquote), sem `<script>` nem handlers.
- Todas as tabelas com RLS ligado e sem acesso para `anon`/`authenticated`;
  só o servidor acessa, com a chave secreta (`server-only` impede vazar pro navegador).
- Painel protegido por senha + cookie assinado (HMAC); cada rota de API valida a
  sessão de novo, além do `proxy.ts`.
- Rota de cron aceita só o token OIDC deste repositório (ou `CRON_SECRET`, se definido).

## Stack

Next.js 16 (App Router, `proxy.ts`) · React 19 · TypeScript 5.9 · Tailwind CSS 4 ·
Supabase (Postgres) · Web Intents e oEmbed do X · Anthropic API (opcional) · Vercel · GitHub Actions.
Versões fixas e `package-lock.json` versionado.

## Estrutura

```
src/app/(painel)/      Painel, Escrever, Agenda, No X, Ajustes
src/app/api/           posts, confirmação, conta, embed, cron, IA, ajustes
src/components/        UI: trilho da fila, gráficos, composer, calendário
src/lib/               Supabase, intents do X, oEmbed, sessão, thread, jobs
src/proxy.ts           proteção das rotas
supabase/schema.sql    tabelas, índices, fila, RLS e permissões
tests/e2e/             teste ponta a ponta
```
