# AXYSBOT

Painel para gerenciar **a sua** conta no X (Twitter) pela **API oficial v2**:
escreve e agenda posts e threads, publica sozinho no horário, mostra as métricas
do perfil e reúne as menções num inbox com resposta sugerida por IA.

| Tela | O que faz |
|---|---|
| **Painel** | Liga/pausa o agendador, fila de publicação em trilho de horários, seguidores, impressões, publicações por dia, gasto do mês na API do X e o log do que o agendador fez. Atualiza sozinho a cada 20 s. |
| **Escrever** | Editor de thread com contagem do jeito do X (link = 23), custo estimado antes de agendar, aviso de link (US$ 0,20 x US$ 0,015), dividir texto longo em thread e IA para variações, virar thread ou revisar. Rascunho salvo no navegador. |
| **Agenda** | Calendário do mês + lista filtrável (agendados, publicados, falharam, rascunhos). Cancelar, reagendar, tentar de novo, excluir. |
| **Menções** | Menções recentes, rascunho de resposta pela IA, resposta publicada só quando você clica. |
| **Ajustes** | Conectar a conta do X (OAuth 2.0), tema Branco / Bege / Escuro, densidade Compacto / Amplo, orçamento mensal da API. |

## Escopo

Uma conta, a sua, pela API oficial, dentro das
[regras de automação do X](https://help.x.com/en/rules-and-policies/x-automation).
O projeto **não** faz curtida automática (proibida pelo X, sem exceção), não opera
bloco de várias contas, não usa proxy residencial nem disfarça automação, e não
faz follow/unfollow em massa.

## Como dar o start (uns 20 minutos)

### 1. Banco (Supabase)
1. Crie um projeto em supabase.com.
2. Abra **SQL Editor**, cole `supabase/schema.sql` inteiro e rode.
   O script é idempotente: pode rodar de novo sem perder dados.
3. Em **Project Settings > API Keys**, copie a URL e a chave secreta
   (`sb_secret_...`, ou a `service_role` legada).

### 2. App do X
1. Em console.x.com, crie um app com **OAuth 2.0** ligado, tipo **Web App**.
2. Callback URI: `https://SEU-DOMINIO.vercel.app/api/x/callback`
3. Copie o **Client ID** e o **Client Secret** do OAuth 2.0.
   O Client ID e o Secret ficam só nas variáveis do Vercel; nunca no código.
4. Compre créditos: desde fev/2026 a API é paga por uso
   (US$ 0,015 por post, US$ 0,20 com link, US$ 0,005 por leitura).

### 3. Vercel
1. Importe este repositório.
2. Em **Settings > Environment Variables**, preencha tudo do `.env.example`.
   Para gerar segredos: `openssl rand -hex 32`
3. Faça o deploy.

### 4. Agendador (a cada 5 minutos)
No plano grátis do Vercel (Hobby), tarefa agendada só roda **1 vez por dia** —
o `vercel.json` já vem assim, como rodada de segurança. Quem chama o agendador a
cada 5 minutos é o GitHub Actions (`.github/workflows/agendador.yml`), grátis em
repositório público:

1. No GitHub: **Settings > Secrets and variables > Actions > New repository secret**
2. `APP_URL` = endereço do app no Vercel, sem barra no final
3. `CRON_SECRET` = o mesmo valor que você pôs no Vercel
4. Em **Actions > Agendador > Run workflow** você testa na hora.

O GitHub pode atrasar alguns minutos em horário de pico, e desliga workflows
agendados de repositórios sem commits há 60 dias (é só reativar em Actions).
No plano Pro do Vercel, troque os horários do `vercel.json` para `*/5 * * * *`
e `17 */2 * * *` e desligue o workflow.

### 5. No painel
1. Entre com a `ADMIN_PASSWORD`. Se faltar algo, a primeira tela mostra a lista
   do que falta configurar, item por item.
2. **Ajustes > Conectar conta do X**.
3. Escreva um post, agende, e acompanhe no Painel.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha
npm run dev
```

## Testes

```bash
npm test            # 26 testes unitarios: custo, thread, cifragem, sessao, OAuth, IA
npm run typecheck
npm run test:e2e    # ponta a ponta (40 verificacoes), ver abaixo
```

O ponta a ponta sobe o app em modo produção com o servidor em UTC (como o Vercel),
um emulador do PostgREST sobre Postgres real (PGlite), e um X e uma Anthropic
falsos. Nada sai de verdade. Ele cobre: login e proteção de rotas, OAuth com PKCE
e state contra CSRF, token cifrado no banco, composer com IA e custo, thread
publicada como cadeia de respostas, **4 crons simultâneos sem publicar duplicado**,
falha permanente com motivo e nova tentativa, refresh automático de token com
rotação, métricas, menções, resposta, pausa do agendador, tema sem piscar e
layout de celular sem rolagem lateral. Requer Python 3 com Playwright e Chrome.

## Segurança

- Tokens do X cifrados no banco (AES-256-GCM); a chave fica só no ambiente.
- Todas as tabelas com RLS ligado e sem acesso para `anon`/`authenticated`;
  só o servidor acessa, com a chave secreta (`server-only` impede vazar pro navegador).
- Painel protegido por senha + cookie assinado (HMAC); cada rota de API valida a
  sessão de novo, além do `proxy.ts`.
- Rotas de cron exigem `CRON_SECRET`.
- Fila com `FOR UPDATE SKIP LOCKED`: execuções paralelas nunca publicam o mesmo post 2x.

## Stack

Next.js 16 (App Router, `proxy.ts`) · React 19 · TypeScript 5.9 · Tailwind CSS 4 ·
Supabase (Postgres) · API do X v2 · Anthropic API · Vercel (hosting + cron).
Versões fixas e `package-lock.json` versionado.

## Estrutura

```
src/app/(painel)/      Painel, Escrever, Agenda, Menções, Ajustes
src/app/api/           OAuth do X, posts, cron, IA, menções, ajustes
src/components/        UI: trilho da fila, gráficos, composer, calendário
src/lib/               Supabase, API do X, cifragem, sessão, custo, thread, jobs
src/proxy.ts           proteção das rotas
supabase/schema.sql    tabelas, índices, fila, RLS e permissões
tests/e2e/             teste ponta a ponta
```
