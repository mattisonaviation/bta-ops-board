/* Airport analysis (APG) for N282BT. Reports live in apg/ as AES-256-GCM files (12-byte IV + ciphertext).
   Only logins whose encrypted entry carries the airports key ("a") can open them; everyone else never sees this. */
let APGK = null; const APG = {index: null, err: "", saved: null, q: "", busy: false};
const APG_CACHE = "bta-ops-v1";
async function apgOpenBuf(buf) {
  const k = await crypto.subtle.importKey("raw", b64d(APGK), "AES-GCM", false, ["decrypt"]);
  const b = new Uint8Array(buf);
  return new Uint8Array(await crypto.subtle.decrypt({name: "AES-GCM", iv: b.subarray(0, 12)}, k, b.subarray(12)));
}
async function apgFetch(url) {
  let r = null;
  try { r = await fetch(url, {cache: "no-cache"}); } catch (x) { r = null; }
  if (!r || !r.ok) { try { const c = await caches.open(APG_CACHE); r = await c.match(url, {ignoreSearch: true}); } catch (x) { r = null; } }
  if (!r || !r.ok) throw new Error("offline");
  return r.arrayBuffer();
}
async function apgBoot() {
  if (!APGK) return;
  try { APG.index = JSON.parse(new TextDecoder().decode(await apgOpenBuf(await apgFetch("apg/index.bin")))); APG.err = ""; }
  catch (x) { APG.err = x.message === "offline" ? "Couldn't load the airport list. Connect once to download it." : "Couldn't open the airport list."; }
  scheduleRender();
  apgSaveAll();
}
/* Download every report (and the PDF viewer) so the service worker keeps a copy for offline use. */
async function apgSaveAll() {
  if (!APG.index || APG.busy) return;
  APG.busy = true;
  const files = [...APG.index.airports.map(a => a.file), "vendor/pdf.min.mjs", "vendor/pdf.worker.min.mjs"];
  let have = 0;
  let c = null; try { c = await caches.open(APG_CACHE); } catch (x) {}
  for (const f of files) {
    let ok = false;
    if (c) { try { ok = !!(await c.match(f, {ignoreSearch: true})); } catch (x) {} }
    if (!ok && navigator.onLine !== false) {
      try { const r = await fetch(f); if (r.ok) { if (c) await c.put(f, r.clone()); ok = true; } } catch (x) {}
    }
    if (ok) have++;
    APG.saved = {have, total: files.length};
    if (ui.tab === "airports" || ui.tab === "home") scheduleRender();
  }
  APG.busy = false; scheduleRender();
}
const apgRecent = a => { const d = parse(a.date); return !!d && (!APG.index || !APG.index.baseline || a.date > APG.index.baseline) && (TODAY - d) / 864e5 <= 30; };
function apgTile() {
  if (!APGK) return "";
  const ix = APG.index, n = ix ? ix.airports.length : 0, upd = ix ? ix.airports.filter(apgRecent) : [];
  const sv = APG.saved, all = sv && sv.have === sv.total;
  const foot = APG.err ? esc(APG.err) : !ix ? "Loading…" : `${all ? "All saved on this device" : sv ? `Saving for offline ${sv.have}/${sv.total}` : "Checking offline copies…"}${upd.length ? ` · updated: ${esc(upd.slice(0, 3).map(a => a.icao).join(", "))}${upd.length > 3 ? ` +${upd.length - 3}` : ""}` : ""} · testing (only you)`;
  return `<button type="button" class="tile ${upd.length ? "warn" : "acc"}" data-tab="airports"><div class="tile-h"><span class="ico">${ICON.plane}</span>Airports</div><div class="tile-b"><span class="big">${n || "—"}</span></div><div class="tile-f">${foot}</div></button>`;
}
function viewAirports() {
  if (!APGK) return `<section class="panel"><p class="hint">Airport analysis isn't available for this login.</p></section>`;
  const ix = APG.index;
  if (!ix) return `<section class="panel"><div class="panel-h"><h2>Airport analysis</h2><button class="btn sm" data-tab="home">Home</button></div><p class="hint">${esc(APG.err || "Loading…")}</p></section>`;
  const q = APG.q.trim().toUpperCase();
  const match = a => !q || (a.icao + " " + a.city + " " + a.name).toUpperCase().includes(q);
  const list = ix.airports.filter(match).sort((a, b) => (apgRecent(b) - apgRecent(a)) || a.icao.localeCompare(b.icao));
  const sv = APG.saved;
  return `<section class="panel">
    <div class="panel-h"><h2>Airport analysis</h2><button class="btn sm" data-tab="home">Home</button></div>
    <p class="hint">APG takeoff and landing analysis for ${esc(ix.aircraft || "N282BT")}. ${ix.airports.length} airports, list updated ${esc(fmtS(new Date(ix.at)))}. ${sv ? (sv.have === sv.total ? "All reports are saved on this device and open without signal." : `Saving for offline: ${sv.have} of ${sv.total}.`) : ""} Testing: only your login can see this.</p>
    <input class="apg-q" id="apg-q" type="search" placeholder="Search ICAO, city or name" value="${esc(APG.q)}" autocomplete="off" autocapitalize="characters">
    <div class="apg-list">${list.map(a => `<button type="button" class="apg-row" data-apg="${esc(a.icao)}"><b>${esc(a.icao)}</b><span class="nm">${esc(a.name || a.city)}<br><span class="sub">${esc(a.city)} · ${a.pages} page${a.pages === 1 ? "" : "s"} · ${esc(fmtS(parse(a.date)))}</span></span>${apgRecent(a) ? chip("warn", "Updated") : ""}</button>`).join("")}
    ${!q ? (ix.missing || []).map(m => `<div class="apg-row none"><b>${esc(m.icao)}</b><span class="nm"><span class="sub">${esc(m.reason)}</span></span><span></span></div>`).join("") : ""}</div>
  </section>`;
}
let apgPdfLib = null, apgUrl = null;
async function apgShow(icao) {
  const a = APG.index && APG.index.airports.find(x => x.icao === icao); if (!a) return;
  const v = document.createElement("div"); v.className = "apg-v"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", icao + " airport analysis");
  v.innerHTML = `<div class="apg-vh"><button type="button" class="btn sm" data-apg-close>Back</button><span class="t">${esc(icao)} · ${esc(a.name || a.city)} · ${esc(fmtS(parse(a.date)))}</span><button type="button" class="btn sm" data-apg-share>Share</button></div><div class="apg-vb"><p class="hint">Opening…</p></div>`;
  document.body.appendChild(v);
  const body = v.querySelector(".apg-vb");
  let pdf;
  try { pdf = await apgOpenBuf(await apgFetch(a.file)); }
  catch (x) { body.innerHTML = `<p class="hint">${x.message === "offline" ? "This report isn't saved on this device yet. Connect once to download it." : "Couldn't open this report."}</p>`; return; }
  const file = new File([pdf], `${icao}_SD3-60_N282BT_${a.date}.pdf`, {type: "application/pdf"});
  v._file = file;
  try {
    if (!apgPdfLib) { apgPdfLib = await import(new URL("vendor/pdf.min.mjs", location.href).href); apgPdfLib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", location.href).href; }
    const doc = await apgPdfLib.getDocument({data: pdf.slice()}).promise;
    body.innerHTML = "";
    const w = Math.min(body.clientWidth - 20, 900), dpr = Math.min((window.devicePixelRatio || 1) * 2, 4);
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i), vp1 = pg.getViewport({scale: 1}), sc = w / vp1.width, vp = pg.getViewport({scale: sc * dpr});
      const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; cv.style.width = Math.round(vp.width / dpr) + "px";
      body.appendChild(cv);
      await pg.render({canvasContext: cv.getContext("2d"), viewport: vp}).promise;
    }
  } catch (x) {
    if (apgUrl) URL.revokeObjectURL(apgUrl);
    apgUrl = URL.createObjectURL(file);
    body.innerHTML = `<iframe title="${esc(icao)} report" src="${apgUrl}"></iframe>`;
  }
}
document.addEventListener("click", async e => {
  const r = e.target.closest("[data-apg]"); if (r) { apgShow(r.dataset.apg); return; }
  if (e.target.closest("[data-apg-close]")) { const v = e.target.closest(".apg-v"); if (v) v.remove(); return; }
  if (e.target.closest("[data-apg-share]")) {
    const v = e.target.closest(".apg-v"), f = v && v._file; if (!f) return;
    try { if (navigator.canShare && navigator.canShare({files: [f]})) { await navigator.share({files: [f], title: f.name}); return; } } catch (x) { if (x && x.name === "AbortError") return; }
    const u = URL.createObjectURL(f), l = document.createElement("a"); l.href = u; l.download = f.name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
});
document.addEventListener("input", e => { if (e.target.id === "apg-q") { APG.q = e.target.value; scheduleRender(); } });
addEventListener("online", () => { if (APGK) apgBoot(); });
/* Quick Quote (business development estimates). Encrypted at quote/quote.bin with its own key ("q"),
   given only to the logins on the build's quote list; opens full screen and works offline. */
let QQK = null;
async function qqOpenBuf(buf) {
  const k = await crypto.subtle.importKey("raw", b64d(QQK), "AES-GCM", false, ["decrypt"]);
  const b = new Uint8Array(buf);
  return new Uint8Array(await crypto.subtle.decrypt({name: "AES-GCM", iv: b.subarray(0, 12)}, k, b.subarray(12)));
}
async function qqBoot() {
  if (!QQK) return;
  try { const c = await caches.open(APG_CACHE); if (!(await c.match("quote/quote.bin", {ignoreSearch: true})) && navigator.onLine !== false) { const r = await fetch("quote/quote.bin"); if (r.ok) await c.put("quote/quote.bin", r); } } catch (x) {}
}
function qqTile() {
  if (!QQK) return "";
  return `<button type="button" class="tile acc" data-qq="1"><div class="tile-h"><span class="ico">${ICON.cal}</span>Quick Quote</div><div class="tile-b"><span class="big" style="font:600 17px/1.3 var(--f-display)">Estimate a trip</span></div><div class="tile-f">Block time, fuel, trips and duty days · only you</div></button>`;
}
async function qqShow() {
  const v = document.createElement("div"); v.className = "apg-v"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", "Quick Quote");
  v.innerHTML = `<div class="apg-vh"><button type="button" class="btn sm" data-apg-close>Back</button><span class="t">Quick Quote</span></div><div class="apg-vb" style="padding:0;display:block"><p class="hint" style="padding:10px">Opening…</p></div>`;
  document.body.appendChild(v);
  const body = v.querySelector(".apg-vb");
  try {
    const html = new TextDecoder().decode(await qqOpenBuf(await apgFetch("quote/quote.bin")));
    const f = document.createElement("iframe"); f.title = "Quick Quote"; f.setAttribute("allow", "clipboard-write"); f.style.cssText = "width:100%;height:100%;border:0;display:block;background:#f4f6f9";
    f.srcdoc = html; body.innerHTML = ""; body.appendChild(f);
  } catch (x) { body.innerHTML = `<p class="hint" style="padding:10px">${x.message === "offline" ? "Quick Quote isn't saved on this device yet. Connect once to download it." : "Couldn't open Quick Quote."}</p>`; }
}
document.addEventListener("click", e => { if (e.target.closest("[data-qq]")) qqShow(); });
/* Check Ride (check airman tool). Encrypted at checkride/*.bin with its own key ("k"), given only to the logins on
   the build's check-ride list. The app opens full screen, works offline and keeps its checks and photos on the device.
   The blank JLI forms are decrypted here and handed to the app; the key never enters the app's page. */
let CKK = null;
const CK_FILES = ["checkride/app.bin", "checkride/tr2.bin", "checkride/tr6.bin", "checkride/tr7.bin", "vendor/pdf-lib.min.js"];
async function ckOpenBuf(buf) {
  const k = await crypto.subtle.importKey("raw", b64d(CKK), "AES-GCM", false, ["decrypt"]);
  const b = new Uint8Array(buf);
  return new Uint8Array(await crypto.subtle.decrypt({name: "AES-GCM", iv: b.subarray(0, 12)}, k, b.subarray(12)));
}
async function ckBoot() {
  if (!CKK) return;
  let c = null; try { c = await caches.open(APG_CACHE); } catch (x) {}
  for (const f of CK_FILES) {
    try { if (c && !(await c.match(f, {ignoreSearch: true})) && navigator.onLine !== false) { const r = await fetch(f); if (r.ok) await c.put(f, r); } } catch (x) {}
  }
}
window.__ckLoad = async name => { if (!CKK || !/^tr[267]$/.test(name)) throw new Error("not available"); return ckOpenBuf(await apgFetch("checkride/" + name + ".bin")); };
window.__ckData = () => { try { return {pilots: (SNAP && SNAP.pilots) || [], training: (SNAP && SNAP.training) || []}; } catch (x) { return {pilots: [], training: []}; } };
function ckTile() {
  if (!CKK) return "";
  return `<button type="button" class="tile acc" data-ck="1"><div class="tile-h"><span class="ico">${ICON.train}</span>Check Ride</div><div class="tile-b"><span class="big" style="font:600 17px/1.3 var(--f-display)">Run a check</span></div><div class="tile-f">135.293 · 297 · 299, briefings, grading, JLI forms · only you</div></button>`;
}
async function ckShow() {
  const v = document.createElement("div"); v.className = "apg-v"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", "Check Ride");
  v.innerHTML = `<div class="apg-vh"><button type="button" class="btn sm" data-apg-close>Back</button><span class="t">Check Ride</span></div><div class="apg-vb" style="padding:0;display:block"><p class="hint" style="padding:10px">Opening…</p></div>`;
  document.body.appendChild(v);
  const body = v.querySelector(".apg-vb");
  try {
    const html = new TextDecoder().decode(await ckOpenBuf(await apgFetch("checkride/app.bin")));
    const f = document.createElement("iframe"); f.title = "Check Ride"; f.setAttribute("allow", "web-share; clipboard-write; camera"); f.style.cssText = "width:100%;height:100%;border:0;display:block;background:#f4f6f9";
    f.srcdoc = html; body.innerHTML = ""; body.appendChild(f);
  } catch (x) { body.innerHTML = `<p class="hint" style="padding:10px">${x.message === "offline" ? "Check Ride isn't saved on this device yet. Connect once to download it." : "Couldn't open Check Ride."}</p>`; }
}
document.addEventListener("click", e => { if (e.target.closest("[data-ck]")) ckShow(); });
addEventListener("online", () => { if (CKK) ckBoot(); });
