/* LEADFLIX — SOC 2 lead theater */
"use strict";

const DATA_URL = "./data/leads.json";
const FIRMS_URL = "./data/firms.json";
const LS_KEY = "leadflix-pipeline-v1";
const PIPELINE = ["New", "Contacted", "Replied", "Meeting", "Won", "Passed"];
const FIRM_PIPELINE = ["New", "Contacted", "Call booked", "Ran scan", "Validated", "Referring", "Passed"];
const TIER_LABEL = { hot: "Hot lead", warm: "Warm", watch: "Watch", attested: "Attested" };
const FTIER_LABEL = { prime: "Prime target", strong: "Strong", bench: "Bench" };
const FTIER_CLASS = { prime: "hot", strong: "warm", bench: "watch" };

let LEADS = [];
let FIRMS = [];
let META = {};
let mode = "leads";
let state = { tier: "all", q: "", sector: "", batch: "", aws: "", pstatus: "", grc: "" };
let crm = loadCrm();

function loadCrm() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveCrm() { localStorage.setItem(LS_KEY, JSON.stringify(crm)); }
function rec(slug) { return crm[slug] || {}; }
function setRec(slug, patch) { crm[slug] = { ...rec(slug), ...patch }; saveCrm(); }

/* ---------- data ---------- */
async function boot() {
  const res = await fetch(DATA_URL);
  const payload = await res.json();
  LEADS = payload.leads;
  META = payload.meta || {};
  try {
    const fres = await fetch(FIRMS_URL);
    if (fres.ok) FIRMS = (await fres.json()).firms || [];
  } catch { /* firms.json optional */ }
  if (!FIRMS.length) document.getElementById("mode-nav").hidden = true;
  document.getElementById("foot-date").textContent =
    "research date " + (payload.generated_at || "");
  populateFacets();
  bind();
  render();
}

function populateFacets() {
  const sectors = [...new Set(LEADS.flatMap(l => l.sectors || []))].sort();
  const sSel = document.getElementById("f-sector");
  sectors.forEach(s => sSel.append(new Option("Sector: " + s, s)));
  const batches = [...new Set(LEADS.map(l => l.batch))].sort().reverse();
  const bSel = document.getElementById("f-batch");
  batches.forEach(b => bSel.append(new Option("Batch: " + b, b)));
  const grcs = [...new Set(FIRMS.flatMap(f => f.grc_partnerships || []))].sort();
  const gSel = document.getElementById("f-grc");
  grcs.forEach(g => gSel.append(new Option("GRC: " + g, g)));
}

/* ---------- filtering ---------- */
function visible() {
  const q = state.q.toLowerCase();
  return LEADS.filter(l => {
    if (state.tier !== "all" && l.tier !== state.tier) return false;
    if (state.sector && !(l.sectors || []).includes(state.sector)) return false;
    if (state.batch && l.batch !== state.batch) return false;
    if (state.aws && l.aws_native !== state.aws) return false;
    if (state.pstatus && (rec(l.slug).status || "New") !== state.pstatus) return false;
    if (q) {
      const hay = [
        l.name, l.one_liner, l.batch, l.locations,
        (l.tags || []).join(" "),
        (l.founders || []).map(f => f.name).join(" "),
        (l.contacts || []).map(c => c.name).join(" "),
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function visibleFirms() {
  const q = state.q.toLowerCase();
  return FIRMS.filter(f => {
    if (state.grc && !(f.grc_partnerships || []).includes(state.grc)) return false;
    if (state.pstatus && (rec("firm:" + f.slug).status || "New") !== state.pstatus) return false;
    if (q) {
      const hay = [
        f.name, f.hq, f.team_size_estimate, f.partnership_angle,
        (f.grc_partnerships || []).join(" "),
        (f.services || []).join(" "),
        (f.contacts || []).map(c => c.name).join(" "),
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const filtersActive = () => mode === "firms"
  ? state.q || state.grc || state.pstatus
  : state.q || state.sector || state.batch || state.aws || state.pstatus || state.tier !== "all";

/* ---------- rendering ---------- */
function render() {
  document.body.classList.toggle("mode-firms", mode === "firms");
  if (mode === "firms") return renderFirmsView();
  const vis = visible();
  document.getElementById("meta-line").textContent =
    `${vis.length} leads · ${vis.filter(l => l.tier === "hot").length} hot · ` +
    `${vis.filter(l => l.aws_native === "yes").length} aws-confirmed`;

  const billboard = document.getElementById("billboard");
  const shelves = document.getElementById("shelves");
  const gridView = document.getElementById("grid-view");
  const empty = document.getElementById("empty");

  empty.hidden = vis.length > 0;

  if (filtersActive()) {
    billboard.hidden = true;
    shelves.innerHTML = "";
    gridView.hidden = vis.length === 0;
    document.getElementById("grid-title").textContent = `Results (${vis.length})`;
    const grid = document.getElementById("grid");
    grid.innerHTML = "";
    vis.forEach(l => grid.append(card(l)));
    return;
  }

  gridView.hidden = true;
  renderBillboard(billboard);
  renderShelves(shelves);
}

function renderFirmsView() {
  const vis = visibleFirms();
  document.getElementById("meta-line").textContent =
    `${vis.length} audit firms · ${vis.filter(f => f.tier === "prime").length} prime targets · ` +
    `${vis.filter(f => f.founder_led).length} founder-led`;

  const billboard = document.getElementById("billboard");
  const shelves = document.getElementById("shelves");
  const gridView = document.getElementById("grid-view");
  const empty = document.getElementById("empty");

  empty.hidden = vis.length > 0;

  if (filtersActive()) {
    billboard.hidden = true;
    shelves.innerHTML = "";
    gridView.hidden = vis.length === 0;
    document.getElementById("grid-title").textContent = `Results (${vis.length})`;
    const grid = document.getElementById("grid");
    grid.innerHTML = "";
    vis.forEach(f => grid.append(firmCard(f)));
    return;
  }

  gridView.hidden = true;
  renderFirmBillboard(billboard);
  renderFirmShelves(shelves);
}

function renderFirmBillboard(el) {
  const top = FIRMS.filter(f => f.tier === "prime")[0];
  if (!top) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    <div class="bb-watermark">${esc(top.name[0])}</div>
    <div class="bb-eyebrow">#1 partner target · audit firm</div>
    <h1 class="bb-name">${esc(top.name)}</h1>
    <p class="bb-liner">${esc(top.partnership_angle || "")}</p>
    <div class="bb-badges">${firmBadges(top).join("")}</div>
    <div class="bb-actions">
      <button class="btn-primary" data-open="${esc(top.slug)}">Open dossier</button>
      <button class="btn-secondary" data-pipe="${esc(top.slug)}">+ Mark contacted</button>
      <span class="bb-match">${top.fit_score}% partner fit</span>
    </div>`;
  el.querySelector("[data-open]").onclick = () => openFirmModal(top.slug);
  el.querySelector("[data-pipe]").onclick = () => { setRec("firm:" + top.slug, { status: "Contacted" }); render(); };
}

function firmShelfDefs() {
  const byGrc = g => FIRMS.filter(f => (f.grc_partnerships || []).some(x => x.toLowerCase().includes(g)));
  return [
    { title: "Top 10 · Partner targets", ranked: true, items: FIRMS.filter(f => f.tier === "prime").slice(0, 10) },
    { title: "My partner pipeline", items: FIRMS.filter(f => { const s = rec("firm:" + f.slug).status; return s && s !== "New"; }) },
    { title: "Founder-led boutiques", items: FIRMS.filter(f => f.founder_led) },
    { title: "Vanta network", items: byGrc("vanta") },
    { title: "Drata / Secureframe network", items: FIRMS.filter(f => (f.grc_partnerships || []).some(x => /drata|secureframe/i.test(x))) },
    { title: "AWS / cloud-fluent", items: FIRMS.filter(f => f.aws_cloud_expertise) },
    { title: "Strong bench", items: FIRMS.filter(f => f.tier === "strong") },
    { title: "Long shots", items: FIRMS.filter(f => f.tier === "bench") },
  ];
}

function renderFirmShelves(el) {
  el.innerHTML = "";
  firmShelfDefs().forEach(def => {
    if (!def.items.length) return;
    const sec = document.createElement("section");
    sec.className = "shelf";
    const h = document.createElement("h2");
    h.className = "shelf-title";
    h.innerHTML = `${esc(def.title)} <span class="count">${def.items.length}</span>`;
    const row = document.createElement("div");
    row.className = "shelf-row";
    def.items.forEach((f, i) => {
      if (def.ranked) {
        const wrap = document.createElement("div");
        wrap.className = "ranked-item";
        const n = document.createElement("div");
        n.className = "rank-num";
        n.textContent = i + 1;
        wrap.append(n, firmCard(f));
        row.append(wrap);
      } else {
        row.append(firmCard(f));
      }
    });
    sec.append(h, row);
    el.append(sec);
  });
}

function firmBadges(f) {
  const out = [];
  if (f.team_size_estimate) out.push(`<span class="badge">${esc(f.team_size_estimate)}</span>`);
  if (f.founder_led) out.push(`<span class="badge hl">founder-led</span>`);
  (f.grc_partnerships || []).slice(0, 3).forEach(g => out.push(`<span class="badge hl">${esc(g)}</span>`));
  if (f.aws_cloud_expertise) out.push(`<span class="badge">AWS-fluent</span>`);
  if (f.founded) out.push(`<span class="badge">est. ${esc(f.founded)}</span>`);
  return out;
}

function firmCard(f) {
  const el = document.createElement("article");
  el.className = "card" + (f.tier === "bench" ? " attested" : "");
  el.tabIndex = 0;
  const primary = (f.contacts && f.contacts[0]) || {};
  const status = rec("firm:" + f.slug).status;
  el.innerHTML = `
    <span class="stamp ${FTIER_CLASS[f.tier] || "watch"}">${FTIER_LABEL[f.tier] || f.tier}</span>
    <div class="card-head">
      <div class="card-logo">${esc(f.name[0])}</div>
      <div>
        <div class="card-name">${esc(f.name)}</div>
        <div class="card-batch">${esc(f.hq || "—")}${f.team_size_estimate ? " · " + esc(f.team_size_estimate) : ""}</div>
      </div>
    </div>
    <p class="card-liner">${esc(f.partnership_angle || "")}</p>
    <div class="card-stats">
      <span class="match">${f.fit_score}%</span>
      <span>${esc((f.grc_partnerships || []).slice(0, 2).join(", ") || "no GRC ties")}</span>
      ${f.aws_cloud_expertise ? "<span>AWS</span>" : ""}
    </div>
    <div class="card-quick">
      ${primary.linkedin ? `<a class="icon-link" href="${esc(primary.linkedin)}" target="_blank" rel="noopener">in</a>` : ""}
      ${primary.twitter ? `<a class="icon-link" href="${esc(primary.twitter)}" target="_blank" rel="noopener">𝕏</a>` : ""}
      ${f.website ? `<a class="icon-link" href="${esc(f.website)}" target="_blank" rel="noopener">web</a>` : ""}
      <span class="pipe-tag ${status && status !== "New" ? "" : "quiet"}">${esc(status || "New")}</span>
    </div>`;
  el.addEventListener("click", e => { if (!e.target.closest("a")) openFirmModal(f.slug); });
  el.addEventListener("keydown", e => { if (e.key === "Enter") openFirmModal(f.slug); });
  return el;
}

function openFirmModal(slug) {
  const f = FIRMS.find(x => x.slug === slug);
  if (!f) return;
  const key = "firm:" + slug;
  const body = document.getElementById("modal-body");
  body.innerHTML = `
    <div class="m-eyebrow">${FTIER_LABEL[f.tier] || f.tier} · ${f.fit_score}% partner fit</div>
    <h2 class="m-name" id="m-name">${esc(f.name)}</h2>
    <p class="m-liner">${esc(f.partnership_angle || "")}</p>
    <div class="m-badges">${firmBadges(f).join("")}
      ${f.website ? `<a class="badge" href="${esc(f.website)}" target="_blank" rel="noopener">${esc(host(f.website))} ↗</a>` : ""}
    </div>
    <div class="m-cols">
      <div class="m-section">
        <h3>Contacts</h3>
        ${(f.contacts || []).map(c => `
          <div class="contact-row">
            <div>
              <div class="contact-name">${esc(c.name || "")}</div>
              <div class="contact-role">${esc(c.role || "")}</div>
            </div>
            <div class="contact-links">
              ${c.linkedin ? `<a class="icon-link" href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}
              ${c.twitter ? `<a class="icon-link" href="${esc(c.twitter)}" target="_blank" rel="noopener">𝕏</a>` : ""}
              ${c.email ? `<a class="icon-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}
              ${c.phone ? `<a class="icon-link" href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}
            </div>
          </div>`).join("") || `<p class="kv">No public contacts found.</p>`}
        <h3>Outreach play</h3>
        <p class="pitch">${esc(f.pitch_note || "")}</p>
        <h3>Partner pipeline</h3>
        <div class="m-pipeline" id="m-pipeline">
          ${FIRM_PIPELINE.map(p => `<button class="pipe-btn ${(rec(key).status || "New") === p ? "is-active" : ""}" data-p="${p}">${p}</button>`).join("")}
        </div>
        <textarea id="m-notes" placeholder="Notes… (saved locally)">${esc(rec(key).notes || "")}</textarea>
      </div>
      <div class="m-section">
        <h3>Startup-focus evidence</h3>
        <ul class="evidence">
          ${(f.startup_focus_evidence || []).map(e => `<li>${esc(e.signal)} ${e.source_url ? `— <a href="${esc(e.source_url)}" target="_blank" rel="noopener">source</a>` : ""}</li>`).join("") || "<li>No direct evidence collected.</li>"}
        </ul>
        <h3>GRC ecosystem</h3>
        <div class="kv">${(f.grc_partnerships || []).map(esc).join(", ") || "No GRC platform partnerships found."}</div>
        <h3>Cloud / AWS</h3>
        <div class="kv">${esc(f.aws_cloud_expertise || "No cloud specialization signals found.")}</div>
        <h3>Services</h3>
        <div class="kv">${(f.services || []).slice(0, 8).map(esc).join(", ") || "—"}</div>
        <h3>Firm facts</h3>
        <div class="kv"><b>HQ:</b> ${esc(f.hq || "—")}</div>
        <div class="kv"><b>Founded:</b> ${esc(f.founded || "unknown")}</div>
        <div class="kv"><b>Team:</b> ${esc(f.team_size_estimate || "unknown")}</div>
        <div class="kv"><b>Sources:</b> ${(f.source_urls || []).slice(0, 5).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">[${i + 1}]</a>`).join(" ")}</div>
      </div>
    </div>`;
  body.querySelectorAll(".pipe-btn").forEach(b => {
    b.onclick = () => { setRec(key, { status: b.dataset.p }); openFirmModal(slug); render(); };
  });
  body.querySelector("#m-notes").addEventListener("input", e => setRec(key, { notes: e.target.value }));
  document.getElementById("modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function renderBillboard(el) {
  const top = LEADS.filter(l => l.tier === "hot")[0];
  if (!top) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    <div class="bb-watermark">${esc(top.name[0])}</div>
    <div class="bb-eyebrow">#1 hot lead · ${esc(top.batch)}</div>
    <h1 class="bb-name">${esc(top.name)}</h1>
    <p class="bb-liner">${esc(top.one_liner || "")}</p>
    <div class="bb-badges">${badges(top).join("")}</div>
    <div class="bb-actions">
      <button class="btn-primary" data-open="${esc(top.slug)}">Open dossier</button>
      <button class="btn-secondary" data-pipe="${esc(top.slug)}">+ Mark contacted</button>
      <span class="bb-match">${top.fit_score}% ICP match</span>
    </div>`;
  el.querySelector("[data-open]").onclick = () => openModal(top.slug);
  el.querySelector("[data-pipe]").onclick = () => { setRec(top.slug, { status: "Contacted" }); render(); };
}

function shelfDefs() {
  const bySec = s => LEADS.filter(l => (l.sectors || []).includes(s) && l.tier !== "attested");
  return [
    { title: "Top 10 · Hot Leads", ranked: true, items: LEADS.filter(l => l.tier === "hot").slice(0, 10) },
    { title: "SOC 2 already in motion", items: LEADS.filter(l => l.soc2_status === "in_progress") },
    { title: "My pipeline", items: LEADS.filter(l => rec(l.slug).status && rec(l.slug).status !== "New") },
    { title: "AWS-native", items: LEADS.filter(l => l.aws_native === "yes" && l.tier !== "attested") },
    { title: "Fintech", items: bySec("Fintech") },
    { title: "Healthtech", items: bySec("Healthtech") },
    { title: "AI / Infrastructure", items: bySec("AI/Infra") },
    { title: "Warm bench", items: LEADS.filter(l => l.tier === "warm") },
    { title: "Watchlist · not yet researched deeply", items: LEADS.filter(l => l.tier === "watch").slice(0, 40) },
    { title: "Already attested · low priority", items: LEADS.filter(l => l.tier === "attested") },
  ];
}

function renderShelves(el) {
  el.innerHTML = "";
  shelfDefs().forEach(def => {
    if (!def.items.length) return;
    const sec = document.createElement("section");
    sec.className = "shelf";
    const h = document.createElement("h2");
    h.className = "shelf-title";
    h.innerHTML = `${esc(def.title)} <span class="count">${def.items.length}</span>`;
    const row = document.createElement("div");
    row.className = "shelf-row";
    def.items.forEach((l, i) => {
      if (def.ranked) {
        const wrap = document.createElement("div");
        wrap.className = "ranked-item";
        const n = document.createElement("div");
        n.className = "rank-num";
        n.textContent = i + 1;
        wrap.append(n, card(l));
        row.append(wrap);
      } else {
        row.append(card(l));
      }
    });
    sec.append(h, row);
    el.append(sec);
  });
}

function badges(l) {
  const out = [];
  out.push(`<span class="badge">${esc(l.batch)}</span>`);
  out.push(`<span class="badge">${l.team_size} ppl</span>`);
  if (l.aws_native === "yes") out.push(`<span class="badge hl">AWS-native</span>`);
  if (l.soc2_status === "likely_needs") out.push(`<span class="badge hl">needs SOC 2</span>`);
  if (l.soc2_status === "in_progress") out.push(`<span class="badge hl">SOC 2 in progress</span>`);
  if (l.soc2_status === "has_soc2") out.push(`<span class="badge">SOC 2 ✓</span>`);
  if (l.funding && l.funding.stage) out.push(`<span class="badge">${esc(l.funding.stage)}</span>`);
  if (l.is_hiring) out.push(`<span class="badge">hiring</span>`);
  return out;
}

function card(l) {
  const el = document.createElement("article");
  el.className = "card" + (l.tier === "attested" ? " attested" : "");
  el.tabIndex = 0;
  const primary = (l.contacts && l.contacts[0]) || (l.founders && l.founders[0]) || {};
  const status = rec(l.slug).status;
  const logo = l.logo
    ? `<img class="card-logo" src="${esc(l.logo)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=card-logo>${esc(l.name[0])}</div>'">`
    : `<div class="card-logo">${esc(l.name[0])}</div>`;
  el.innerHTML = `
    <span class="stamp ${l.tier}">${TIER_LABEL[l.tier] || l.tier}</span>
    <div class="card-head">
      ${logo}
      <div>
        <div class="card-name">${esc(l.name)}</div>
        <div class="card-batch">${esc(l.batch)} · ${l.team_size} ppl</div>
      </div>
    </div>
    <p class="card-liner">${esc(l.one_liner || "")}</p>
    <div class="card-stats">
      <span class="match">${l.fit_score}%</span>
      <span>${esc(shortStatus(l))}</span>
      ${l.aws_native === "yes" ? "<span>AWS</span>" : ""}
    </div>
    <div class="card-quick">
      ${primary.linkedin ? `<a class="icon-link" href="${esc(primary.linkedin)}" target="_blank" rel="noopener">in</a>` : ""}
      ${primary.twitter ? `<a class="icon-link" href="${esc(primary.twitter)}" target="_blank" rel="noopener">𝕏</a>` : ""}
      ${l.website ? `<a class="icon-link" href="${esc(l.website)}" target="_blank" rel="noopener">web</a>` : ""}
      <span class="pipe-tag ${status && status !== "New" ? "" : "quiet"}">${esc(status || "New")}</span>
    </div>`;
  el.addEventListener("click", e => { if (!e.target.closest("a")) openModal(l.slug); });
  el.addEventListener("keydown", e => { if (e.key === "Enter") openModal(l.slug); });
  return el;
}

function shortStatus(l) {
  return { has_soc2: "attested", in_progress: "in progress", likely_needs: "needs SOC 2", unknown: "status unknown" }[l.soc2_status] || "unresearched";
}

/* ---------- modal ---------- */
function openModal(slug) {
  const l = LEADS.find(x => x.slug === slug);
  if (!l) return;
  const body = document.getElementById("modal-body");
  const contacts = (l.contacts && l.contacts.length ? l.contacts : (l.founders || []).map(f => ({
    name: f.name, role: f.title || "Founder", linkedin: f.linkedin, twitter: f.twitter, email: null,
  })));
  body.innerHTML = `
    <div class="m-eyebrow">${TIER_LABEL[l.tier] || l.tier} · ${l.fit_score}% ICP match</div>
    <h2 class="m-name" id="m-name">${esc(l.name)}</h2>
    <p class="m-liner">${esc(l.one_liner || "")}</p>
    <div class="m-badges">${badges(l).join("")}
      <a class="badge" href="${esc(l.yc_url)}" target="_blank" rel="noopener">YC profile ↗</a>
      ${l.website ? `<a class="badge" href="${esc(l.website)}" target="_blank" rel="noopener">${esc(host(l.website))} ↗</a>` : ""}
    </div>
    <div class="m-cols">
      <div class="m-section">
        <h3>Contacts</h3>
        ${contacts.map(c => `
          <div class="contact-row">
            <div>
              <div class="contact-name">${esc(c.name || "")}</div>
              <div class="contact-role">${esc(c.role || "")}</div>
            </div>
            <div class="contact-links">
              ${c.linkedin ? `<a class="icon-link" href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}
              ${c.twitter ? `<a class="icon-link" href="${esc(c.twitter)}" target="_blank" rel="noopener">𝕏</a>` : ""}
              ${c.email ? `<a class="icon-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}
            </div>
          </div>`).join("") || `<p class="kv">No public contacts found.</p>`}
        <h3>Why this lead</h3>
        <p class="pitch">${esc(l.pitch_note || l.long_description || "Not yet deeply researched — in the watchlist tier.")}</p>
        <h3>Pipeline</h3>
        <div class="m-pipeline" id="m-pipeline">
          ${PIPELINE.map(p => `<button class="pipe-btn ${(rec(l.slug).status || "New") === p ? "is-active" : ""}" data-p="${p}">${p}</button>`).join("")}
        </div>
        <textarea id="m-notes" placeholder="Notes… (saved locally)">${esc(rec(l.slug).notes || "")}</textarea>
      </div>
      <div class="m-section">
        <h3>SOC 2 signals</h3>
        <ul class="evidence">
          ${(l.soc2_evidence || []).map(e => `<li>${esc(e.signal)} ${e.source_url ? `— <a href="${esc(e.source_url)}" target="_blank" rel="noopener">source</a>` : ""}</li>`).join("") || "<li>No direct evidence collected yet.</li>"}
        </ul>
        <h3>Hiring signals</h3>
        <ul class="evidence">
          ${(l.hiring_signals || []).map(h => `<li>${esc(h)}</li>`).join("") || "<li>None found.</li>"}
        </ul>
        <h3>Funding</h3>
        ${l.funding ? `
          <div class="kv"><b>${esc(l.funding.stage || "unknown")}</b>
            ${l.funding.total_usd_estimate ? "· ~$" + fmtUsd(l.funding.total_usd_estimate) : ""}
            ${l.funding.source_url ? `· <a href="${esc(l.funding.source_url)}" target="_blank" rel="noopener">source</a>` : ""}
          </div>` : `<div class="kv">Unknown — likely YC standard deal only.</div>`}
        <h3>Stack</h3>
        <div class="kv"><b>AWS:</b> ${esc(l.aws_native || "unknown")} ${l.aws_evidence ? "— " + esc(l.aws_evidence) : ""}</div>
        <div class="kv"><b>Tags:</b> ${(l.tags || []).slice(0, 8).map(esc).join(", ")}</div>
        <div class="kv"><b>Location:</b> ${esc(l.locations || "—")}</div>
      </div>
    </div>`;
  body.querySelectorAll(".pipe-btn").forEach(b => {
    b.onclick = () => { setRec(l.slug, { status: b.dataset.p }); openModal(slug); render(); };
  });
  body.querySelector("#m-notes").addEventListener("input", e => setRec(l.slug, { notes: e.target.value }));
  document.getElementById("modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("modal").hidden = true;
  document.body.style.overflow = "";
}

/* ---------- export ---------- */
function exportFirmRows() {
  return visibleFirms().map(f => {
    const c = (f.contacts && f.contacts[0]) || {};
    return {
      name: f.name, website: f.website, hq: f.hq || "", founded: f.founded || "",
      team_size: f.team_size_estimate || "", founder_led: f.founder_led ? "yes" : "",
      tier: f.tier, fit_score: f.fit_score,
      grc_partnerships: (f.grc_partnerships || []).join("; "),
      aws_cloud: f.aws_cloud_expertise || "",
      contact_name: c.name || "", contact_role: c.role || "",
      contact_linkedin: c.linkedin || "", contact_twitter: c.twitter || "",
      contact_email: c.email || "", contact_phone: c.phone || "",
      pipeline_status: rec("firm:" + f.slug).status || "New",
      notes: rec("firm:" + f.slug).notes || "",
      partnership_angle: f.partnership_angle || "", pitch_note: f.pitch_note || "",
    };
  });
}

function exportRows() {
  if (mode === "firms") return exportFirmRows();
  return visible().map(l => {
    const c = (l.contacts && l.contacts[0]) || (l.founders && l.founders[0]) || {};
    return {
      name: l.name, batch: l.batch, website: l.website, team_size: l.team_size,
      tier: l.tier, fit_score: l.fit_score, soc2_status: l.soc2_status || "unresearched",
      aws_native: l.aws_native || "unknown",
      funding_stage: l.funding ? l.funding.stage : "", contact_name: c.name || "",
      contact_role: c.role || c.title || "", contact_linkedin: c.linkedin || "",
      contact_twitter: c.twitter || "", contact_email: c.email || "",
      pipeline_status: rec(l.slug).status || "New", notes: rec(l.slug).notes || "",
      pitch_note: l.pitch_note || "",
    };
  });
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\n");
}

/* ---------- utils & events ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const host = u => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };
const fmtUsd = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : Math.round(n / 1e3) + "K";

function setMode(m) {
  mode = m;
  state = { tier: "all", q: "", sector: "", batch: "", aws: "", pstatus: "", grc: "" };
  document.getElementById("search").value = "";
  ["f-sector", "f-batch", "f-aws", "f-status", "f-grc"].forEach(id => document.getElementById(id).value = "");
  document.querySelectorAll("#mode-nav .mode-btn").forEach(b => b.classList.toggle("is-active", b.dataset.mode === m));
  document.querySelectorAll("#tier-nav .chip").forEach(c => c.classList.toggle("is-active", c.dataset.tier === "all"));
  const firmsOn = m === "firms";
  document.getElementById("tier-nav").hidden = firmsOn;
  document.getElementById("f-sector").hidden = firmsOn;
  document.getElementById("f-batch").hidden = firmsOn;
  document.getElementById("f-aws").hidden = firmsOn;
  document.getElementById("f-grc").hidden = !firmsOn;
  const sSel = document.getElementById("f-status");
  const opts = firmsOn ? FIRM_PIPELINE : PIPELINE;
  sSel.innerHTML = `<option value="">Pipeline: any</option>` + opts.map(p => `<option>${p}</option>`).join("");
  document.getElementById("search").placeholder = firmsOn
    ? "Search firms, partners, GRC networks…" : "Search leads, founders, tags…";
  render();
}

function bind() {
  document.getElementById("mode-nav").addEventListener("click", e => {
    const b = e.target.closest("[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  document.getElementById("f-grc").onchange = e => { state.grc = e.target.value; render(); };
  document.getElementById("tier-nav").addEventListener("click", e => {
    const b = e.target.closest("[data-tier]");
    if (!b) return;
    state.tier = b.dataset.tier;
    document.querySelectorAll("#tier-nav .chip").forEach(c => c.classList.toggle("is-active", c === b));
    render();
  });
  let t;
  document.getElementById("search").addEventListener("input", e => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 160);
  });
  document.getElementById("f-sector").onchange = e => { state.sector = e.target.value; render(); };
  document.getElementById("f-batch").onchange = e => { state.batch = e.target.value; render(); };
  document.getElementById("f-aws").onchange = e => { state.aws = e.target.value; render(); };
  document.getElementById("f-status").onchange = e => { state.pstatus = e.target.value; render(); };
  document.getElementById("clear-filters").onclick = () => {
    state = { tier: "all", q: "", sector: "", batch: "", aws: "", pstatus: "", grc: "" };
    document.getElementById("search").value = "";
    ["f-sector", "f-batch", "f-aws", "f-status", "f-grc"].forEach(id => document.getElementById(id).value = "");
    document.querySelectorAll("#tier-nav .chip").forEach(c => c.classList.toggle("is-active", c.dataset.tier === "all"));
    render();
  };
  document.getElementById("export-csv").onclick = () =>
    download(mode === "firms" ? "leadflix-firms.csv" : "leadflix-leads.csv", toCsv(exportRows()), "text/csv");
  document.getElementById("export-json").onclick = () =>
    download(mode === "firms" ? "leadflix-firms.json" : "leadflix-leads.json", JSON.stringify(exportRows(), null, 1), "application/json");
  document.getElementById("modal-close").onclick = closeModal;
  document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

boot();
