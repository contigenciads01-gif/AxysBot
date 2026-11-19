#!/usr/bin/env bash
# Teste ponta a ponta: app em producao + PostgREST emulado (Postgres real via PGlite)
# + X e Anthropic falsos. Nao toca em nada real: nenhum post sai de verdade.
#   Requisitos: Node 22+, Python 3 com Playwright (pip install playwright), Chrome.
#   Chrome em outro caminho: CHROME=/caminho/do/chrome npm run test:e2e
set -uo pipefail
cd "$(dirname "$0")/../.."

pids=()
cleanup() {
  for p in "${pids[@]}"; do
    pkill -TERM -P "$p" 2>/dev/null   # filhos (ex.: next-server)
    kill -TERM "$p" 2>/dev/null
  done
}
trap cleanup EXIT

npm run build >/dev/null || exit 1
node tests/e2e/pgrest-shim.mjs supabase/schema.sql & pids+=($!)
node tests/e2e/mocks.mjs & pids+=($!)
( set -a; . tests/e2e/app.env.test; set +a; TZ=UTC exec node node_modules/next/dist/bin/next start -p 3100 ) & pids+=($!)

# espera o banco de teste E o app estarem prontos (o schema leva alguns segundos)
for _ in $(seq 1 60); do
  curl -s -o /dev/null -H "apikey: chave-de-teste" http://127.0.0.1:54321/rest/v1/settings \
    && curl -s -o /dev/null http://localhost:3100/login && break
  sleep 1
done
python3 tests/e2e/e2e.py < /dev/null
exit $?
