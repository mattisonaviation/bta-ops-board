// Usage: node build_public.mjs <board.html> <snapdir> <out.html> [<moduledir>] [<features.json>]
// Builds the crew-site page with the board data encrypted (format v2).
// - A shared blob (schedule, events, maintenance, squawks; pilots without contact details or notes).
// - Training blobs: "all" (everyone's training and full pilot records) and one per person (their own).
// Each active login in <snapdir>/crewAuth unwraps the shared key plus the key to ONE training blob:
// "all" when access is "all", otherwise their own pilotId's blob. crewAuth itself is never published;
// each person's own document-folder link travels only inside their own encrypted login entry.
// Private tools: Airport analysis (APG, encrypted files in apg/), Quick Quote (quote/quote.bin) and Check Ride (checkride/*.bin)
// each have their own key. Only the usernames in APG.users / QUOTE.users / CHECK.users get that key inside their own encrypted
// login entry, and only their page shows the tile. The page code for them comes from <moduledir> (the repository's build/ folder):
// apg_module.css.html and apg_module.js.
// Feature switches: <features.json> holds the "Feature access" sheet ({access: rows, sheet: url}); rows with ID "group" define groups. Each login gets,
// inside its own encrypted entry, a key for every feature switched on for it (directly or through a group); the key for feature X is
// HMAC-SHA256(FEAT.key, "bta-feature:" + X) and also opens features/X.bin. The page code is build/feat_module.js and
// feat_module.css.html. Without the sheet or the module files, no features are switched on.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APG = {key: "__APG_KEY__", users: ["matt"]};
const QUOTE = {key: "__QUOTE_KEY__", users: ["matt", "derek"]};
const CHECK = {key: "__CHECK_KEY__", users: ["matt"]};
// The feature master key is derived from the airports key, so it needs no secret of its own.
const FEAT = {key: crypto.createHmac("sha256", Buffer.from(APG.key, "base64")).update("bta-feature-master").digest("base64")};
const PRIV = {a: APG, q: QUOTE, k: CHECK}; // wrapped-key field in a login entry -> {key, users}
const PRIV_NAME = {a: "airports", q: "quote", k: "checkride"};
// Parts & inventory tile (a link to the BTA Parts page on claude.ai): these usernames always get it, and so does anyone
// whose crewAuth entry has parts "yes" or "#parts" in its Notes, or who has the "parts" feature switched on in the sheet.
const PARTS = {users: ["matt", "derek"]};

const [tpl, snapdir, out, moddir, featPath] = process.argv.slice(2);
if (!tpl || !snapdir || !out) { console.error("usage: node build_public.mjs <board.html> <snapdir> <out.html> [<moduledir>] [<features.json>]"); process.exit(2); }
const COMMON = ["pilots", "rotations", "flights", "events", "mxPlan", "squawks", "meta", "mxItems", "squawkReports"];
const SKIP_META = new Set(["formsSync", "mxSync", "sync"]);
const readColl = c => {
  const d = path.join(snapdir, c);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith(".json")).sort().map(f => ({id: f.slice(0, -5), ...JSON.parse(fs.readFileSync(path.join(d, f), "utf8"))}));
};
const pilotsFull = readColl("pilots");
if (!pilotsFull.length) { console.error("STOP: no pilots in snapshot"); process.exit(1); }
const training = readColl("training");
const metaAll = readColl("meta");
const mxSync = metaAll.find(r => r.id === "mxSync") || {};

const data = {at: new Date().toISOString(), veryonChecked: mxSync.veryonChecked || mxSync.dailyChecksDate || null};
for (const c of COMMON) data[c] = c === "meta" ? metaAll.filter(r => !SKIP_META.has(r.id)) : readColl(c);
data.pilots = pilotsFull.map(p => ({id: p.id, name: p.name, seat: p.seat, homeBase: p.homeBase || ""}));

const users = readColl("crewAuth").filter(u => u.active !== "no" && u.username && u.password);
if (!users.length) { console.error("STOP: no active crew logins in crewAuth"); process.exit(1); }

const IT = 250000;
const b64 = b => Buffer.from(b).toString("base64");
const gcm = (key, plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  return {iv: b64(iv), ct: b64(ct)};
};
const enc = (key, obj) => gcm(key, Buffer.from(JSON.stringify(obj), "utf8"));

// Page code: patch the template only if every hook is found; otherwise leave the tools (and features) out.
let html = fs.readFileSync(tpl, "utf8");
const HERE = moddir || path.dirname(new URL(import.meta.url).pathname);
const cssPath = path.join(HERE, "apg_module.css.html"), jsPath = path.join(HERE, "apg_module.js");
const fcssPath = path.join(HERE, "feat_module.css.html"), fjsPath = path.join(HERE, "feat_module.js");
const BOOT = "/* ---------- boot ---------- */";
const HOOKS1 = [
  ["return {data, me: w.me || null};", "return {data, me: w.me || null, apg: w.a || null, qk: w.q || null, ck: w.k || null};"],
  ["SNAP = r.data; ME = r.me || null;", "SNAP = r.data; ME = r.me || null; APGK = r.apg || null; QQK = r.qk || null; CKK = r.ck || null; if (APGK) apgBoot(); if (QQK) qqBoot(); if (CKK) ckBoot();"],
  ['const TABS = ["home", "schedule", "training", "maintenance", "squawks", "logins"];', 'const TABS = ["home", "schedule", "training", "maintenance", "squawks", "logins", "airports"];'],
  ["logins:viewLogins}", "logins:viewLogins, airports:viewAirports}"],
  ['${actions.join("")}', '${apgTile()}${qqTile()}${ckTile()}${ptTile()}${actions.join("")}']
];
const HOOKS2 = [
  ["return {data, me: w.me || null};", "return {data, me: w.me || null, apg: w.a || null, qk: w.q || null, ck: w.k || null, fk: w.f || null, fa: w.fa || null};"],
  ["SNAP = r.data; ME = r.me || null;", "SNAP = r.data; ME = r.me || null; APGK = r.apg || null; QQK = r.qk || null; CKK = r.ck || null; FK = r.fk || null; FA = r.fa || null; if (APGK) apgBoot(); if (QQK) qqBoot(); if (CKK) ckBoot(); if (FK) ftBoot();"],
  ['const TABS = ["home", "schedule", "training", "maintenance", "squawks", "logins"];', 'const TABS = ["home", "schedule", "training", "maintenance", "squawks", "logins", "airports", "tools"];'],
  ["logins:viewLogins}", "logins:viewLogins, airports:viewAirports, tools:viewTools}"],
  ['${actions.join("")}', '${ftTiles()}${apgTile()}${qqTile()}${ckTile()}${ptTile()}${actions.join("")}'],
  ['$("#view").innerHTML = v();', '$("#view").innerHTML = ftWrap(ui.tab, v());']
];
const featCode = fs.existsSync(fcssPath) && fs.existsSync(fjsPath) && fs.readFileSync(fjsPath, "utf8").includes("function ftWrap");
const once = a => html.split(a).length === 2;
const mainAt = html.lastIndexOf("<script>", html.indexOf("const COLLS = "));
let apgOn = Object.values(PRIV).some(p => p.users.length > 0) && mainAt > 0 && fs.existsSync(cssPath) && fs.existsSync(jsPath) && !html.includes('id="apg-css"') && html.split(BOOT).length === 2 && HOOKS1.every(([a]) => once(a));
if (apgOn && !["function ckTile", "function ptTile"].every(f => fs.readFileSync(jsPath, "utf8").includes(f))) { console.log("checkride/parts: page code missing from apg_module.js; private tools off"); apgOn = false; }
let featOn = apgOn && featCode && HOOKS2.every(([a]) => once(a)) && Buffer.from(FEAT.key, "base64").length === 32;
if (apgOn) {
  for (const [a, b] of (featOn ? HOOKS2 : HOOKS1)) html = html.replace(a, () => b);
  // The board's code runs inside one function, so the private-tool code goes inside it, just before boot.
  html = html.replace(BOOT, () => fs.readFileSync(jsPath, "utf8") + "\n" + (featOn ? fs.readFileSync(fjsPath, "utf8") + "\n" : "") + BOOT);
  const j = html.lastIndexOf("<script>", html.indexOf("const COLLS = "));
  html = html.slice(0, j) + fs.readFileSync(cssPath, "utf8") + (featOn ? fs.readFileSync(fcssPath, "utf8") : "") + html.slice(j);
} else console.log("airports: skipped (hooks or apg_module files missing; private tools off)");
if (apgOn && !featOn) console.log("features: page code or hooks missing; features off");
for (const p of Object.values(PRIV)) if (Buffer.from(p.key, "base64").length !== 32) { console.error("STOP: bad private-tool key"); process.exit(1); }

// Feature access from the sheet.
let FEATS = null; // {ids, sheet, at, of(user) -> [ids]}
if (featOn) {
  try {
    const fj = featPath && fs.existsSync(featPath) ? JSON.parse(fs.readFileSync(featPath, "utf8")) : null;
    if (!fj || !Array.isArray(fj.access) || !fj.access.length) throw new Error("no sheet data");
    const norm = s => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const truthy = v => /^(true|yes|y|x|✓|✔|1|on)$/i.test(String(v ?? "").trim());
    const hi = fj.access.findIndex(r => Array.isArray(r) && r.map(norm).includes("id"));
    if (hi < 0) throw new Error("no ID column");
    fj.access = fj.access.slice(hi);
    const head = fj.access[0].map(norm), idCol = head.indexOf("id");
    const SKIPH = new Set(["feature", "id", "group", "section", "notes", "note", "status", ""]);
    // Groups: rows whose ID is "group" (column A = group name; TRUE under each member's column), or an optional Groups list.
    const groups = new Map();
    for (const r of fj.access.slice(1)) if (r && norm(r[idCol]) === "group" && r[0]) groups.set(norm(r[0]), head.map((h, c) => truthy(r[c]) && !SKIPH.has(h) ? h : null).filter(Boolean));
    for (const r of (fj.groups || []).slice(1)) if (r && r[0]) groups.set(norm(r[0]), String(r[1] || "").split(/[,;\n]/).map(norm).filter(Boolean));
    const rows = fj.access.slice(1).filter(r => r && norm(r[idCol]) !== "group" && /^[a-z0-9]{2,20}$/.test(String(r[idCol] || "").trim()));
    const ids = rows.map(r => String(r[idCol]).trim());
    const tokens = x => { const n = norm(x.name), p = pilotsFull.find(q => q.id === x.pilotId); const pn = p ? norm(p.name) : ""; return new Set([norm(x.username), n, n.split(" ")[0], pn, pn.split(" ")[0]].filter(Boolean)); };
    const colMatch = (h, tk) => h === "everyone" || h === "all" || (groups.has(h) ? groups.get(h).some(m => tk.has(m)) : tk.has(h));
    FEATS = {ids, sheet: /^https:\/\/docs\.google\.com\//.test(fj.sheet || "") ? fj.sheet : "", at: new Date().toISOString(),
      of: x => { const tk = tokens(x); return rows.filter(r => head.some((h, c) => !SKIPH.has(h) && truthy(r[c]) && colMatch(h, tk))).map(r => String(r[idCol]).trim()); }};
  } catch (e) { console.log("features: sheet not usable (" + e.message + "); features off"); FEATS = null; }
}
const fkey = id => crypto.createHmac("sha256", Buffer.from(FEAT.key, "base64")).update("bta-feature:" + id).digest();

const kC = crypto.randomBytes(32);
const blobs = {all: {key: crypto.randomBytes(32), body: {training, pilots: pilotsFull}}};
for (const p of pilotsFull) blobs[p.id] = {key: crypto.randomBytes(32), body: {training: training.filter(t => t.pilotId === p.id), pilots: [p]}};

const u = {}, used = new Set(), summary = [], featBy = [];
for (const x of users) {
  const name = String(x.username).toLowerCase().replace(/\s+/g, "");
  const tb = x.access === "all" ? "all" : (x.pilotId && blobs[x.pilotId] ? x.pilotId : null);
  if (tb) used.add(tb);
  const feats = FEATS ? FEATS.of(x) : [];
  featBy.push({x, name, feats});
}
const faTable = FEATS ? {at: FEATS.at, sheet: FEATS.sheet, features: FEATS.ids, users: featBy.map(f => ({name: f.x.name || f.name, f: f.feats}))} : null;
for (const {x, name, feats} of featBy) {
  const tb = x.access === "all" ? "all" : (x.pilotId && blobs[x.pilotId] ? x.pilotId : null);
  const me = {name: x.name || name, pilotId: x.pilotId || null, access: x.access === "all" ? "all" : "own", docsLink: /^https:\/\//.test(x.docsLink || "") ? x.docsLink : "", parts: PARTS.users.includes(name) || x.parts === "yes" || /#parts\b/i.test(String(x.notes || "")) || feats.includes("parts")};
  const wrapped = {c: b64(kC), me};
  if (tb) { wrapped.t = b64(blobs[tb].key); wrapped.tb = tb; }
  const extra = [];
  if (apgOn) for (const [f, p] of Object.entries(PRIV)) if (p.users.includes(name)) { wrapped[f] = p.key; extra.push(PRIV_NAME[f]); }
  if (feats.length) { wrapped.f = Object.fromEntries(feats.map(id => [id, b64(fkey(id))])); extra.push("features:" + feats.length); }
  if (feats.includes("access") && faTable) wrapped.fa = faTable;
  const salt = x.salt || b64(crypto.createHash("sha256").update("bta-salt:" + name).digest().subarray(0, 16));
  const kek = crypto.pbkdf2Sync(String(x.password), Buffer.from(salt, "base64"), IT, 32, "sha256");
  const w = enc(kek, wrapped);
  const h = crypto.createHash("sha256").update("bta-user:" + name).digest("hex").slice(0, 16);
  u[h] = {s: salt, iv: w.iv, k: w.ct};
  if (me.parts) extra.push("parts");
  summary.push(`${name}:${tb || "none"}${extra.map(e => "+" + e).join("")}`);
}
const t = {};
for (const k of used) t[k] = enc(blobs[k].key, blobs[k].body);
const blob = JSON.stringify({v: 2, it: IT, u, c: enc(kC, data), t});

html = html.replace(/<script id="snapshot(-enc)?" type="application\/json">[\s\S]*?<\/script>\n?/g, "");
const i = html.lastIndexOf("<script>");
if (i < 0) { console.error("STOP: template has no <script>"); process.exit(1); }
html = html.slice(0, i) + `<script id="snapshot-enc" type="application/json">${blob}</script>\n` + html.slice(i);
html = html.replace("<title>Blue Tide Ops Board</title>", "<title>BTA Ops Board</title>");

// Install as an app: manifest, icons and service worker (files live in the repository).
const HEAD = `<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#0A3976"><link rel="icon" type="image/png" href="icons/favicon.png"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="BTA Ops"><meta name="apple-mobile-web-app-status-bar-style" content="default">`;
const SW = `<script>if("serviceWorker" in navigator&&location.protocol==="https:"){addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){})})}</script>`;
if (!/^\s*<!doctype/i.test(html)) html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><style>body{margin:0}</style></head><body>\n${html}\n</body></html>\n`;
if (!html.includes('rel="manifest"')) html = html.replace(/<head>/i, m => m + HEAD);
if (!html.includes('serviceWorker.register')) html = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, SW + "</body>");
if (!/<head>[\s\S]*rel="manifest"[\s\S]*<\/head>/i.test(html)) { console.error("STOP: app tags not in <head>"); process.exit(1); }

// Safety: no plain snapshot, no passwords, no keys, no training, contact or folder-link fields in clear text.
if (html.includes('id="snapshot"')) { console.error("STOP: plain snapshot present"); process.exit(1); }
for (const p of Object.values(PRIV)) if (html.includes(p.key)) { console.error("STOP: a private-tool key appears in the page"); process.exit(1); }
if (html.includes(FEAT.key)) { console.error("STOP: the feature key appears in the page"); process.exit(1); }
if (FEATS) for (const id of FEATS.ids) if (html.includes(b64(fkey(id)))) { console.error("STOP: a feature key appears in the page"); process.exit(1); }
for (const x of users) if (html.includes(String(x.password))) { console.error("STOP: a password appears in the page"); process.exit(1); }
for (const x of users) if (x.docsLink && html.includes(String(x.docsLink))) { console.error("STOP: a document folder link appears in the page"); process.exit(1); }
for (const marker of ['"lastDone":', '"graceEnds":', '"contact":']) if (html.includes(marker)) { console.error("STOP: unencrypted field " + marker + " in the page"); process.exit(1); }
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, html, "utf8");
console.log("built", out, html.length, "logins:", users.length, summary.join(" "), Object.fromEntries(COMMON.map(c => [c, data[c].length])), "training:", training.length, "private tools:", apgOn ? "on" : "off", "features:", FEATS ? `on (${FEATS.ids.length} in sheet)` : "off");
