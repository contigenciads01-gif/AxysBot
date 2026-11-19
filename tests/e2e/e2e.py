"""
Teste ponta a ponta do AXYSBOT (skill webapp-testing: Playwright, reconhecer-e-agir).
Stack: app Next em producao + PostgREST emulado sobre Postgres real + oEmbed do X e Anthropic falsos.
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
    # window.open vira registro: o teste confere a URL do X sem abrir o x.com de verdade
    ctx.add_init_script("window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; };")
    ctx.route(re.compile(r"https://platform\.twitter\.com/.*"), lambda r: r.abort())
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    print("\n1. Login")
    page.goto(APP + "/agenda"); page.wait_for_load_state("networkidle")
    ok("rota protegida manda para /login com retorno", "/login?next=%2Fagenda" in page.url, page.url)
    ok("usuario vem preenchido com admin", page.input_value("input[name=username]") == "admin")
    if "Chrome" in page.evaluate("navigator.userAgent"):
        page.wait_for_timeout(500)
        bf = page.evaluate("getComputedStyle(document.querySelector('form .btn-primary')).backdropFilter")
        ok("botao Entrar com refracao Liquid Glass (Chromium)", "liquid-glass-" in bf, bf[:40])
    page.fill("input[type=password]", "errada"); page.click("button[type=submit]")
    expect(page.get_by_text("Usuário ou senha incorretos.")).to_be_visible(timeout=5000)
    ok("senha errada e recusada", True)
    page.fill("input[name=username]", "root"); page.fill("input[type=password]", "senha-de-teste-123"); page.click("button[type=submit]")
    expect(page.get_by_text("Usuário ou senha incorretos.")).to_be_visible(timeout=5000)
    ok("usuario errado e recusado", True)
    page.screenshot(path=f"{SHOTS}/00-login.png")
    page.fill("input[name=username]", "admin"); page.fill("input[type=password]", "senha-de-teste-123"); page.click("button[type=submit]")
    page.wait_for_url(APP + "/agenda", timeout=8000)
    ok("admin + senha certa entram e voltam para a pagina pedida", page.url.endswith("/agenda"))

    print("\n2. Checklist (sem API paga do X)")
    sql("alter table posts drop column claimed_at")   # simula tabela 'posts' antiga, de outro app
    page.goto(APP + "/"); page.wait_for_load_state("networkidle")
    ok("detecta tabela antiga com o mesmo nome", "mesmo nome e outras colunas: posts" in page.inner_text("main"))
    sql("alter table posts add column claimed_at timestamptz")
    page.reload(); page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Vamos ligar o seu bot")).to_be_visible()
    body = page.inner_text("main")
    m = re.search(r"\d de \d prontos", body)
    ok("checklist mostra 5 de 6 prontos", "5 de 6 prontos" in body, m.group(0) if m else body[:80])
    ok("unica pendencia e identificar o @", "digite o seu @" in body)
    ok("checklist nao pede app, Client ID, cartao nem orcamento", not re.search(r"X_CLIENT_ID|Client Secret|Orçamento|US\$|cifragem", body))
    page.screenshot(path=f"{SHOTS}/01-checklist.png", full_page=True)

    print("\n3. Identificar a conta pelo @ (gratis)")
    page.goto(APP + "/ajustes"); page.wait_for_load_state("networkidle")
    aj = page.inner_text("main")
    ok("Ajustes sem card de orcamento da API", "Orçamento" not in aj and "US$" not in aj and "Limite mensal" not in aj)
    page.fill("input[name=usuario_x]", "@perfil naoexiste!")
    page.get_by_role("button", name="Identificar conta").click()
    expect(page.get_by_text("Digite um @ válido")).to_be_visible(timeout=5000)
    ok("@ invalido e recusado", True)
    page.fill("input[name=usuario_x]", "naoexiste")
    page.get_by_role("button", name="Identificar conta").click()
    expect(page.get_by_text("Não achei o perfil @naoexiste")).to_be_visible(timeout=5000)
    ok("perfil inexistente e recusado (via embed oficial)", True)
    page.fill("input[name=usuario_x]", "https://x.com/thiago_teste")
    page.get_by_role("button", name="Identificar conta").click()
    expect(page.get_by_text("@thiago_teste").first).to_be_visible(timeout=5000)
    acc = sql("select username, display_name, access_token, refresh_token from x_accounts")[0]
    ok("conta salva sem token nem segredo", acc["username"] == "thiago_teste" and acc["access_token"] == "sem-api" and acc["refresh_token"] is None, str(acc))
    ok("nome vem do embed oficial", acc["display_name"] == "Thiago Teste")
    page.screenshot(path=f"{SHOTS}/02-ajustes.png", full_page=True)

    print("\n4. Composer: thread e IA, sem custo")
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
    ok("composer nao mostra custo em US$", "US$" not in page.inner_text("main"))
    page.get_by_role("button", name="Em 1 hora").click()
    page.screenshot(path=f"{SHOTS}/03-composer.png", full_page=True)
    page.get_by_role("button", name=re.compile("Agendar thread de 3")).click()
    page.wait_for_url(APP + "/", timeout=8000)
    row = sql("select status, (select count(*) from post_items i where i.post_id=p.id) n from posts p")[0]
    ok("thread salva como agendada com 3 itens", row["status"] == "agendado" and row["n"] == 3, str(row))

    print("\n5. Agendador: avisa na hora, nao publica sozinho")
    sql("update posts set scheduled_for = now() - interval '1 minute'")
    st, out = http(APP + "/api/cron/publish", CRON)
    ok("cron encontrou 1 post na hora e avisou", st == 200 and out["due"] == 1 and out["notified"] == 1, json.dumps(out))
    ok("post continua agendado (sem API, so voce publica)", sql("select status from posts")[0]["status"] == "agendado")
    st, out = http(APP + "/api/cron/publish", CRON)
    ok("segundo cron nao avisa de novo", out["notified"] == 0 and out["due"] == 1, json.dumps(out))
    page.request.post(APP + "/api/posts", data={"items": ["Post de concorrencia unico"], "scheduledFor": None})
    sql("update posts set status='agendado', scheduled_for=now() - interval '1 minute' where status='rascunho'")
    with ThreadPoolExecutor(4) as ex: list(ex.map(lambda _: http(APP + "/api/cron/publish", CRON), range(4)))
    n = sql("select count(*)::int n from run_log where kind='lembrete'")[0]["n"]
    ok("4 crons em paralelo -> 1 aviso por post (2 no total)", n == 2, f"lembretes={n}")
    ok("nenhuma chamada a API do X", not any("/2/" in l for l in xlog()["log"]))

    print("\n6. Publicar com confirmacao (Web Intent)")
    page.goto(APP + "/"); page.wait_for_load_state("networkidle")
    txt = page.inner_text("main")
    ok("painel destaca posts na hora", "na hora de publicar" in txt and "Na hora" in txt)
    ok("painel sem gasto da API", "US$" not in txt and "Gasto" not in txt)
    page.evaluate("window.__opened = []")
    page.locator("section[aria-label='Fila de publicação'] li", has_text="Agendar posts mudou").get_by_role("button", name="Publicar no X").click()
    dlg = page.locator("dialog[open]")
    expect(dlg.get_by_text("Publicar thread de 3 posts")).to_be_visible()
    ok("2o post bloqueado ate colar o link do 1o", dlg.get_by_role("button", name="Abrir resposta no X").first.is_disabled())
    dlg.get_by_role("button", name="Abrir no X").click()
    opened = page.evaluate("window.__opened")
    u0 = opened[-1] if opened else ""
    ok("abre x.com/intent/tweet com o texto do post 1", u0.startswith("https://x.com/intent/tweet?") and "Agendar+posts" in u0 and "in_reply_to" not in u0, u0[:70])
    links = dlg.locator("input[inputmode=url]")
    links.nth(0).fill("https://x.com/thiago_teste/status/1900000000000000001")
    dlg.get_by_role("button", name="Abrir resposta no X").first.click()
    u1 = page.evaluate("window.__opened")[-1]
    ok("post 2 sai como resposta ao 1 (in_reply_to)", "in_reply_to=1900000000000000001" in u1, u1[-40:])
    links.nth(1).fill("https://x.com/thiago_teste/status/1900000000000000002")
    dlg.get_by_role("button", name="Abrir resposta no X").last.click()
    u2 = page.evaluate("window.__opened")[-1]
    ok("post 3 sai como resposta ao 2", "in_reply_to=1900000000000000002" in u2)
    links.nth(2).fill("https://x.com/thiago_teste/status/1900000000000000003")
    page.screenshot(path=f"{SHOTS}/04-publicar.png", full_page=True)
    dlg.get_by_role("button", name=re.compile("marcar como publicado")).click()
    expect(page.get_by_text("Marcado como publicado")).to_be_visible(timeout=6000)
    row = sql("select p.status, p.x_post_id, array_agg(i.x_post_id order by i.position) ids from posts p join post_items i on i.post_id=p.id where p.x_post_id is not null group by 1,2")
    ok("thread marcada publicada com os 3 IDs", row and row[0]["status"] == "publicado" and row[0]["ids"][2] == "1900000000000000003", str(row)[:120])

    print("\n7. Pausa")
    page.get_by_role("button", name="Pausar").click()
    expect(page.get_by_text("Agendador pausado").first).to_be_visible(timeout=5000)
    page.request.post(APP + "/api/posts", data={"items": ["Post na pausa"], "scheduledFor": None})
    sql("update posts set status='agendado', scheduled_for=now() - interval '1 minute' where status='rascunho'")
    st, out = http(APP + "/api/cron/publish", CRON)
    ok("com pausa, cron nao avisa", out["notified"] == 0, json.dumps(out))
    page.get_by_role("button", name="Ligar agendador").click()
    expect(page.get_by_text("Agendador ligado").first).to_be_visible(timeout=5000)
    if "Chrome" in page.evaluate("navigator.userAgent"):
        bf = page.evaluate("getComputedStyle(document.querySelector('section[aria-label=Agendador]')).backdropFilter")
        ok("barra do agendador com refracao Liquid Glass", "liquid-glass-" in bf)
    for theme in ["bege", "branco", "escuro"]:
        page.evaluate(f"document.documentElement.dataset.theme='{theme}'")
        page.wait_for_timeout(400)
        page.screenshot(path=f"{SHOTS}/05-painel-{theme}.png", full_page=True)
    page.evaluate("document.documentElement.dataset.theme='bege'")

    print("\n8. X Controller: navegar, pesquisar, ver, responder, repostar")
    page.goto(APP + "/inbox"); page.wait_for_load_state("networkidle")
    ok("/inbox leva ao X Controller", page.url.endswith("/x"))
    page.evaluate("window.__opened = []")
    page.get_by_role("button", name="Feed").click()
    page.get_by_role("button", name="Explorar").click()
    page.get_by_role("button", name="Menções").click()
    o = page.evaluate("window.__opened")
    ok("atalhos abrem Feed, Explorar e menções do @", o[:2] == ["https://x.com/home", "https://x.com/explore"] and "q=%40thiago_teste" in o[2], str(o)[:120])
    page.fill("input[name=busca]", "agendar posts")
    page.get_by_role("button", name="Pesquisar", exact=True).click()
    ok("pesquisa de posts recentes (f=live)", "x.com/search?q=agendar+posts" in page.evaluate("window.__opened")[-1] and "f=live" in page.evaluate("window.__opened")[-1])
    page.get_by_role("button", name="Perfis").click()
    page.fill("input[name=busca]", "@ana_dev")
    page.get_by_role("button", name="Pesquisar", exact=True).click()
    ok("pesquisa de perfis (f=user)", "f=user" in page.evaluate("window.__opened")[-1] and "q=ana_dev" in page.evaluate("window.__opened")[-1])
    page.fill("input[name=link]", "https://x.com/ana_dev/status/1800000000000000001?s=20")
    page.locator("section[aria-label='Ver publicação']").get_by_role("button", name="Ver", exact=True).click()
    expect(page.locator(".x-embed blockquote.twitter-tweet")).to_be_visible(timeout=6000)
    ok("post aparece pelo embed oficial", "Qual ferramenta" in page.inner_text(".x-embed"))
    ok("embed sem <script> injetado", page.locator(".x-embed script").count() == 0)
    page.get_by_role("button", name="Responder", exact=True).click()
    page.get_by_role("button", name="Sugerir respostas").click()
    page.get_by_text("Vou juntar o material").click()
    page.get_by_role("button", name="Revisar e responder").click()
    cd = page.locator("dialog[open]")
    expect(cd.get_by_text("Responder no X")).to_be_visible()
    cd.get_by_role("button", name="Abrir no X").click()
    u = page.evaluate("window.__opened")[-1]
    ok("resposta abre intent com in_reply_to do post", "intent/tweet" in u and "in_reply_to=1800000000000000001" in u and "juntar" in u)
    page.screenshot(path=f"{SHOTS}/06-x-controller.png", full_page=True)
    cd.get_by_role("button", name="Já confirmei no X").click()
    expect(page.get_by_text("Resposta registrada")).to_be_visible(timeout=5000)
    page.get_by_role("button", name="Repostar").click()
    page.locator("dialog[open]").get_by_role("button", name="Abrir no X").click()
    ok("repost abre intent/retweet do post", page.evaluate("window.__opened")[-1] == "https://x.com/intent/retweet?tweet_id=1800000000000000001")
    page.locator("dialog[open]").get_by_role("button", name="Já confirmei no X").click()
    expect(page.get_by_text("Repost registrado")).to_be_visible(timeout=5000)
    kinds = [r["kind"] for r in sql("select kind from run_log where kind in ('responder','repostar') order by id")]
    ok("resposta e repost registrados so apos sua confirmacao", kinds == ["responder", "repostar"], str(kinds))
    ok("lista de publicados mostra a thread", "Agendar posts mudou" in page.inner_text("section[aria-label='Publicados por você']"))

    print("\n9. Tema persiste sem piscar")
    page.goto(APP + "/ajustes"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Escuro").click()
    page.reload(); page.wait_for_load_state("domcontentloaded")
    ok("tema escuro aplicado antes da hidratacao", page.evaluate("document.documentElement.dataset.theme") == "escuro")
    page.get_by_role("button", name="Bege").click()

    print("\n10. Celular (390px)")
    m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, storage_state=ctx.storage_state())
    m.route(re.compile(r"https://platform\.twitter\.com/.*"), lambda r: r.abort())
    mp = m.new_page()
    for path, name in [("/", "07-mobile-painel"), ("/composer", "08-mobile-composer"), ("/agenda", "09-mobile-agenda"), ("/x", "10-mobile-x")]:
        mp.goto(APP + path); mp.wait_for_load_state("networkidle")
        overflow = mp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        ok(f"{path} sem rolagem horizontal no celular", overflow <= 0, f"overflow={overflow}px")
        mp.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)
    ok("barra de abas inferior visivel no celular", mp.locator("nav[aria-label=Principal]").last.is_visible())

    print("\n11. Saude")
    real = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    ok("nenhum erro de JavaScript no navegador", not real, "; ".join(real)[:200])
    browser.close()

passed = sum(1 for _, c, _ in results if c)
print(f"\n==== {passed}/{len(results)} verificacoes passaram ====")
sys.exit(0 if passed == len(results) else 1)
