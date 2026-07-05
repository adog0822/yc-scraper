# Plan: YC Post-2023 SOC 2 Lead Research + Netflix-Style CRM

**ICP:** Lean, AWS-native SaaS/AI/Fintech/Healthtech (regulated-industry) startups, 1–30 employees,
undergoing or considering SOC 2 Type I. Target contact: Founder / CTO / VP Eng.

## Phase 0 — Documentation Discovery (DONE)
- **Allowed API:** `https://yc-oss.github.io/api/` (yc-oss static JSON, daily-updated from YC's Algolia index).
  - `meta.json` → valid batch names; `batches/{season-year}.json` → company arrays.
  - Company schema: `name, slug, website, one_liner, long_description, team_size, industry, subindustry,
    industries[], tags[], batch, status, isHiring, all_locations, url, api`.
  - **Anti-pattern:** yc-oss has NO founder data, NO funding data. Do not invent fields.
- **Founder data source:** `https://www.ycombinator.com/companies/{slug}` pages embed JSON in `[data-page]`
  attribute → `props.company.founders[]` with `full_name, title, founder_bio, linkedin_url, twitter_url`
  (pattern proven in `scrapy-project/ycombinator/spiders/yscraper.py`).
- **Repo pipeline** (Selenium → Scrapy → `data/companies.json`) is NOT reused for extraction (too slow);
  we reuse its output convention: static JSON consumed by a static HTML/JS app.

## Phase 1 — Candidate pull & hard filter (cheap, deterministic)
1. `curl meta.json` → enumerate batches after 2023 (Winter 2024 → present).
2. Fetch each batch JSON into `research/raw/`.
3. Python filter (`research/filter_candidates.py`):
   - `status == "Active"`, `1 <= team_size <= 30`
   - Sector: industries/tags intersect {B2B/SaaS, Fintech, Healthcare, AI, Security, Compliance,
     Legal, Gov, Insurance, Real-estate-fintech} — i.e. SaaS/AI/Healthtech/Fintech/regulated.
   - Score for likely-SOC2 need: +fintech/health (regulated buyer), +B2B enterprise tags, +isHiring.
4. Output `research/candidates.json` ranked. Expect ~1,500 raw → few hundred filtered.
- **Verify:** counts per batch printed; spot-check 3 companies against ycombinator.com.

## Phase 2 — Founder enrichment (scripted, no LLM tokens)
1. `research/fetch_founders.py`: for top ~120 candidates, GET `ycombinator.com/companies/{slug}`,
   parse `[data-page]` JSON → founders (name, title, linkedin, twitter), plus company linkedin_url.
   Rate-limit ~1 req/1.5s, checkpoint to `research/founders_checkpoint.json`.
2. Merge → `research/enriched.json`.
- **Verify:** ≥80% of fetched companies have ≥1 founder with a LinkedIn URL.

## Phase 3 — Parallel deep research (dispatching-parallel-agents)
Invoke `superpowers:dispatching-parallel-agents`. Dispatch ~8 research agents, each assigned a slice of
the top ~60–80 scored candidates. Each agent, per company (WebSearch + WebFetch):
- **SOC 2 status:** trust page / "SOC 2" mention on site (has it already = DISQUALIFY-ish → mark "has_soc2");
  absence + enterprise-B2B posture = candidate. Job postings mentioning GRC/Security Engineer/SOC 2/
  DevOps/founding-infra roles = strong signal.
- **Funding:** recent seed/Series A, total raised < $10M (YC standard deal ~$500k implies seed-stage default).
- **AWS-native:** job posts/docs/blog mentioning AWS, or engineering stack pages.
- **Contacts:** confirm founder/CTO LinkedIn from Phase 2, find X handle, guessable email (hello@/first@domain)
  ONLY if publicly listed.
Agents return STRICT JSON per company: `{slug, soc2_status: has|in_progress|likely_needs|unknown,
signals[], funding: {stage, total_usd, source}, aws_native: true|false|unknown, contacts[], fit_score 0-100, notes}`.
- **Verify:** every claim carries a source URL; agents told to write "unknown" over guessing.

## Phase 4 — Merge & lead scoring
`research/build_leads.py`: merge Phase 1–3 → `data/leads.json`. Tiering:
- **Hot:** fits ICP + active hiring/SOC2 signal + contact found
- **Warm:** fits ICP, weaker signals
- **Watch:** partial fit / unknowns
Exclude confirmed has-SOC2 companies into a "Already Attested" shelf (still useful context).
- **Verify:** JSON validates against the CRM's expected shape; counts reported.

## Phase 5 — Netflix-style CRM (frontend-design skill)
New static app in `crm/` (keep existing explorer untouched): `crm/index.html + crm/app.js + crm/styles.css`,
loads `data/leads.json`.
- **Theme:** bg `#080c18`, primary `#f5a623`; Netflix idioms: hero billboard (top lead), horizontal
  scrolling shelves by tier/sector ("Hot Leads", "Fintech", "Healthtech", "AWS-Native"…), hover-scale
  cards with logo, poster-style cards, detail modal with founder contacts + signals + source links,
  search + filters, CRM affordances: status pipeline (New → Contacted → Replied → Meeting), notes,
  localStorage persistence, CSV/JSON export.
- **Verify:** open via preview server, snapshot check: shelves render, modal opens, contacts clickable,
  theme colors correct via preview_inspect.

## Phase 6 — Final verification
- Re-validate leads.json field integrity (no invented fields, all sources present).
- Browser QA of CRM (search, filter, pipeline drag/status, export).
- Summary report: totals, tier counts, notable hot leads.
