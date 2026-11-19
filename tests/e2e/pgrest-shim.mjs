// Emulador minimo do PostgREST (protocolo que o supabase-js fala), sobre
// Postgres real (PGlite). Cobre exatamente o que o AXYSBOT usa.
import http from "node:http";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const PORT = Number(process.env.SHIM_PORT ?? 54321);
const SECRET = process.env.SHIM_KEY ?? "chave-de-teste";
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
const schema = readFileSync(process.argv[2], "utf8").replace(/create extension if not exists "pgcrypto";/, "").replace(/notify pgrst, 'reload schema';/, "");
await db.exec(schema);

// FKs do schema public, para os "embeds"
const fks = (await db.query(`
  select cl.relname as from_t, a.attname as from_c, rcl.relname as to_t, ra.attname as to_c
  from pg_constraint c
  join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace and n.nspname='public'
  join pg_class rcl on rcl.oid=c.confrelid
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  join pg_attribute ra on ra.attrelid=c.confrelid and ra.attnum=c.confkey[1]
  where c.contype='f'`)).rows;
const pks = Object.fromEntries((await db.query(`
  select cl.relname t, string_agg(a.attname, ',' order by a.attnum) cols from pg_index i
  join pg_class cl on cl.oid=i.indrelid join pg_namespace n on n.oid=cl.relnamespace and n.nspname='public'
  join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey) where i.indisprimary group by cl.relname`)).rows.map((r) => [r.t, r.cols.split(",")]));

const ID = /^[a-z_][a-z0-9_]*$/;
const q = (id) => { if (!ID.test(id)) throw httpErr(400, "PGRST100", `identificador invalido: ${id}`); return `"${id}"`; };
function httpErr(status, code, message) { const e = new Error(message); e.status = status; e.code = code; return e; }

// ---------- select=a,b,alias:rel!inner(x,y)
function parseSelect(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s ?? "*") {
    if (ch === "(") depth++; if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((tok) => {
    tok = tok.trim();
    const m = tok.match(/^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(!inner)?\((.*)\)$/s);
    if (m) return { embed: true, alias: m[1] ?? m[2], rel: m[2], inner: !!m[3], cols: parseSelect(m[4]) };
    return tok === "*" ? { star: true } : { col: tok };
  });
}

// ---------- filtros col=op.valor
function filterSql(col, raw, params, alias) {
  const c = `${alias}.${q(col)}`;
  let neg = false, v = raw;
  if (v.startsWith("not.")) { neg = true; v = v.slice(4); }
  const dot = v.indexOf("."); const op = v.slice(0, dot), val = v.slice(dot + 1);
  let sql;
  if (op === "is") sql = `${c} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`;
  else if (op === "in") { params.push(val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""))); sql = `${c}::text = any($${params.length}::text[])`; }
  else {
    const ops = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
    if (!ops[op]) throw httpErr(400, "PGRST100", `operador nao suportado: ${op}`);
    params.push(val); sql = `${c} ${ops[op]} $${params.length}`;
  }
  return neg ? `not (${sql})` : sql;
}

function buildSelect(table, nodes, alias, filtersByRel, params, depth = 0) {
  const parts = [], wheres = [];
  for (const n of nodes) {
    if (n.star) parts.push(`${alias}.*`);
    else if (n.col) parts.push(`${alias}.${q(n.col)}`);
    else {
      const ea = `e${depth}_${n.alias}`;
      const child = fks.find((f) => f.from_t === n.rel && f.to_t === table);  // 1:N
      const parent = fks.find((f) => f.from_t === table && f.to_t === n.rel); // N:1
      const sub = buildSelect(n.rel, n.cols, ea, filtersByRel, params, depth + 1);
      const relFilters = (filtersByRel[n.alias] ?? filtersByRel[n.rel] ?? []).map(([c, v]) => filterSql(c, v, params, ea));
      if (child) {
        const w = [`${ea}.${q(child.from_c)} = ${alias}.${q(child.to_c)}`, ...relFilters].join(" and ");
        parts.push(`coalesce((select json_agg(x) from (select ${sub} from ${q(n.rel)} ${ea} where ${w}) x), '[]'::json) as ${q(n.alias)}`);
      } else if (parent) {
        const w = [`${ea}.${q(parent.to_c)} = ${alias}.${q(parent.from_c)}`, ...relFilters].join(" and ");
        parts.push(`(select to_json(x) from (select ${sub} from ${q(n.rel)} ${ea} where ${w}) x) as ${q(n.alias)}`);
        if (n.inner) wheres.push(`exists (select 1 from ${q(n.rel)} ${ea} where ${w})`);
      } else throw httpErr(400, "PGRST200", `sem relacao entre ${table} e ${n.rel}`);
    }
  }
  if (depth === 0) return { cols: parts.join(", "), innerWheres: wheres };
  return parts.join(", ");
}

function splitParams(sp) {
  const top = [], byRel = {}, meta = {};
  for (const [k, v] of sp) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) { meta[k] = v; continue; }
    const d = k.indexOf(".");
    if (d > 0) (byRel[k.slice(0, d)] ??= []).push([k.slice(d + 1), v]); else top.push([k, v]);
  }
  return { top, byRel, meta };
}

function orderSql(order, alias) {
  if (!order) return "";
  return " order by " + order.split(",").map((o) => {
    const [c, ...mods] = o.split(".");
    const dir = mods.includes("desc") ? "desc" : "asc";
    const nulls = mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "";
    return `${alias}.${q(c)} ${dir}${nulls}`;
  }).join(", ");
}

async function handle(req, body) {
  const url = new URL(req.url, "http://x");
  const auth = req.headers["apikey"] ?? (req.headers["authorization"] ?? "").replace(/^Bearer /, "");
  if (auth !== SECRET) throw httpErr(401, "PGRST301", "chave invalida");
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  const prefer = String(req.headers["prefer"] ?? "");
  const wantsObject = String(req.headers["accept"] ?? "").includes("vnd.pgrst.object");
  const { top, byRel, meta } = splitParams(url.searchParams);
  const params = [];

  if (path.startsWith("rpc/")) {
    const fn = path.slice(4); const args = body ? JSON.parse(body) : {};
    const names = Object.keys(args);
    const call = `${q(fn)}(${names.map((n, i) => `${q(n)} => $${i + 1}`).join(", ")})`;
    const r = await db.query(`select coalesce(json_agg(r), '[]'::json) as b from ${call} r`, names.map((n) => args[n]));
    return { status: 200, json: r.rows[0].b };
  }

  const table = path; q(table);
  const where = top.map(([c, v]) => filterSql(c, v, params, "t0"));
  const method = req.method;

  if (method === "GET" || method === "HEAD") {
    const nodes = parseSelect(meta.select);
    const { cols, innerWheres } = buildSelect(table, nodes, "t0", byRel, params);
    const w = [...where, ...innerWheres];
    const whereSql = w.length ? ` where ${w.join(" and ")}` : "";
    let total = null;
    if (/count=exact/.test(prefer)) total = (await db.query(`select count(*)::int c from ${q(table)} t0${whereSql}`, params)).rows[0].c;
    if (method === "HEAD") return { status: 200, json: null, total };
    const lim = meta.limit ? ` limit ${Number(meta.limit)}` : "", off = meta.offset ? ` offset ${Number(meta.offset)}` : "";
    const r = await db.query(`select coalesce(json_agg(r), '[]'::json) b from (select ${cols} from ${q(table)} t0${whereSql}${orderSql(meta.order, "t0")}${lim}${off}) r`, params);
    return single(r.rows[0].b, wantsObject, total);
  }

  const ret = /return=representation/.test(prefer);
  const retCols = meta.select ? parseSelect(meta.select).map((n) => (n.star ? "*" : q(n.col))).join(", ") : "*";

  if (method === "POST") {
    let rows = JSON.parse(body); if (!Array.isArray(rows)) rows = [rows];
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const values = rows.map((r) => "(" + cols.map((c) => { if (!(c in r)) return "default"; params.push(r[c]); return `$${params.length}`; }).join(", ") + ")");
    let sql = `insert into ${q(table)} (${cols.map(q).join(", ")}) values ${values.join(", ")}`;
    const res = prefer.match(/resolution=(merge|ignore)-duplicates/);
    if (res) {
      const conflict = (meta.on_conflict ?? pks[table].join(",")).split(",").map((s) => q(s.trim()));
      const upd = cols.filter((c) => !conflict.includes(q(c)));
      sql += res[1] === "ignore" || !upd.length ? ` on conflict (${conflict.join(", ")}) do nothing`
        : ` on conflict (${conflict.join(", ")}) do update set ${upd.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}`;
    }
    const r = await db.query(`with w as (${sql} returning *) select coalesce(json_agg(r), '[]'::json) b from (select ${retCols} from w) r`, params);
    return ret ? single(r.rows[0].b, wantsObject, null, 201) : { status: 201, json: null };
  }
  if (method === "PATCH") {
    const patch = JSON.parse(body); const set = Object.keys(patch).map((c) => { params.push(patch[c]); return `${q(c)} = $${params.length}`; });
    const r = await db.query(`with w as (update ${q(table)} t0 set ${set.join(", ")}${where.length ? " where " + where.join(" and ") : ""} returning t0.*) select coalesce(json_agg(r), '[]'::json) b from (select ${retCols} from w) r`, params);
    return ret ? single(r.rows[0].b, wantsObject) : { status: 204, json: null };
  }
  if (method === "DELETE") {
    const r = await db.query(`with w as (delete from ${q(table)} t0${where.length ? " where " + where.join(" and ") : ""} returning t0.*) select coalesce(json_agg(r), '[]'::json) b from (select ${retCols} from w) r`, params);
    return ret ? single(r.rows[0].b, wantsObject) : { status: 204, json: null };
  }
  throw httpErr(405, "PGRST105", "metodo nao suportado");
}

function single(rows, wantsObject, total = null, status = 200) {
  if (!wantsObject) return { status, json: rows, total };
  if (rows.length !== 1) throw httpErr(406, "PGRST116", "JSON object requested, multiple (or no) rows returned");
  return { status, json: rows[0], total };
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const out = await handle(req, body);
      const h = { "content-type": "application/json" };
      if (out.total != null) h["content-range"] = `*/${out.total}`;
      res.writeHead(out.status, h);
      res.end(out.json == null ? "" : JSON.stringify(out.json));
    } catch (e) {
      const status = e.status ?? (e.code === "23505" ? 409 : 400);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: e.code ?? "PGRST000", message: e.message, details: e.detail ?? null, hint: null }));
      if (!e.status) console.error("[shim] SQL erro:", e.message);
    }
  });
}).listen(PORT, () => console.log(`[shim] PostgREST emulado em http://127.0.0.1:${PORT}/rest/v1`));

// helper para os testes: SQL direto
http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", async () => {
    try { const r = await db.query(b); res.end(JSON.stringify(r.rows, (k, v) => (typeof v === "bigint" ? Number(v) : v))); }
    catch (e) { res.writeHead(400); res.end(e.message); }
  });
}).listen(PORT + 1);
