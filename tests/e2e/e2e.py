"""
Teste ponta a ponta do AXYSBOT (skill webapp-testing: Playwright, reconhecer-e-agir).
Stack: app Next em producao + PostgREST emulado sobre Postgres real + X e Anthropic falsos.
"""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from playwright.sync_api import sync_playwright, expect

APP = "http://localhost:3100"
SQL = "http://127.0.0.1:54322"
XLOG = "http://127.0.0.1:4010/__log"
CRON = {"Authorization": "Bearer segredo-do-cron-de-teste-123"}
SHOTS = "tests/e2e/shots"
results = []

def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("  OK   " if cond else "  FALHOU ") + name + (f"  ({extra})" if extra else ""), flush=True)

def sql(q):
    req = urllib.request.Request(SQL, data=q.encode(), method="POST")
    return json.loads(urllib.request.urlopen(req).read() or "[]")

def http(url, headers=None, method="GET"):
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or "null")

def xlog(): return http(XLOG)[1]

import os; os.makedirs(SHOTS, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"))
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, locale="pt-BR", timezone_id="America/Sao_Paulo")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    print("\n1. Login")
    page.goto(APP + "/agenda"); page.wait_for_load_state("networkidle")
    ok("rota protegida manda para /login com retorno", "/login?next=%2Fagenda" in page.url, page.url)
    page.fill("input[type=password]", "errada"); page.click("button[type=submit]")
    expect(page.get_by_text("Senha incorreta.")).to_be_visible(timeout=5000)
    ok("senha errada e recusada", True)
    page.fill("input[type=password]", "senha-de-teste-123"); page.click("button[type=submit]")
    page.wait_for_url(APP + "/agenda", timeout=8000)
    ok("senha certa entra e volta para a pagina pedida", page.url.endswith("/agenda"))

    print("\n2. Checklist de configuracao (antes de conectar o X)")
    page.goto(APP + "/"); page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Vamos ligar o seu bot")).to_be_visible()
    body = page.inner_text("main")
    ok("checklist mostra 7 de 8 prontos", "7 de 8 prontos" in body, re.search(r"\d de \d prontos", body).group(0))
    ok("pendencia e so a conta do X", "Clique em Conectar conta do X" in body)
    page.screenshot(path=f"{SHOTS}/01-checklist.png", full_page=True)

    print("\n3. OAuth 2.0 com PKCE")
    r = page.request.get(APP + "/api/x/connect", max_redirects=0)
    loc = r.headers.get("location", "")
    ok("conectar redireciona para x.com/i/oauth2/authorize", loc.startswith("https://x.com/i/oauth2/authorize"), loc[:60])
    ok("pede S256 e os 4 escopos", "code_challenge_method=S256" in loc and "offline.access" in loc)
    state = re.search(r"state=([^&]+)", loc).group(1)
    page.goto(f"{APP}/api/x/callback?code=code-ok&state=forjado"); page.wait_for_load_state("networkidle")
    ok("state forjado e rejeitado (CSRF)", "x=estado_invalido" in page.url)
    r = page.request.get(APP + "/api/x/connect", max_redirects=0)
    state = re.search(r"state=([^&]+)", r.headers["location"]).group(1)
    page.goto(f"{APP}/api/x/callback?code=code-ok&state={state}"); page.wait_for_load_state("networkidle")
    ok("callback valido conecta a conta", "x=conectado" in page.url, page.url.split("?")[-1])
    expect(page.get_by_text("@thiago_teste").first).to_be_visible()
    acc = sql("select access_token, refresh_token from x_accounts")[0]
    ok("token gravado CIFRADO no banco (nao aparece em claro)", "at-1" not in acc["access_token"] and acc["access_token"].count(".") == 2)
    page.screenshot(path=f"{SHOTS}/02-ajustes-conectado.png", full_page=True)

    print("\n4. Composer: thread, contagem, custo e IA")
    page.goto(APP + "/composer"); page.wait_for_load_state("networkidle")
    page.fill("#post-0", "Agendar posts mudou minha rotina no X.")
    page.get_by_role("button", name="Variações").click()
    page.get_by_role("button", name="Gerar sugestões").click()
    expect(page.get_by_role("button", name="Usar esta").first).to_be_visible(timeout=8000)
    ok("IA devolve variacoes", page.get_by_role("button", name="Usar esta").count() == 2)
    page.get_by_role("button", name="Virar thread").click()
    page.get_by_role("button", name="Gerar sugestões").click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Usar esta").first.click()
    expect(page.locator("#post-2")).to_be_visible()
    ok("'Usar esta' monta a thread de 3 posts", page.locator("textarea[id^=post-]").count() == 3)
    page.fill("#post-1", "Escrevo tudo no domingo: https://axysbot.com.br/guia")
    page.wait_for_timeout(300)
    side = page.inner_text("section[aria-label=Agendar]")
    ok("custo com 1 link = US$ 0,23", "US$ 0,23" in side, re.search(r"US\$ [\d,]+", side).group(0))
    ok("avisa quanto economiza sem o link", "economiza US$ 0,185" in side)
    page.get_by_role("button", name="Em 1 hora").click()
    page.screenshot(path=f"{SHOTS}/03-composer.png", full_page=True)
    page.get_by_role("button", name=re.compile("Agendar thread de 3")).click()
    page.wait_for_url(APP + "/", timeout=8000)
    row = sql("select status, est_cost_usd, (select count(*) from post_items i where i.post_id=p.id) n from posts p")[0]
    ok("thread salva no banco como agendada com 3 itens", row["status"] == "agendado" and row["n"] == 3, str(row))

    print("\n5. Agendador publica (cron) — thread vira cadeia de respostas")
    sql("update posts set scheduled_for = now() - interval '1 minute'")
    st, out = http(APP + "/api/cron/publish", CRON)
    ok("cron publicou 1 post", st == 200 and out["claimed"] == 1 and out["results"][0]["ok"], json.dumps(out)[:90])
    tw = [t for t in xlog()["tweets"] if not t.get("external")]
    ok("3 tweets criados no X", len(tw) == 3)
    ok("post 2 responde ao 1 e post 3 responde ao 2", tw[1]["reply_to"] == tw[0]["id"] and tw[2]["reply_to"] == tw[1]["id"])
    row = sql("select status, x_post_id from posts")[0]
    ok("post marcado publicado com id do 1o tweet", row["status"] == "publicado" and row["x_post_id"] == tw[0]["id"])
    usage = sql("select operation, count(*)::int n, sum(cost_usd)::float c from api_usage group by 1 order by 1")
    ok("custo registrado: 2 posts sem link + 1 com link", {u["operation"]: u["n"] for u in usage}.get("post_create_url") == 1, str(usage))

    print("\n6. Concorrencia: 2 crons ao mesmo tempo nao duplicam")
    page.request.post(APP + "/api/posts", data={"items": ["Post de concorrencia unico"], "scheduledFor": None})
    sql("update posts set status='agendado', scheduled_for=now() - interval '1 minute' where status='rascunho'")
    with ThreadPoolExecutor(4) as ex: outs = list(ex.map(lambda _: http(APP + "/api/cron/publish", CRON)[1], range(4)))
    n = sum(1 for t in xlog()["tweets"] if t["text"] == "Post de concorrencia unico")
    ok("4 crons em paralelo -> publicado exatamente 1 vez", n == 1, f"claims={[o['claimed'] for o in outs]} tweets={n}")

    print("\n7. Falha permanente vai para 'falhou' com motivo; retry funciona")
    page.request.post(APP + "/api/posts", data={"items": ["FALHAR este post"], "scheduledFor": None})
    sql("update posts set status='agendado', scheduled_for=now() - interval '1 minute' where status='rascunho'")
    http(APP + "/api/cron/publish", CRON)
    row = sql("select status, error from posts where id in (select post_id from post_items where body like 'FALHAR%')")[0]
    ok("erro 403 do X marca 'falhou' sem ficar tentando", row["status"] == "falhou" and "igual a um post recente" in row["error"], row["error"][:50])
    page.goto(APP + "/agenda?status=falhou"); page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Motivo:")).to_be_visible()
    ok("agenda mostra o motivo da falha", True)
    page.screenshot(path=f"{SHOTS}/04-agenda-falhou.png", full_page=True)
    page.get_by_role("button", name="Tentar de novo").click()
    expect(page.get_by_text("Reagendado")).to_be_visible(timeout=5000)
    ok("'Tentar de novo' reagenda", sql("select status from posts where id in (select post_id from post_items where body like 'FALHAR%')")[0]["status"] == "agendado")

    print("\n8. Token expirado: refresh automatico com rotacao")
    sql("update x_accounts set token_expires_at = now() - interval '1 hour'")
    page.goto(APP + "/"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Sincronizar").click()
    expect(page.get_by_text("Métricas e menções sincronizadas")).to_be_visible(timeout=10000)
    acc2 = sql("select refresh_token, token_expires_at > now() as valido from x_accounts")[0]
    ok("sync renovou o token sozinho e salvou o novo refresh token", acc2["valido"] and acc2["refresh_token"] != acc["refresh_token"])
    m = sql("select followers, impressions from metrics_daily")[0]
    ok("metricas do perfil gravadas (1.287 seguidores)", m["followers"] == 1287, str(m))
    ok("2 mencoes importadas", sql("select count(*)::int n from mentions")[0]["n"] == 2)

    print("\n9. Painel ao vivo")
    page.reload(); page.wait_for_load_state("networkidle")
    txt = page.inner_text("main")
    ok("painel mostra seguidores", "1.287" in txt)
    ok("painel mostra gasto do mes", re.search(r"US\$ 0,[0-9]{2}", txt) is not None)
    ok("atividade do agendador listada", "Publicação" in txt and "Métricas" in txt)
    page.get_by_role("button", name="Pausar").click()
    expect(page.get_by_text("Agendador pausado").first).to_be_visible(timeout=5000)
    ok("botao pausa o agendador", sql("select paused from settings")[0]["paused"] is True)
    st, out = http(APP + "/api/cron/publish", CRON)
    ok("com pausa, cron nao publica nada", out["claimed"] == 0)
    page.get_by_role("button", name="Ligar agendador").click()
    expect(page.get_by_text("Agendador ligado").first).to_be_visible(timeout=5000)
    page.wait_for_timeout(900)

    for theme in ["bege", "branco", "escuro"]:
        page.evaluate(f"document.documentElement.dataset.theme='{theme}'")
        page.wait_for_timeout(400)
        page.screenshot(path=f"{SHOTS}/05-painel-{theme}.png", full_page=True)
    page.evaluate("document.documentElement.dataset.theme='bege'")

    print("\n10. Mencoes: sugestao da IA e resposta")
    page.goto(APP + "/inbox"); page.wait_for_load_state("networkidle")
    page.get_by_text("gostei muito da thread").click()
    page.get_by_role("button", name="Sugerir respostas").click()
    page.get_by_text("Vou juntar o material").click()
    page.get_by_role("button", name="Responder", exact=True).click()
    expect(page.get_by_text("Resposta publicada")).to_be_visible(timeout=8000)
    rep = [t for t in xlog()["tweets"] if t.get("reply_to") == "1800000000000000002"]
    ok("resposta publicada no X como reply da mencao", len(rep) == 1)
    ok("mencao marcada como respondida", sql("select replied from mentions where x_post_id='1800000000000000002'")[0]["replied"] is True)
    page.screenshot(path=f"{SHOTS}/06-inbox.png", full_page=True)

    print("\n11. Tema persiste sem piscar")
    page.goto(APP + "/ajustes"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Escuro").click()
    page.reload(); page.wait_for_load_state("domcontentloaded")
    ok("tema escuro aplicado antes da hidratacao", page.evaluate("document.documentElement.dataset.theme") == "escuro")
    page.get_by_role("button", name="Bege").click()

    print("\n12. Celular (390px)")
    m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, storage_state=ctx.storage_state())
    mp = m.new_page()
    for path, name in [("/", "07-mobile-painel"), ("/composer", "08-mobile-composer"), ("/agenda", "09-mobile-agenda")]:
        mp.goto(APP + path); mp.wait_for_load_state("networkidle")
        overflow = mp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        ok(f"{path} sem rolagem horizontal no celular", overflow <= 0, f"overflow={overflow}px")
        mp.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)
    ok("barra de abas inferior visivel no celular", mp.locator("nav[aria-label=Principal]").last.is_visible())

    print("\n13. Saude")
    real = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    ok("nenhum erro de JavaScript no navegador", not real, "; ".join(real)[:200])
    browser.close()

passed = sum(1 for _, c, _ in results if c)
print(f"\n==== {passed}/{len(results)} verificacoes passaram ====")
sys.exit(0 if passed == len(results) else 1)
