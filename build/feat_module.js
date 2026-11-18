/* ---------- Feature switches (testing) ----------
   Each feature has an id. The build gives a login the key for every feature switched on for that person (directly or
   through a group) in the "BTA Ops Board – Feature access" sheet, inside their own encrypted login entry (field "f").
   A feature shows only when its key is present. Features with content (destination guide, cards…) keep it in
   features/<id>.bin, encrypted with that feature's own key. Entries marked "this device" save on the phone only;
   shared entries arrive with the BTA App's database. */
let FK = null, FA = null;
const FT_DATA = {}, FT_ERR = {};
const ftOn = id => !!(FK && FK[id]);
const FT_FILES = {dest: "features/dest.bin", cards: "features/cards.bin", load: "features/load.bin", upgrade: "features/upgrade.bin", emph: "features/emph.bin", manuals: "features/manuals.bin", slides: "features/slides.bin"};
const FT_GROUPS = ["Trips", "Crew & training", "Maintenance", "Business", "Board layout", "Admin"];
const FT_LIST = [
  {id: "trip", g: "Trips", name: "Trip status", desc: "Upcoming trips, crew on those days and the FlightAware link", ico: "plane"},
  {id: "flog", g: "Trips", name: "Flight log", desc: "Out/Off/On/In, fuel, approaches, delays; block, flight, burn and duty", ico: "cal", local: 1, ph: "Fields will be matched to the Form 113"},
  {id: "req", g: "Trips", name: "Trip request to JLI", desc: "Route, cargo, hazmat and passengers, written up as an email", ico: "plane", local: 1, ph: "JLI address not set yet"},
  {id: "close", g: "Trips", name: "Trip close-out", desc: "Documents to gather and the JetInsight close-out reminder", ico: "train", local: 1},
  {id: "load", g: "Trips", name: "Load planning", desc: "Weight and balance worksheet with N282BT's limits", ico: "mx", local: 1, ph: "Arms and CG envelope to confirm with Nick"},
  {id: "dest", g: "Trips", name: "Destination guide", desc: "One page per airport: runway, fuel, entry, handling, contacts, notes", ico: "plane", ph: "Handling and contacts not entered yet"},
  {id: "cards", g: "Trips", name: "Cockpit cards", desc: "Speeds, flap limits, weights and power settings", ico: "plane", ph: "Power settings not entered yet"},
  {id: "grid", g: "Crew & training", name: "Training grid", desc: "Everyone's training at a glance, with Legal to fly today", ico: "train"},
  {id: "hazmat", g: "Crew & training", name: "Hazmat tracking", desc: "24-month recurrent, with the on-time window", ico: "train"},
  {id: "expiry", g: "Crew & training", name: "Expiration reminders", desc: "Medicals, passports and certificates at 60, 30 and 7 days", ico: "alert"},
  {id: "upgrade", g: "Crew & training", name: "Upgrade readiness", desc: "SIC to PIC checklist", ico: "train", local: 1, ph: "JLI syllabus items to add"},
  {id: "emph", g: "Crew & training", name: "Emphasis items", desc: "Short notices with check questions", ico: "alert", local: 1, ph: "Sample item; tracking comes with the app"},
  {id: "slides", g: "Crew & training", name: "Slide library", desc: "Ground-school decks, viewable offline", ico: "train", ph: "Decks not converted yet"},
  {id: "manuals", g: "Crew & training", name: "Manuals", desc: "AFM, QRH, checklists, GOM and SOPs offline", ico: "train", ph: "Not loaded yet; check with JLI first"},
  {id: "parts", g: "Maintenance", name: "Parts & inventory", desc: "Stock, locations, count and verify (BTA Parts page)", ico: "mx"},
  {id: "forecast", g: "Maintenance", name: "Maintenance forecast", desc: "What comes due, month by month", ico: "mx"},
  {id: "tasks", g: "Maintenance", name: "Recurring tasks", desc: "Monthly and weekly jobs, ticked off when done", ico: "cal", local: 1},
  {id: "exp", g: "Business", name: "Expenses & budget", desc: "Costs by trip and quarter, cost per flight hour", ico: "cal", local: 1, ph: "Receipt photos come with the app"},
  {id: "status", g: "Board layout", name: "Aircraft status strip", desc: "Status, next trip, crew on duty and data ages at the top of Home", ico: "plane", layout: 1},
  {id: "homev2", g: "Board layout", name: "Home: 2 weeks first, grouped attention", desc: "Needs attention grouped by person, top 3 first", ico: "alert", layout: 1},
  {id: "access", g: "Admin", name: "Feature access", desc: "Who has which feature", ico: "key"}
];
const ftDef = id => FT_LIST.find(f => f.id === id);
const ftMine = () => FT_LIST.filter(f => ftOn(f.id) && !f.layout);

/* storage on this device, per person */
const ftSK = id => "bta.ft." + String((ME && (ME.pilotId || ME.name)) || "me").toLowerCase().replace(/[^a-z0-9-]+/g, "") + "." + id;
function ftGet(id, def) { try { const v = JSON.parse(localStorage.getItem(ftSK(id)) || "null"); return v == null ? def : v; } catch (x) { return def; } }
function ftSet(id, v) { try { localStorage.setItem(ftSK(id), JSON.stringify(v)); } catch (x) { toast("Couldn't save on this device."); } }
const FT_ST = {};
const ftS = (id, def) => (FT_ST[id] = FT_ST[id] || ftGet(id, def));
const ftSave = id => ftSet(id, FT_ST[id]);
function ftPath(obj, path, val) {
  const ks = path.split("."); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { const k = ks[i]; if (o[k] == null || typeof o[k] !== "object") o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; }
  if (val === undefined) return o[ks[ks.length - 1]];
  o[ks[ks.length - 1]] = val;
}

/* encrypted content */
async function ftOpenBuf(id, buf) {
  const k = await crypto.subtle.importKey("raw", b64d(FK[id]), "AES-GCM", false, ["decrypt"]);
  const b = new Uint8Array(buf);
  return new Uint8Array(await crypto.subtle.decrypt({name: "AES-GCM", iv: b.subarray(0, 12)}, k, b.subarray(12)));
}
async function ftBoot() {
  if (!FK) return;
  let c = null; try { c = await caches.open(APG_CACHE); } catch (x) {}
  for (const [id, f] of Object.entries(FT_FILES)) {
    if (!ftOn(id)) continue;
    try {
      const buf = await apgFetch(f);
      if (c) { try { await c.put(f, new Response(buf.slice(0))); } catch (x) {} }
      FT_DATA[id] = JSON.parse(new TextDecoder().decode(await ftOpenBuf(id, buf))); delete FT_ERR[id];
    } catch (x) { FT_ERR[id] = x.message === "offline" ? "Not saved on this device yet. Connect once to download it." : "Couldn't open this feature's content."; }
  }
  scheduleRender();
}
addEventListener("online", () => { if (FK) ftBoot(); });

/* small helpers */
const ftChip = (st, l) => chip(st, l);
const ftNum = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : null; };
const ftMin = s => { const m = String(s || "").match(/^(\d{1,2}):?(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
const ftHm = n => n == null ? "—" : `${Math.floor(n / 60)}:${pad(n % 60)}`;
const ftDur = (a, b) => { const x = ftMin(a), y = ftMin(b); return x == null || y == null ? null : (y - x + 1440) % 1440; };
const ftNowZ = () => { const d = new Date(); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };
const ftId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ftIn = (key, v, attrs = "") => `<input id="ft-${esc(key.replace(/[^a-zA-Z0-9]/g, "-"))}" data-ft-in="${esc(key)}" value="${esc(v ?? "")}" ${attrs}>`;
const ftSel = (key, v, opts) => `<select data-ft-in="${esc(key)}">${opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(lab)}</option>`; }).join("")}</select>`;
const ftArea = (key, v, ph = "") => `<textarea data-ft-in="${esc(key)}" rows="3" placeholder="${esc(ph)}">${esc(v ?? "")}</textarea>`;
const ftField = (label, ctl, cls = "") => `<label class="ft-f ${cls}"><span>${esc(label)}</span>${ctl}</label>`;
const ftPh = t => `<div class="ft-ph">${ICON.alert}<span><b>Placeholder.</b> ${esc(t)}</span></div>`;
const ftLocal = () => `<p class="hint">Saved on this device only. Shared entries come with the BTA App.</p>`;
const FT_ACR = new Set(["AD", "ATA", "ELT", "APU", "HF", "VHF", "UHF", "NDT", "CVR", "FDR", "LH", "RH", "PT6A", "TCAS", "ADS-B", "GPS", "ILS", "VOR", "DME", "ADF", "FH", "EGPWS", "MLG", "NLG", "PCU", "IFD", "UNS", "II", "III", "IV", "N282BT"]);
const ftSentence = s => String(s || "").toLowerCase().replace(/[a-z0-9][a-z0-9\-\/]*/g, w => FT_ACR.has(w.toUpperCase()) ? w.toUpperCase() : w).replace(/^(\W*)([a-z])/, (m, a, b) => a + b.toUpperCase()).replace(/\bno\. (\d)/g, "No. $1").replace(/\b(\d)([a-z])\b/g, (m, a, b) => a + b.toUpperCase());
const ftShort = (t, n = 90) => t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t;
const ftBack = (title, extra = "") => `<div class="panel-h"><h2>${esc(title)}</h2><span class="ft-hd">${extra}<button class="btn sm" data-ft-go="">All tools</button></span></div>`;
const ftTesting = () => `<span class="chip" title="Only logins switched on in the Feature access sheet see this">Testing</span>`;
async function ftShare(title, text) {
  try { if (navigator.share) { await navigator.share({title, text}); return; } } catch (x) { if (x && x.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text); toast("Copied"); } catch (x) { toast("Couldn't copy on this device."); }
}
const ftMail = (to, cc, subject, body) => `mailto:${encodeURIComponent(to || "")}?${cc ? "cc=" + encodeURIComponent(cc) + "&" : ""}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/* ---------- Home tile, hub and page slots ---------- */
function ftTiles() {
  const m = ftMine(); if (!m.length) return "";
  return `<button type="button" class="tile acc" data-ft-go=""><div class="tile-h"><span class="ico">${ICON.plus}</span>Tools</div><div class="tile-b"><span class="big">${m.length}</span></div><div class="tile-f">${esc(m.slice(0, 3).map(f => f.name).join(", "))}${m.length > 3 ? ` +${m.length - 3}` : ""} · testing</div></button>`;
}
function ftWrap(tab, html) {
  if (!FK) return html;
  try {
    if (tab === "home") { if (ftOn("homev2")) html = ftHomeV2(html); if (ftOn("status")) html = ftStatus() + html; }
    if (tab === "training") { let pre = ""; if (ftOn("grid")) pre += ftGrid(true); if (ftOn("expiry")) pre += ftExpiry(true); html = pre + html; }
    if (tab === "maintenance" && ftOn("forecast")) html = ftForecast(true) + html;
  } catch (x) { console.error("feature", x); }
  return html;
}
function viewTools() {
  const id = ui.ftv;
  if (id && ftOn(id) && FT_VIEW[id]) { try { return `<section class="panel ft">${FT_VIEW[id]()}</section>`; } catch (x) { console.error(x); return `<section class="panel">${ftBack(ftDef(id).name)}<p class="hint">This feature hit an error.</p></section>`; } }
  const m = ftMine();
  if (!m.length) return `<section class="panel"><p class="hint">No tools are switched on for this login.</p></section>`;
  return `<section class="panel ft"><div class="panel-h"><h2>Tools</h2>${ftTesting()}</div>
    <p class="hint">Features being tested before they go to everyone. Each one is switched on per person or group in the Feature access sheet.</p>
    ${FT_GROUPS.map(g => { const fs = FT_LIST.filter(f => f.g === g && ftOn(f.id) && FT_VIEW[f.id]); return fs.length ? `<h3 class="ft-g">${esc(g)}</h3><div class="apg-list">${fs.map(f => `<button type="button" class="ft-row" data-ft-go="${esc(f.id)}"><span class="ico">${ICON[f.ico] || ICON.plus}</span><span class="nm"><b>${esc(f.name)}</b><span class="sub">${esc(f.desc)}</span>${f.ph || f.local ? `<span class="ft-tags l">${f.ph ? ftChip("warn", "Placeholder") : ""}${f.local ? ftChip("none", "This device") : ""}</span>` : ""}</span><span class="ft-chev" aria-hidden="true">›</span></button>`).join("")}</div>` : ""; }).join("")}
  </section>`;
}

/* ---------- Board layout: status strip ---------- */
function ftAge(dateStr, label, warnDays = 3) {
  const d = dateStr ? new Date(/T/.test(dateStr) ? dateStr : String(dateStr).slice(0, 10) + "T12:00:00") : null;
  if (!d || isNaN(d)) return `<span class="ft-age none">${esc(label)}: <b>not tracked yet</b></span>`;
  const days = Math.floor((Date.now() - d) / 864e5);
  return `<span class="ft-age ${days > warnDays ? "warn" : "ok"}">${esc(label)}: <b>${esc(fmtS(d))}</b>${days > warnDays ? ` · ${days} days old` : ""}</span>`;
}
function ftStatus() {
  const C0 = counters(), chk = nextCheck(C0);
  const inWork = S.mxPlan.filter(p => p.status === "In work");
  const openSq = allSquawks().filter(q => q.status === "Open");
  const today = iso(TODAY);
  const fl = S.flights.filter(f => (f.end || f.start) >= today).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const flyingToday = fl.find(f => onDay(f, TODAY));
  const crew = crewOn(TODAY);
  let st = "ok", label = "Available", sub = "No work in progress on the board";
  if (inWork.length) { const it = mxItems().find(i => i.id === inWork[0].id); st = "warn"; label = "In maintenance"; sub = it ? ftSentence(it.item) : "Work in progress"; }
  else if (flyingToday) { st = "ok"; label = "Flying today"; sub = flyingToday.route || ""; }
  else if (openSq.length) { st = "warn"; label = "Available · open squawks"; sub = plural(openSq.length, "open squawk"); }
  const ac = aircraft();
  return `<section class="ft-strip ${st}" aria-label="Aircraft status">
    <div class="ft-s1"><span class="ft-dot" aria-hidden="true"></span><b>${esc(ac.tail || "N282BT")} · ${esc(label)}</b><span>${esc(sub)}</span></div>
    <div class="ft-s2">
      <span><small>Next check</small>${chk ? `${esc(chk.it.item.replace(" CHECK", ""))} · ${esc(fmtS(chk.nx.d))} ${ftChip(chk.nx.days < 0 ? "crit" : chk.nx.days <= 7 ? "warn" : "ok", chk.nx.days < 0 ? "Overdue" : rel(chk.nx.days))}` : "—"}</span>
      <span><small>Next trip</small>${fl.length ? `${esc(fmtS(parse(fl[0].start)))} · ${esc(fl[0].route || "")}` : "None on the board"}</span>
      <span><small>Crew today</small>${crew.total ? esc(crew.ps.map(p => p.name.split(" ")[0]).join(", ")) : "Nobody on rotation"}</span>
    </div>
    <div class="ft-s3">${ftAge(SNAP && SNAP.at, "Board built", 1)}${ftAge(ac.asOf, "Veryon hours")}${ftAge(veryonChecked(), "Veryon checked")}${ftAge(null, "JetInsight schedule")}</div>
  </section>`;
}

/* ---------- Board layout: home v2 ---------- */
function ftHomeV2(html) {
  const A = `<section class="panel">\n    <div class="panel-h"><h2>Needs attention</h2>`, T = `<section class="panel">\n    <div class="panel-h"><h2>Next 2 weeks</h2>`;
  const a = html.indexOf(A), t = html.indexOf(T);
  if (a < 0 || t < 0 || t < a) return html;
  const items = attention(), groups = new Map(), single = [];
  for (const x of items) {
    const m = x.tag === "Training" && String(x.title).match(/^([^:]+):\s*(.*)$/);
    if (m) { if (!groups.has(m[1])) groups.set(m[1], {who: m[1], list: []}); groups.get(m[1]).list.push({...x, what: m[2]}); }
    else single.push(x);
  }
  const rank = s => s === "crit" ? 0 : s === "warn" ? 1 : 2;
  const rows = [...[...groups.values()].map(g => { g.sev = g.list.reduce((s, x) => rank(x.sev) < rank(s) ? x.sev : s, "none"); g.sort = Math.min(...g.list.map(x => x.sort ?? 9e3)); return {g}; }), ...single.map(x => ({x}))]
    .sort((p, q) => rank((p.g || p.x).sev) - rank((q.g || q.x).sev) || ((p.g || p.x).sort ?? 9e3) - ((q.g || q.x).sort ?? 9e3));
  const show = ui.attAll ? rows : rows.slice(0, 3);
  const li = r => {
    if (r.x) { const x = r.x; return `<li class="${esc(x.sev)}" ${x.edit ? `data-edit="${esc(x.edit)}"` : x.mx ? `data-mx="${esc(x.mx)}"` : `data-tab="${esc(x.tab)}"`} tabindex="0">${chip(x.sev, x.sev === "crit" ? "Act now" : x.sev === "warn" ? "Coming up" : "To do")}<div class="what"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></div><span class="tag">${esc(x.tag)}</span></li>`; }
    const g = r.g, open = ui.ftAtt === g.who, c = g.list.filter(x => x.sev === "crit").length, w = g.list.filter(x => x.sev === "warn").length;
    return `<li class="${esc(g.sev)}" data-ft-att="${esc(g.who)}" tabindex="0">${chip(g.sev, g.sev === "crit" ? "Act now" : g.sev === "warn" ? "Coming up" : "To do")}<div class="what"><b>${esc(g.who)}</b><span>${[c ? `${c} expired or in grace` : "", w ? `${w} due soon` : "", g.list.length - c - w ? `${g.list.length - c - w} with no date` : ""].filter(Boolean).join(" · ")}${open ? "" : ` · ${esc(g.list.slice(0, 3).map(x => x.what.replace(/ with no date yet$/, "")).join(", "))}${g.list.length > 3 ? "…" : ""}`}</span>${open ? `<span class="ft-sub">${g.list.map(x => `<span data-${x.edit ? `edit="${esc(x.edit)}"` : `tab="${esc(x.tab || "training")}"`}>${chip(x.sev, x.sev === "crit" ? "Act now" : x.sev === "warn" ? "Soon" : "No date")} ${esc(x.what)} <i>${esc(x.sub)}</i></span>`).join("")}</span>` : ""}</div><span class="tag">Training</span></li>`;
  };
  const att = `<section class="panel">
    <div class="panel-h"><h2>Needs attention</h2><span class="hint">${items.filter(x => x.sev === "crit").length} act now · ${items.filter(x => x.sev === "warn").length} coming up · grouped by person</span></div>
    <ul class="att box">${rows.length ? show.map(li).join("") : `<li class="clear">Nothing needs attention right now.</li>`}</ul>
    ${rows.length > 3 ? `<div><button class="btn" data-toggle="attAll" aria-pressed="${!!ui.attAll}">${ui.attAll ? "Show fewer" : `Show all ${rows.length}`}</button></div>` : ""}
  </section>\n  `;
  const before = html.slice(0, a), attOld = html.slice(a, t), rest = html.slice(t);
  void attOld;
  return before + rest.replace(/\s*$/, "") + "\n  " + att;
}

/* ---------- Trips ---------- */
const FT_STAGES = ["Requested", "Confirmed by JLI", "Loading", "Released", "Departed", "En route", "Landed", "Delivered"];
function ftTrip() {
  const today = iso(TODAY);
  const fl = S.flights.filter(f => (f.end || f.start) >= today).sort((a, b) => String(a.start).localeCompare(String(b.start))).slice(0, 8);
  const row = f => { const d = parse(f.start), c = crewOn(d); return `<div class="ft-card"><div class="ft-ch"><b>${esc(range(f.start, f.end))}</b>${ftChip(f.status === "Confirmed" ? "ok" : "warn", f.status || "—")}</div><div class="ft-big">${esc(f.route || "—")}</div><div class="hint">${esc(f.client || "")}${f.client ? " · " : ""}Crew: ${c.total ? esc(c.ps.map(p => `${p.name.split(" ")[0]} (${seatShort(p)})`).join(", ")) : "nobody on rotation"}${covered(c) ? "" : " · " + "crew gap"}</div>${f.notes ? `<div class="hint">${esc(f.notes)}</div>` : ""}</div>`; };
  return `${ftBack("Trip status", ftTesting())}
    <div class="ft-row2"><a class="btn primary" href="https://flightaware.com/live/flight/N282BT" target="_blank" rel="noopener">N282BT on FlightAware</a></div>
    ${fl.length ? fl.map(row).join("") : `<p class="hint">No trips on the board from today on.</p>`}
    <h3 class="ft-g">Trip progress</h3>
    <div class="ft-stages">${FT_STAGES.map((s, i) => `<span class="${i === 0 ? "on" : ""}">${esc(s)}</span>`).join("")}</div>
    ${ftPh("Crew status taps (Loading, Released, Departed…) and customer alerts come with the BTA App, because they need a shared database. The steps above show where they will go.")}`;
}
function ftFlogNew() { return {id: ftId(), date: iso(TODAY), crew: (ME && ME.name) || "", dutyOn: "", dutyOff: "", legs: [ftLeg()]}; }
function ftLeg() { return {from: "", to: "", out: "", off: "", on: "", in: "", fs: "", up: "", fe: "", pf: "", app: "", hold: "", ldg: "1", delay: "", dr: "", rem: ""}; }
function ftFlogCalc(l) { const blk = ftDur(l.out, l.in), flt = ftDur(l.off, l.on); const fs = ftNum(l.fs), up = ftNum(l.up) || 0, fe = ftNum(l.fe); return {blk, flt, burn: fs != null && fe != null ? fs + up - fe : null}; }
function ftFlogText(g) {
  const L = g.legs.map((l, i) => { const c = ftFlogCalc(l); return `Leg ${i + 1} ${l.from || "?"}-${l.to || "?"}: OUT ${l.out || "--"} OFF ${l.off || "--"} ON ${l.on || "--"} IN ${l.in || "--"} (Z) · block ${ftHm(c.blk)} · flight ${ftHm(c.flt)} · fuel ${l.fs || "-"}+${l.up || 0}-${l.fe || "-"} = burn ${c.burn ?? "-"} lb · PF ${l.pf || "-"} · app ${l.app || 0} · hold ${l.hold || 0} · ldg ${l.ldg || 0}${l.delay ? ` · delay ${l.delay} min (${l.dr || "no reason"})` : ""}${l.rem ? ` · ${l.rem}` : ""}`; });
  const tb = g.legs.reduce((s, l) => s + (ftFlogCalc(l).blk || 0), 0), tf = g.legs.reduce((s, l) => s + (ftFlogCalc(l).flt || 0), 0);
  return `N282BT flight log ${g.date} · ${g.crew}\n${L.join("\n")}\nTotal block ${ftHm(tb)} · flight ${ftHm(tf)} · duty ${g.dutyOn || "--"}-${g.dutyOff || "--"}Z (${ftHm(ftDur(g.dutyOn, g.dutyOff))})`;
}
function ftFlog() {
  const s = ftS("flog", {cur: null, saved: []}); if (!s.cur) s.cur = ftFlogNew();
  const g = s.cur, P = "flog:cur.";
  const tb = g.legs.reduce((a, l) => a + (ftFlogCalc(l).blk || 0), 0), tf = g.legs.reduce((a, l) => a + (ftFlogCalc(l).flt || 0), 0);
  const tm = (k, v) => `<span class="ft-tm">${ftIn(k, v, `inputmode="numeric" placeholder="hh:mm" maxlength="5"`)}<button type="button" class="btn sm" data-ft-act="now" data-k="${esc(k)}">Now</button></span>`;
  const leg = (l, i) => { const c = ftFlogCalc(l), p = P + "legs." + i + "."; return `<div class="ft-card">
    <div class="ft-ch"><b>Leg ${i + 1}</b>${g.legs.length > 1 ? `<button type="button" class="btn sm" data-ft-act="flogDelLeg" data-i="${i}">Remove leg</button>` : ""}</div>
    <div class="ft-grid2">${ftField("From", ftIn(p + "from", l.from, `autocapitalize="characters" placeholder="TJSJ"`))}${ftField("To", ftIn(p + "to", l.to, `autocapitalize="characters" placeholder="TVSA"`))}</div>
    <div class="ft-grid2">${ftField("Out (Z)", tm(p + "out", l.out))}${ftField("Off (Z)", tm(p + "off", l.off))}${ftField("On (Z)", tm(p + "on", l.on))}${ftField("In (Z)", tm(p + "in", l.in))}</div>
    <div class="ft-grid3">${ftField("Fuel start lb", ftIn(p + "fs", l.fs, `inputmode="numeric"`))}${ftField("Uplift lb", ftIn(p + "up", l.up, `inputmode="numeric"`))}${ftField("Fuel end lb", ftIn(p + "fe", l.fe, `inputmode="numeric"`))}</div>
    <div class="ft-grid3">${ftField("PF", ftSel(p + "pf", l.pf, [["", "—"], "PIC", "SIC"]))}${ftField("Approaches", ftIn(p + "app", l.app, `inputmode="numeric"`))}${ftField("Holds", ftIn(p + "hold", l.hold, `inputmode="numeric"`))}</div>
    <div class="ft-grid3">${ftField("Landings", ftIn(p + "ldg", l.ldg, `inputmode="numeric"`))}${ftField("Delay min", ftIn(p + "delay", l.delay, `inputmode="numeric"`))}${ftField("Delay reason", ftSel(p + "dr", l.dr, [["", "—"], "Weather", "ATC", "Customs", "Loading", "Fuel", "Maintenance", "Crew", "Customer", "Other"]))}</div>
    ${ftField("Remarks", ftArea(p + "rem", l.rem))}
    <div class="ft-calc"><span>Block <b>${ftHm(c.blk)}</b></span><span>Flight <b>${ftHm(c.flt)}</b></span><span>Burn <b>${c.burn == null ? "—" : c.burn.toLocaleString() + " lb"}</b></span></div>
  </div>`; };
  return `${ftBack("Flight log", ftTesting())}
    ${ftPh("Replaces the paper Form 113. The fields will be matched to a copy of the form when we have one.")}
    <div class="ft-card"><div class="ft-grid3">${ftField("Date", ftIn(P + "date", g.date, `type="date"`))}${ftField("Duty on (Z)", tm(P + "dutyOn", g.dutyOn))}${ftField("Duty off (Z)", tm(P + "dutyOff", g.dutyOff))}</div>${ftField("Crew", ftIn(P + "crew", g.crew))}</div>
    ${g.legs.map(leg).join("")}
    <div class="ft-calc big"><span>Total block <b>${ftHm(tb)}</b></span><span>Total flight <b>${ftHm(tf)}</b></span><span>Duty <b>${ftHm(ftDur(g.dutyOn, g.dutyOff))}</b></span></div>
    <div class="ft-row2"><button type="button" class="btn" data-ft-act="flogAddLeg">Add leg</button><button type="button" class="btn" data-ft-act="flogCopy">Copy for JetInsight</button><button type="button" class="btn primary" data-ft-act="flogSave">Finish and save log</button></div>
    ${ftLocal()}
    ${s.saved.length ? `<h3 class="ft-g">Saved logs</h3><div class="apg-list">${s.saved.slice().reverse().map(x => { const b = x.legs.reduce((a, l) => a + (ftFlogCalc(l).blk || 0), 0); return `<div class="ft-row"><span class="nm"><b>${esc(fmtS(parse(x.date)))} · ${esc(x.legs.map(l => l.from).concat(x.legs.length ? [x.legs[x.legs.length - 1].to] : []).filter(Boolean).join("–") || "no route")}</b><span class="sub">${plural(x.legs.length, "leg")} · block ${ftHm(b)}</span></span><span class="ft-tags"><button type="button" class="btn sm" data-ft-act="flogShare" data-id="${esc(x.id)}">Copy</button><button type="button" class="btn sm" data-ft-act="flogDel" data-id="${esc(x.id)}">Delete</button></span></div>`; }).join("")}</div>` : ""}`;
}
function ftReq() {
  const s = ftS("req", {to: "", cc: "", f: {}}), f = s.f, P = "req:f.";
  return `${ftBack("Trip request to JLI", ftTesting())}
    ${ftPh("JLI's dispatch address and the BTA Operations copy address aren't set yet. Type them once below; this phone remembers them.")}
    <div class="ft-card"><div class="ft-grid2">${ftField("To (JLI dispatch)", ftIn("req:to", s.to, `type="email" placeholder="not set yet"`))}${ftField("Copy (BTA Operations)", ftIn("req:cc", s.cc, `type="email" placeholder="not set yet"`))}</div></div>
    <div class="ft-card">
      <div class="ft-grid2">${ftField("Requested by", ftIn(P + "by", f.by ?? ((ME && ME.name) || "")))}${ftField("Customer", ftIn(P + "cust", f.cust))}</div>
      ${ftField("Route", ftIn(P + "route", f.route, `autocapitalize="characters" placeholder="KFXE – MYNN – KFXE"`))}
      <div class="ft-grid3">${ftField("Date", ftIn(P + "date", f.date, `type="date"`))}${ftField("Return / through", ftIn(P + "end", f.end, `type="date"`))}${ftField("Wanted departure (local)", ftIn(P + "time", f.time, `placeholder="0800"`))}</div>
      ${ftField("Cargo (pieces, L×W×H in, weight lb)", ftArea(P + "cargo", f.cargo, "e.g. 4 crates 48×40×36 in, 650 lb each"))}
      <div class="ft-grid3">${ftField("Total cargo lb", ftIn(P + "wt", f.wt, `inputmode="numeric"`))}${ftField("Hazmat", ftSel(P + "hz", f.hz || "No", ["No", "Yes"]))}${ftField("Passengers", ftIn(P + "pax", f.pax, `inputmode="numeric" placeholder="0"`))}</div>
      ${f.hz === "Yes" ? ftField("Hazmat details (UN number, class, quantity)", ftArea(P + "hzd", f.hzd)) : ""}
      ${ftField("Documents to follow", ftIn(P + "docs", f.docs, `placeholder="manifest, AWB, shipper's declaration…"`))}
      ${ftField("Notes", ftArea(P + "notes", f.notes))}
    </div>
    <div class="ft-row2"><button type="button" class="btn primary" data-ft-act="reqMail">Write the email</button><button type="button" class="btn" data-ft-act="reqCopy">Copy text</button><button type="button" class="btn" data-ft-act="reqClear">Clear form</button></div>
    <p class="hint">Opens a draft in your mail app. Nothing is sent until you press Send there. Attach the documents in the mail app.</p>`;
}
function ftReqText(f) {
  return [`Trip request for N282BT (Blue Tide Aviation)`, ``, `Requested by: ${f.by || ((ME && ME.name) || "")}`, f.cust ? `Customer: ${f.cust}` : "", `Route: ${f.route || ""}`, `Date: ${f.date || ""}${f.end ? ` through ${f.end}` : ""}${f.time ? ` · wanted departure ${f.time} local` : ""}`, `Cargo: ${f.cargo || "none listed"}`, f.wt ? `Total cargo: ${f.wt} lb` : "", `Hazmat: ${f.hz || "No"}${f.hz === "Yes" && f.hzd ? ` (${f.hzd})` : ""}`, `Passengers: ${f.pax || 0}`, f.docs ? `Documents to follow: ${f.docs}` : "", f.notes ? `\nNotes: ${f.notes}` : ""].filter(x => x !== "").join("\n");
}
const FT_CLOSE = [["gd", "General declarations (GenDecs)"], ["fuel", "Fuel receipts"], ["man", "Cargo manifests"], ["awb", "Air waybills"], ["log", "Logbook page photo"], ["cust", "Customs / immigration forms"], ["oth", "Other trip documents"], ["ji", "JetInsight log pages closed out"], ["duty", "Duty times entered in JetInsight"]];
function ftClose() {
  const s = ftS("close", {sel: "", trips: {}, to: ""});
  const since = iso(addDays(TODAY, -45)), today = iso(TODAY);
  const fl = S.flights.filter(f => f.start >= since && f.start <= today).sort((a, b) => String(b.start).localeCompare(String(a.start)));
  const opts = [["", "Choose a trip…"], ...fl.map(f => [f.id, `${fmtS(parse(f.start))} · ${f.route || ""}`]), ["other", "Another trip (type below)"]];
  const t = s.trips[s.sel] || {};
  return `${ftBack("Trip close-out", ftTesting())}
    <div class="ft-card">${ftField("Trip", ftSel("close:sel", s.sel, opts))}${s.sel === "other" ? ftField("Trip name", ftIn("close:trips.other.name", t.name, `placeholder="date and route"`)) : ""}</div>
    ${s.sel ? `<div class="ft-card ft-checks">${FT_CLOSE.map(([k, l]) => `<label class="ft-ck"><input type="checkbox" data-ft-ck="close:trips.${esc(s.sel)}.${k}" ${t[k] ? "checked" : ""}><span>${esc(l)}</span></label>`).join("")}</div>
    <div class="ft-card">${ftField("Send documents to (JLI)", ftIn("close:to", s.to, `type="email" placeholder="not set yet"`))}</div>
    <div class="ft-row2"><button type="button" class="btn primary" data-ft-act="closeMail">Write the email to JLI</button></div>
    <p class="hint">Opens a draft in your mail app listing the documents. Attach the photos and PDFs there before you send. Attaching them for you comes with the BTA App.</p>` : ""}
    ${ftLocal()}`;
}
function ftLoad() {
  const D = FT_DATA.load; if (!D) return `${ftBack("Load planning")}<p class="hint">${esc(FT_ERR.load || "Loading…")}</p>`;
  const s = ftS("load", {cfg: "2", eqArm: "", fuel: "", burn: "", items: [{d: "", w: "", arm: ""}]});
  const cfg = D.configs.find(c => String(c.n) === String(s.cfg)) || D.configs[0];
  const rows = [{d: `Empty weight (${cfg.name})`, w: cfg.ew, arm: cfg.arm}, {d: "Crew", w: D.crew.w, arm: D.crew.arm}, {d: "Equipment (14 items)", w: D.equip.w, arm: ftNum(s.eqArm)}];
  const cargo = s.items.map(x => ({d: x.d || "Cargo", w: ftNum(x.w) || 0, arm: ftNum(x.arm)})).filter(x => x.w);
  const all = [...rows, ...cargo];
  const zfw = all.reduce((a, x) => a + x.w, 0), missing = all.some(x => x.arm == null);
  const zm = all.reduce((a, x) => a + x.w * (x.arm || 0), 0);
  const fuel = ftNum(s.fuel) || 0, burn = ftNum(s.burn) || 0;
  const ramp = zfw + fuel, tow = ramp - D.taxi, lw = tow - burn;
  const cg = w => w > 0 ? (zm + (w - zfw) * D.fuelArm) / w : null;
  const smc = c => c == null ? null : (c - D.smc.lemac) * 100 / D.smc.len;
  const lim = (v, max, l) => `<span>${esc(l)} <b>${Math.round(v).toLocaleString()} lb</b> ${ftChip(v > max ? "crit" : max - v < 200 ? "warn" : "ok", v > max ? `${Math.round(v - max)} over` : `${Math.round(max - v).toLocaleString()} under`)}</span>`;
  return `${ftBack("Load planning", ftTesting())}
    ${ftPh(D.note)}
    <div class="ft-card"><div class="ft-grid2">${ftField("Configuration", ftSel("load:cfg", s.cfg, D.configs.map(c => [String(c.n), c.name])))}${ftField("Equipment arm (in)", ftIn("load:eqArm", s.eqArm, `inputmode="decimal" placeholder="not set"`))}</div>
    <table class="t ft-t"><thead><tr><th>Item</th><th class="num">lb</th><th class="num">Arm</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.d)}</td><td class="num">${r.w.toLocaleString()}</td><td class="num">${r.arm == null ? "—" : r.arm}</td></tr>`).join("")}</tbody></table></div>
    <div class="ft-card"><div class="ft-ch"><b>Cargo</b><button type="button" class="btn sm" data-ft-act="loadAdd">Add piece</button></div>
    ${s.items.map((x, i) => `<div class="ft-grid3">${ftField("Piece", ftIn(`load:items.${i}.d`, x.d))}${ftField("Weight lb", ftIn(`load:items.${i}.w`, x.w, `inputmode="numeric"`))}${ftField("Arm in", ftIn(`load:items.${i}.arm`, x.arm, `inputmode="decimal"`))}</div>`).join("")}</div>
    <div class="ft-card"><div class="ft-grid2">${ftField(`Fuel lb (usable ${D.usable.toLocaleString()})`, ftIn("load:fuel", s.fuel, `inputmode="numeric"`))}${ftField("Trip burn lb", ftIn("load:burn", s.burn, `inputmode="numeric"`))}</div></div>
    <div class="ft-calc col">${lim(zfw, D.limits.mzfw, "Zero fuel")}${lim(ramp, D.limits.ramp, "Ramp")}${lim(tow, D.limits.mtow, "Takeoff")}${lim(lw, D.limits.mlw, "Landing")}
      <span>Takeoff CG <b>${missing ? "needs every arm" : `${cg(tow).toFixed(2)} in · ${smc(cg(tow)).toFixed(1)}% SMC`}</b></span>
      <span>Zero-fuel CG <b>${missing ? "—" : `${cg(zfw).toFixed(2)} in · ${smc(cg(zfw)).toFixed(1)}% SMC`}</b></span>
      ${fuel > D.usable ? `<span>${ftChip("crit", "Fuel above usable")}</span>` : ""}</div>
    <p class="hint">Gear retraction moves the moment by +${D.gearMoment.toLocaleString()} in-lb (not included). CG limits aren't loaded yet, so the CG isn't checked. Not for dispatch: use JetInsight and the JLI W&B.</p>`;
}
function ftDest() {
  const D = FT_DATA.dest; if (!D) return `${ftBack("Destination guide")}<p class="hint">${esc(FT_ERR.dest || "Loading…")}</p>`;
  const s = ftS("dest", {q: "", notes: {}});
  const cur = ui.ftDest && D.airports.find(a => a.icao === ui.ftDest);
  if (cur) {
    const hasApg = APGK && APG.index && APG.index.airports.some(a => a.icao === cur.icao);
    const sec = (t, v, ph) => `<div class="ft-sec"><small>${esc(t)}</small>${v ? `<div>${esc(v)}</div>` : `<div class="muted">${esc(ph || "Not entered yet")}</div>`}</div>`;
    return `<div class="panel-h"><h2>${esc(cur.icao)} · ${esc(cur.name)}</h2><span class="ft-hd"><button class="btn sm" data-ft-dest="">All airports</button></span></div>
      <div class="ft-card">${sec("Region", cur.region)}${sec("Longest runway", cur.rwy)}${sec("Fuel", cur.fuel)}${sec("Airport of entry", cur.entry)}${sec("Notes", cur.note, "—")}</div>
      <div class="ft-card">${sec("Parking", "")}${sec("Handling and who loads / unloads", "")}${sec("Loading equipment", "")}${sec("Contacts", "")}${sec("Customs and immigration procedure", "")}${sec("Permits and slots", /PPR|slot/i.test(cur.note || "") ? cur.note : "")}</div>
      <div class="ft-row2">${hasApg ? `<button type="button" class="btn primary" data-apg="${esc(cur.icao)}">Open APG analysis</button>` : `<span class="hint">${APGK ? "No APG report on the board for this airport." : "APG analysis isn't switched on for this login."}</span>`}</div>
      <div class="ft-card">${ftField("My notes (this device)", ftArea(`dest:notes.${cur.icao}`, s.notes[cur.icao], "Ramp, FBO, fuel truck, customs tips…"))}</div>
      ${ftPh("Shared crew notes with photos come with the BTA App. Runway, fuel and entry come from the Bahamas Airport List (Nov 2026) and are not for flight planning.")}`;
  }
  const q = String(s.q || "").trim().toUpperCase();
  const list = D.airports.filter(a => !q || (a.icao + " " + a.name + " " + a.region).toUpperCase().includes(q));
  const ORD = ["Eastern Caribbean", "Bahamas", "Turks & Caicos, Dominican Republic, Haiti", "South Florida"];
  const regions = [...new Set(list.map(a => a.region))].sort((a, b) => ((ORD.indexOf(a) + 1) || 9) - ((ORD.indexOf(b) + 1) || 9));
  return `${ftBack("Destination guide", ftTesting())}
    ${ftPh("Runway, fuel and entry are filled in from the Bahamas Airport List. Handling, contacts, customs steps and crew notes are empty until someone adds them.")}
    <input class="apg-q" id="ft-dest-q" data-ft-in="dest:q" type="search" placeholder="Search ICAO or name" value="${esc(s.q || "")}" autocomplete="off" autocapitalize="characters">
    ${regions.map(r => `<h3 class="ft-g">${esc(r)}</h3><div class="apg-list">${list.filter(a => a.region === r).map(a => `<button type="button" class="apg-row" data-ft-dest="${esc(a.icao)}"><b>${esc(a.icao)}</b><span class="nm">${esc(a.name)}<br><span class="sub">${esc([a.rwy, a.fuel && a.fuel !== "None" ? a.fuel : "No fuel", a.entry === "Yes" ? "Entry" : ""].filter(Boolean).join(" · "))}</span></span>${s.notes[a.icao] ? ftChip("ok", "Notes") : "<span></span>"}</button>`).join("")}</div>`).join("") || `<p class="hint">No airport matches.</p>`}`;
}
function ftCards() {
  const D = FT_DATA.cards; if (!D) return `${ftBack("Cockpit cards")}<p class="hint">${esc(FT_ERR.cards || "Loading…")}</p>`;
  const tbl = (t, rows) => `<div class="ft-card"><div class="ft-ch"><b>${esc(t)}</b></div><table class="t ft-t ft-cardt"><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="num"><b>${r[1] ? esc(r[1]) : `<span class="muted">to add</span>`}</b></td></tr>${r[2] ? `<tr class="ft-note"><td colspan="2">${esc(r[2])}</td></tr>` : ""}`).join("")}</tbody></table></div>`;
  return `${ftBack("Cockpit cards", ftTesting())}${D.sections.map(s => tbl(s.t, s.rows)).join("")}${ftPh(D.note)}`;
}

/* ---------- Crew & training ---------- */
const FT_GRID = [["Checks", /checkride|proficiency|line check/i], ["Ground", /ground oral|emergency drill|tfssp/i], ["Instr.", /instrument currency|sic instrument/i], ["Hazmat", /hazmat/i], ["Medical", /medical/i], ["Docs", /passport|driver|crew id|temporary/i]];
const FT_LEGAL = /checkride|proficiency|line check|ground oral|emergency drill|medical|instrument currency|sic instrument|hazmat|temporary/i;
function ftCell(items) {
  if (!items.length) return {st: "none", l: "—"};
  const sts = items.map(t => trainingStatus(t));
  if (sts.some(s => s.state === "crit" && !s.inGrace)) return {st: "crit", l: "Exp"};
  if (sts.some(s => s.inGrace)) return {st: "crit", l: "Grace"};
  if (sts.some(s => s.state === "warn")) return {st: "warn", l: "Due"};
  if (sts.some(s => s.state === "none")) return {st: "none", l: "No date"};
  return {st: "ok", l: "OK"};
}
function ftLegal(p) {
  if (!CREW_SEATS.has(p.seat)) return {st: "none", l: "n/a", why: "Not a flight-crew seat"};
  const items = S.training.filter(t => t.pilotId === p.id && FT_LEGAL.test(t.item));
  const bad = items.filter(t => { const s = trainingStatus(t); return s.state === "crit" && !s.inGrace; });
  if (bad.length) return {st: "crit", l: "No", why: bad.map(t => t.item).join(", ")};
  const nd = items.filter(t => trainingStatus(t).state === "none");
  if (nd.length || !items.length) return {st: "warn", l: "Check", why: nd.length ? "No date: " + nd.map(t => t.item).join(", ") : "No items"};
  const gr = items.filter(t => trainingStatus(t).inGrace);
  return {st: gr.length ? "warn" : "ok", l: "Yes", why: gr.length ? "In grace: " + gr.map(t => t.item).join(", ") : "All tracked items current"};
}
function ftGrid(slot) {
  const ps = pilotsSorted().filter(p => !limited() || p.id === ME.pilotId);
  const body = `<div class="ft-scroll"><table class="t ft-grid"><thead><tr><th>Person</th><th>Legal today</th>${FT_GRID.map(g => `<th>${esc(g[0])}</th>`).join("")}</tr></thead><tbody>${ps.map(p => { const L = ftLegal(p); return `<tr><td><b>${esc(p.name.split(" ")[0])}</b><small>${esc(seatShort(p))}</small></td><td title="${esc(L.why)}">${ftChip(L.st, L.l)}</td>${FT_GRID.map(([, re]) => { const c = ftCell(S.training.filter(t => t.pilotId === p.id && re.test(t.item))); return `<td>${ftChip(c.st, c.l)}</td>`; }).join("")}</tr>`; }).join("")}</tbody></table></div>`;
  if (slot) return `<section class="panel"><div class="panel-h"><h2>Training at a glance</h2><span class="ft-hd">${ftTesting()}<button class="btn sm" data-ft-go="grid">Details</button></span></div>${body}<p class="hint">Legal today = no expired Part 135 item, medical or hazmat on the board (grace month counts). A board check, not a legal ruling: confirm against the JLI tracker.</p></section>`;
  return `${ftBack("Training grid", ftTesting())}${body}
    <h3 class="ft-g">Why</h3><div class="apg-list">${ps.map(p => { const L = ftLegal(p); return `<div class="ft-row"><span class="nm"><b>${esc(p.name)}</b><span class="sub">${esc(L.why)}</span></span>${ftChip(L.st, L.l)}</div>`; }).join("")}</div>
    <p class="hint">Chips: OK = current · Due = within 45 days · Grace = in the grace month · Exp = past the hard deadline · No date = not on the tracker. Tap a person's training on the Training tab to see each item.</p>`;
}
function ftHazmat() {
  const ps = pilotsSorted().filter(p => !limited() || p.id === ME.pilotId);
  const rows = ps.map(p => ({p, t: S.training.find(t => t.pilotId === p.id && /hazmat/i.test(t.item))})).filter(r => r.t);
  const win = t => { const e = parse(t.expires); if (!e) return "—"; const a = new Date(e.getFullYear(), e.getMonth() - 1, 1), b = new Date(e.getFullYear(), e.getMonth() + 2, 0); return `${fmtS(a)} – ${fmt(b)}`; };
  return `${ftBack("Hazmat tracking", ftTesting())}
    <p class="hint">Recurrent every 24 months (Part 135 Subpart K). Training in the calendar month before or after the due month counts as on time; keep records 3 years. Content comes from Jet Logistics' FAA-approved program.</p>
    <div class="apg-list">${rows.map(({p, t}) => { const s = trainingStatus(t); return `<div class="ft-row"><span class="nm"><b>${esc(p.name)}</b><span class="sub">${t.lastDone ? "Done " + esc(fmt(parse(t.lastDone))) : "No record yet"} · due ${esc(fmt(parse(t.expires)))} · on-time window ${esc(win(t))}</span></span>${ftChip(s.state, trainLabel(s))}</div>`; }).join("") || `<div class="ft-row"><span class="nm">No hazmat items on the board.</span></div>`}</div>`;
}
const FT_DOCS = /medical|passport|driver|crew id|temporary pilot|fcc|radio|pilot certificate|cfi/i;
function ftExpiry(slot) {
  const ids = myIds();
  const list = S.training.filter(t => (!ids || ids.has(t.pilotId)) && (FT_DOCS.test(t.item) || t.source === "Personal / document")).map(t => ({t, p: pilotById(t.pilotId), d: parse(t.graceEnds) || parse(t.expires)})).filter(x => x.p && x.d).map(x => ({...x, days: diff(TODAY, x.d)})).sort((a, b) => a.days - b.days);
  const flag = n => n < 0 ? ["crit", "Expired"] : n <= 7 ? ["crit", "7 days"] : n <= 30 ? ["warn", "30 days"] : n <= 60 ? ["warn", "60 days"] : ["ok", "OK"];
  const soon = list.filter(x => x.days <= 60);
  const row = x => { const [st, l] = flag(x.days); return `<div class="ft-row"><span class="nm"><b>${esc(limited() ? x.t.item : `${x.p.name.split(" ")[0]} · ${x.t.item}`)}</b><span class="sub">Expires ${esc(fmt(x.d))} · ${esc(rel(x.days))}</span></span>${ftChip(st, l)}</div>`; };
  if (slot) return soon.length ? `<section class="panel"><div class="panel-h"><h2>Expiring documents</h2><span class="ft-hd">${ftTesting()}<button class="btn sm" data-ft-go="expiry">All</button></span></div><div class="apg-list">${soon.slice(0, 4).map(row).join("")}</div></section>` : "";
  return `${ftBack("Expiration reminders", ftTesting())}
    <p class="hint">Flags at 60, 30 and 7 days. Only expiration dates are shown, never document numbers.</p>
    <div class="apg-list">${list.map(row).join("") || `<div class="ft-row"><span class="nm">No documents with dates.</span></div>`}</div>
    ${ftPh("Uploading the documents themselves (and emailing JLI crew records) comes with the BTA App. Phone reminders come with the app too.")}`;
}
function ftUpgrade() {
  const D = FT_DATA.upgrade; if (!D) return `${ftBack("Upgrade readiness")}<p class="hint">${esc(FT_ERR.upgrade || "Loading…")}</p>`;
  const s = ftS("upgrade", {who: "", done: {}});
  const cands = pilotsSorted().filter(p => /SIC/.test(p.seat) && (!limited() || p.id === ME.pilotId));
  const who = limited() ? ME.pilotId : (s.who || (cands.find(p => p.seat === "SIC – PIC upgrade") || cands[0] || {}).id || "");
  const d = s.done[who] || {};
  const n = D.sections.reduce((a, x) => a + x.items.length, 0), k = D.sections.reduce((a, x) => a + x.items.filter(i => d[i.id]).length, 0);
  return `${ftBack("Upgrade readiness", ftTesting())}
    ${limited() ? "" : `<div class="ft-card">${ftField("Pilot", ftSel("upgrade:who", who, cands.map(p => [p.id, `${p.name} (${seatShort(p)})`])))}</div>`}
    <div class="ft-calc"><span>Complete <b>${k} of ${n}</b></span></div>
    ${D.sections.map(sec => `<h3 class="ft-g">${esc(sec.name)}</h3><div class="ft-card ft-checks">${sec.items.map(i => `<label class="ft-ck"><input type="checkbox" data-ft-ck="upgrade:done.${esc(who)}.${esc(i.id)}" ${d[i.id] ? "checked" : ""}><span>${esc(i.text)}${i.ref ? ` <small>${esc(i.ref)}</small>` : ""}</span></label>`).join("")}</div>`).join("")}
    ${ftPh(D.note)}${ftLocal()}`;
}
function ftEmph() {
  const D = FT_DATA.emph; if (!D) return `${ftBack("Emphasis items")}<p class="hint">${esc(FT_ERR.emph || "Loading…")}</p>`;
  const s = ftS("emph", {ans: {}, ack: {}});
  return `${ftBack("Emphasis items", ftTesting())}${ftPh(D.note)}
    ${D.items.map(it => { const a = s.ans[it.id] || {}, done = s.ack[it.id]; const score = it.questions.filter((q, i) => a[i] === q.a).length; return `<div class="ft-card"><div class="ft-ch"><b>${esc(it.title)}</b>${done ? ftChip("ok", "Acknowledged " + fmtS(new Date(done))) : ftChip("warn", "Open")}</div><p>${esc(it.body)}</p>
      ${it.questions.map((q, i) => `<div class="ft-q"><b>${i + 1}. ${esc(q.q)}</b>${q.o.map((o, j) => `<label class="ft-ck"><input type="radio" name="ft-e-${esc(it.id)}-${i}" data-ft-radio="emph:ans.${esc(it.id)}.${i}" value="${j}" ${a[i] === j ? "checked" : ""}><span>${esc(o)}${a[i] != null && j === q.a ? " ✓" : ""}</span></label>`).join("")}</div>`).join("")}
      <div class="ft-row2"><span class="hint">${Object.keys(a).length ? `${score} of ${it.questions.length} correct` : ""}</span><button type="button" class="btn ${done ? "" : "primary"}" data-ft-act="emphAck" data-id="${esc(it.id)}" ${Object.keys(a).length < it.questions.length ? "disabled" : ""}>${done ? "Acknowledged" : "I've read this"}</button></div></div>`; }).join("")}${ftLocal()}`;
}
function ftList(id, title) {
  const D = FT_DATA[id]; if (!D) return `${ftBack(title)}<p class="hint">${esc(FT_ERR[id] || "Loading…")}</p>`;
  return `${ftBack(title, ftTesting())}${ftPh(D.note)}<div class="apg-list">${D.items.map(x => `<div class="ft-row"><span class="nm"><b>${esc(x.name)}</b><span class="sub">${esc(x.sub || "")}</span></span>${ftChip(x.st || "none", x.status || "Not loaded")}</div>`).join("")}</div>`;
}

/* ---------- Maintenance ---------- */
function ftForecast(slot) {
  const C0 = counters();
  const list = mxItems().filter(it => !ui.mxOff.has(it.type) && !(mxPlan(it.id) && mxPlan(it.id).status === "Complete in Veryon")).map(it => ({it, nx: mxNext(it, C0)})).filter(x => x.nx && x.nx.d <= addMonths(TODAY, 6)).sort((a, b) => a.nx.d - b.nx.d);
  const months = []; for (let i = 0; i < 7; i++) { const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + i, 1); months.push(ymKey(d)); }
  const by = k => list.filter(x => (x.nx.d < TODAY ? ymKey(TODAY) : ymKey(x.nx.d)) === k);
  if (slot) return `<section class="panel"><div class="panel-h"><h2>Coming due</h2><span class="ft-hd">${ftTesting()}<button class="btn sm" data-ft-go="forecast">By month</button></span></div><div class="ft-months">${months.map(k => { const xs = by(k), c = xs.filter(x => x.nx.state === "crit").length; return `<button type="button" class="ft-m ${c ? "crit" : xs.length ? "warn" : ""}" data-ft-go="forecast" data-m="${k}"><small>${esc(ymLabel(k))}</small><b>${xs.length}</b></button>`; }).join("")}</div></section>`;
  const open = ui.ftM || months[0];
  return `${ftBack("Maintenance forecast", ftTesting())}
    <p class="hint">Items coming due in the next 6 months at the ${esc(ui.pace)} pace, from Veryon (hours as of ${esc(fmt(parse(aircraft().asOf)))}). ${ui.mxOff.size ? `Hidden like on the Maint. tab: ${esc([...ui.mxOff].join(", "))} items.` : ""}</p>
    ${months.map(k => { const xs = by(k), isOpen = open === k; return `<div class="ft-card"><button type="button" class="ft-ch ft-mh" data-ft-m="${k}" aria-expanded="${isOpen}"><b>${esc(ymLabel(k, true))}</b><span>${xs.length ? `${xs.length} item${xs.length === 1 ? "" : "s"}${xs.some(x => x.nx.state === "crit") ? " · overdue items" : ""}` : "nothing due"} ${isOpen ? "▴" : "▾"}</span></button>
      ${isOpen ? `<div class="apg-list">${xs.map(({it, nx}) => `<button type="button" class="ft-row" data-mx="${esc(it.id)}"><span class="nm"><b>${esc(ftShort(ftSentence(it.item)))}</b><span class="sub"><span class="ft-mono">ATA ${esc(it.ata || "—")}</span> · ${esc(fmtS(nx.d))} · ${esc(nx.rem || "")} · ${esc(it.type || "")}</span></span>${ftChip(nx.state, nx.state === "crit" ? "Overdue" : nx.state === "warn" ? "≤ 30 days" : "Later")}</button>`).join("") || `<div class="ft-row"><span class="nm muted">Nothing due.</span></div>`}</div>` : ""}</div>`; }).join("")}`;
}
const FT_TASK_SEED = [{id: "t1", title: "Email petty cash report to Sara", freq: "monthly", day: 1, who: "Matt"}, {id: "t2", title: "Parts spot check: top 20 items", freq: "monthly", day: 15, who: "Parts lead"}];
function ftTaskNext(t, done) {
  const after = done ? addDays(parse(done), 1) : (parse(t.start) || TODAY);
  if (t.freq === "weekly") { const d = new Date(after); while (d.getDay() !== (+t.wd || 1)) d.setDate(d.getDate() + 1); return d; }
  if (t.freq === "days") { const st = parse(t.start) || TODAY, n = Math.max(1, +t.every || 7); let d = new Date(st); while (d < after) d = addDays(d, n); return d; }
  let y = after.getFullYear(), m = after.getMonth();
  for (let i = 0; i < 24; i++) { const d = new Date(y, m + i, Math.min(+t.day || 1, new Date(y, m + i + 1, 0).getDate())); if (d >= after) return d; }
  return null;
}
function ftTasks() {
  const s = ftS("tasks", {list: FT_TASK_SEED, done: {}, draft: {freq: "monthly", day: "1", wd: "1", every: "7"}});
  const rows = s.list.map(t => { const n = ftTaskNext(t, s.done[t.id]); return {t, n, days: n ? diff(TODAY, n) : null}; }).sort((a, b) => (a.days ?? 9e3) - (b.days ?? 9e3));
  const dr = s.draft || {};
  const freqTxt = t => t.freq === "weekly" ? `Weekly, ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][+t.wd || 1]}` : t.freq === "days" ? `Every ${t.every} days` : `Monthly on the ${t.day}`;
  return `${ftBack("Recurring tasks", ftTesting())}
    <div class="apg-list">${rows.map(({t, n, days}) => `<div class="ft-row"><span class="nm"><b>${esc(t.title)}</b><span class="sub">${esc(freqTxt(t))}${t.who ? ` · ${esc(t.who)}` : ""}${s.done[t.id] ? ` · last done ${esc(fmtS(parse(s.done[t.id])))}` : ""}</span></span><span class="ft-tags">${n ? ftChip(days < 0 ? "crit" : days === 0 ? "warn" : days <= 3 ? "warn" : "ok", days < 0 ? `Overdue ${fmtS(n)}` : days === 0 ? "Due today" : `Due ${fmtS(n)}`) : ""}<button type="button" class="btn sm primary" data-ft-act="taskDone" data-id="${esc(t.id)}">Done</button><button type="button" class="btn sm" data-ft-act="taskDel" data-id="${esc(t.id)}" aria-label="Delete task">✕</button></span></div>`).join("") || `<div class="ft-row"><span class="nm">No tasks.</span></div>`}</div>
    <h3 class="ft-g">Add a task</h3>
    <div class="ft-card">${ftField("Task", ftIn("tasks:draft.title", dr.title, `placeholder="e.g. Check fire extinguisher dates"`))}
      <div class="ft-grid3">${ftField("Repeats", ftSel("tasks:draft.freq", dr.freq, [["monthly", "Monthly"], ["weekly", "Weekly"], ["days", "Every N days"]]))}${dr.freq === "weekly" ? ftField("Day", ftSel("tasks:draft.wd", dr.wd, [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["0", "Sun"]])) : dr.freq === "days" ? ftField("Every (days)", ftIn("tasks:draft.every", dr.every, `inputmode="numeric"`)) : ftField("Day of month", ftIn("tasks:draft.day", dr.day, `inputmode="numeric"`))}${ftField("Who", ftIn("tasks:draft.who", dr.who))}</div>
      <div class="ft-row2"><button type="button" class="btn primary" data-ft-act="taskAdd">Add task</button></div></div>
    ${ftLocal()}<p class="hint">Phone reminders come with the BTA App.</p>`;
}

/* ---------- Business ---------- */
const FT_CATS = ["Fuel", "Handling / landing / parking", "Maintenance labor", "Parts", "Crew travel", "Hotel", "Per diem", "Insurance", "Training", "Subscriptions", "Other"];
const ftQ = d => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
function ftExp() {
  const s = ftS("exp", {items: [], budget: {}, hours: "", draft: {date: iso(TODAY), cat: "Fuel"}});
  const dr = s.draft || {}, q = ftQ(TODAY);
  const byQ = {}; for (const x of s.items) { const k = ftQ(parse(x.date) || TODAY); byQ[k] = (byQ[k] || 0) + (ftNum(x.amt) || 0); }
  const qs = Object.keys({...byQ, [q]: 1}).sort().reverse().slice(0, 5);
  const y12 = s.items.filter(x => parse(x.date) >= addDays(TODAY, -365)).reduce((a, x) => a + (ftNum(x.amt) || 0), 0), hrs = ftNum(s.hours);
  const byCat = {}; for (const x of s.items.filter(x => ftQ(parse(x.date) || TODAY) === q)) byCat[x.cat] = (byCat[x.cat] || 0) + (ftNum(x.amt) || 0);
  return `${ftBack("Expenses & budget", ftTesting())}
    <div class="ft-card"><div class="ft-ch"><b>Add an expense</b></div>
      <div class="ft-grid3">${ftField("Date", ftIn("exp:draft.date", dr.date, `type="date"`))}${ftField("Category", ftSel("exp:draft.cat", dr.cat, FT_CATS))}${ftField("Amount $", ftIn("exp:draft.amt", dr.amt, `inputmode="decimal"`))}</div>
      <div class="ft-grid2">${ftField("Trip / route", ftIn("exp:draft.trip", dr.trip))}${ftField("Note", ftIn("exp:draft.note", dr.note))}</div>
      <div class="ft-row2"><button type="button" class="btn primary" data-ft-act="expAdd">Add</button><span class="hint">Receipt photos come with the BTA App.</span></div></div>
    <h3 class="ft-g">By quarter</h3>
    <div class="apg-list">${qs.map(k => { const b = ftNum(s.budget[k]), v = byQ[k] || 0; return `<div class="ft-row"><span class="nm"><b>${esc(k)}</b><span class="sub">Spent ${esc(money(v))}${b ? ` of ${esc(money(b))} budget` : ""}</span></span><span class="ft-tags">${b ? ftChip(v > b ? "crit" : v > b * 0.85 ? "warn" : "ok", v > b ? "Over" : `${Math.round(v / b * 100)}%`) : ""}<span class="ft-tm">${ftIn(`exp:budget.${k}`, s.budget[k], `inputmode="decimal" placeholder="budget $" style="width:96px"`)}</span></span></div>`; }).join("")}</div>
    ${Object.keys(byCat).length ? `<h3 class="ft-g">${esc(q)} by category</h3><div class="apg-list">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="ft-row"><span class="nm">${esc(c)}</span><b>${esc(money(v))}</b></div>`).join("")}</div>` : ""}
    <div class="ft-card"><div class="ft-grid2">${ftField("Flight hours, last 12 months", ftIn("exp:hours", s.hours, `inputmode="decimal" placeholder="from JetInsight"`))}<div class="ft-f"><span>Cost per flight hour</span><b class="ft-big">${hrs ? esc(money(y12 / hrs)) : "—"}</b></div></div><p class="hint">Will feed Quick Quote's hourly cost once the numbers are settled.</p></div>
    ${s.items.length ? `<h3 class="ft-g">Recent</h3><div class="apg-list">${s.items.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(x => `<div class="ft-row"><span class="nm"><b>${esc(money(ftNum(x.amt)))} · ${esc(x.cat)}</b><span class="sub">${esc(fmtS(parse(x.date)))}${x.trip ? ` · ${esc(x.trip)}` : ""}${x.note ? ` · ${esc(x.note)}` : ""}</span></span><button type="button" class="btn sm" data-ft-act="expDel" data-id="${esc(x.id)}" aria-label="Delete">✕</button></div>`).join("")}</div>` : ""}
    ${ftPh("Forecasts with Veryon due items and sharing with Drew come with the BTA App.")}${ftLocal()}`;
}
function ftParts() {
  return `${ftBack("Parts & inventory", ftTesting())}<p class="hint">Inventory, count mode and verification live on the BTA Parts page on claude.ai. The person also needs that page shared with their claude.ai account.</p><div class="ft-row2"><a class="btn primary" href="${PT_URL}" target="_blank" rel="noopener">Open BTA Parts</a></div>`;
}
function ftAccess() {
  if (!FA) return `${ftBack("Feature access")}<p class="hint">The access list isn't in this build.</p>`;
  const ids = FA.features || [];
  return `${ftBack("Feature access", ftTesting())}
    <p class="hint">Who has each feature in this build (${esc(FA.at ? whenS(FA.at) : "")}). To change it, tick boxes in the sheet; the next sync (every 3 hours, or after a change on the board) applies it.</p>
    ${FA.sheet ? `<div class="ft-row2"><a class="btn primary" href="${esc(FA.sheet)}" target="_blank" rel="noopener">Edit in Google Sheets</a></div>` : ""}
    ${FA.note ? ftPh(FA.note) : ""}
    <div class="ft-scroll"><table class="t ft-acc"><thead><tr><th>Feature</th>${FA.users.map(u => `<th>${esc(String(u.name).split(" ")[0])}</th>`).join("")}</tr></thead><tbody>${ids.map(id => `<tr><td>${esc((ftDef(id) || {}).name || id)}</td>${FA.users.map(u => `<td class="c">${u.f.includes(id) ? "✓" : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const FT_VIEW = {trip: ftTrip, flog: ftFlog, req: ftReq, close: ftClose, load: ftLoad, dest: ftDest, cards: ftCards, grid: () => ftGrid(false), hazmat: ftHazmat, expiry: () => ftExpiry(false), upgrade: ftUpgrade, emph: ftEmph, slides: () => ftList("slides", "Slide library"), manuals: () => ftList("manuals", "Manuals"), parts: ftParts, forecast: () => ftForecast(false), tasks: ftTasks, exp: ftExp, access: ftAccess};

/* ---------- events ---------- */
function ftSplit(k) { const i = k.indexOf(":"); return [k.slice(0, i), k.slice(i + 1)]; }
function ftSetKey(k, v) { const [id, p] = ftSplit(k); const st = ftS(id, {}); ftPath(st, p, v); ftSave(id); }
const FT_ACT = {
  now(el) { ftSetKey(el.dataset.k, ftNowZ()); scheduleRender(); },
  flogAddLeg() { const s = FT_ST.flog; const last = s.cur.legs[s.cur.legs.length - 1]; const l = ftLeg(); l.from = last ? last.to : ""; l.fs = last ? last.fe : ""; s.cur.legs.push(l); ftSave("flog"); scheduleRender(); },
  flogDelLeg(el) { const s = FT_ST.flog; s.cur.legs.splice(+el.dataset.i, 1); ftSave("flog"); scheduleRender(); },
  flogCopy() { ftShare("Flight log", ftFlogText(FT_ST.flog.cur)); },
  flogSave() { const s = FT_ST.flog; s.saved.push(s.cur); s.cur = ftFlogNew(); ftSave("flog"); toast("Log saved on this device"); scheduleRender(); },
  flogShare(el) { const g = FT_ST.flog.saved.find(x => x.id === el.dataset.id); if (g) ftShare("Flight log", ftFlogText(g)); },
  flogDel(el) { if (!confirm("Delete this saved log from this device?")) return; const s = FT_ST.flog; s.saved = s.saved.filter(x => x.id !== el.dataset.id); ftSave("flog"); scheduleRender(); },
  reqMail() { const s = FT_ST.req; location.href = ftMail(s.to, s.cc, `Trip request: N282BT ${s.f.route || ""} ${s.f.date || ""}`.trim(), ftReqText(s.f)); },
  reqCopy() { ftShare("Trip request", ftReqText(FT_ST.req.f)); },
  reqClear() { FT_ST.req.f = {}; ftSave("req"); scheduleRender(); },
  closeMail() { const s = FT_ST.close, t = s.trips[s.sel] || {}; const f = S.flights.find(x => x.id === s.sel); const name = f ? `${f.start} ${f.route || ""}` : (t.name || "trip"); const docs = FT_CLOSE.filter(([k]) => t[k] && !["ji", "duty"].includes(k)).map(([, l]) => "- " + l); location.href = ftMail(s.to, "", `Trip close-out: N282BT ${name}`, `Close-out documents for N282BT, ${name}.\n\nAttached:\n${docs.join("\n") || "- (none ticked)"}\n\n${(ME && ME.name) || ""}`); },
  loadAdd() { FT_ST.load.items.push({d: "", w: "", arm: ""}); ftSave("load"); scheduleRender(); },
  emphAck(el) { FT_ST.emph.ack[el.dataset.id] = new Date().toISOString(); ftSave("emph"); scheduleRender(); },
  taskDone(el) { FT_ST.tasks.done[el.dataset.id] = iso(TODAY); ftSave("tasks"); toast("Marked done"); scheduleRender(); },
  taskDel(el) { if (!confirm("Delete this task from this device?")) return; const s = FT_ST.tasks; s.list = s.list.filter(t => t.id !== el.dataset.id); ftSave("tasks"); scheduleRender(); },
  taskAdd() { const s = FT_ST.tasks, d = s.draft || {}; if (!String(d.title || "").trim()) { toast("Give the task a name"); return; } s.list.push({id: ftId(), title: d.title.trim(), freq: d.freq || "monthly", day: +d.day || 1, wd: +d.wd || 1, every: +d.every || 7, start: iso(TODAY), who: d.who || ""}); s.draft = {freq: d.freq || "monthly", day: "1", wd: "1", every: "7"}; ftSave("tasks"); scheduleRender(); },
  expAdd() { const s = FT_ST.exp, d = s.draft || {}; if (!ftNum(d.amt)) { toast("Enter an amount"); return; } s.items.push({id: ftId(), date: d.date || iso(TODAY), cat: d.cat || "Other", amt: ftNum(d.amt), trip: d.trip || "", note: d.note || ""}); s.draft = {date: d.date, cat: d.cat}; ftSave("exp"); scheduleRender(); },
  expDel(el) { if (!confirm("Delete this expense from this device?")) return; const s = FT_ST.exp; s.items = s.items.filter(x => x.id !== el.dataset.id); ftSave("exp"); scheduleRender(); }
};
document.addEventListener("click", e => {
  if (!FK || e.target.closest("dialog")) return;
  const g = e.target.closest("[data-ft-go]");
  if (g) { e.stopPropagation(); ui.ftv = g.dataset.ftGo || null; if (g.dataset.m) ui.ftM = g.dataset.m; ui.ftDest = null; go("tools"); return; }
  const a = e.target.closest("[data-ft-act]");
  if (a && FT_ACT[a.dataset.ftAct]) { e.preventDefault(); e.stopPropagation(); FT_ACT[a.dataset.ftAct](a); return; }
  const d = e.target.closest("[data-ft-dest]");
  if (d) { e.stopPropagation(); ui.ftDest = d.dataset.ftDest || null; render(); window.scrollTo(0, 0); return; }
  const m = e.target.closest("[data-ft-m]");
  if (m) { e.stopPropagation(); ui.ftM = ui.ftM === m.dataset.ftM ? "-" : m.dataset.ftM; render(); return; }
  const at = e.target.closest("[data-ft-att]");
  if (at && !e.target.closest("[data-edit]")) { e.stopPropagation(); ui.ftAtt = ui.ftAtt === at.dataset.ftAtt ? null : at.dataset.ftAtt; render(); return; }
}, true);
document.addEventListener("input", e => {
  const el = e.target.closest && e.target.closest("[data-ft-in]"); if (!el || el.tagName === "SELECT") return;
  ftSetKey(el.dataset.ftIn, el.value);
  if (el.dataset.ftIn === "dest:q") scheduleRender();
});
let ftRT = 0;
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset && el.dataset.ftIn) { ftSetKey(el.dataset.ftIn, el.value); if (el.tagName === "SELECT" || el.type === "date") scheduleRender(); else { clearTimeout(ftRT); ftRT = setTimeout(scheduleRender, 350); } return; }
  if (el.dataset && el.dataset.ftCk) { ftSetKey(el.dataset.ftCk, el.checked); scheduleRender(); return; }
  if (el.dataset && el.dataset.ftRadio) { ftSetKey(el.dataset.ftRadio, +el.value); scheduleRender(); return; }
});
