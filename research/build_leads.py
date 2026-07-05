#!/usr/bin/env python3
"""Phase 4: merge candidates + founder enrichment + agent research -> crm/data/leads.json."""
import json
import glob
import os
import datetime

BASE = os.path.dirname(__file__)
ENRICHED = os.path.join(BASE, "enriched.json")
RESULTS_GLOB = os.path.join(BASE, "agent_results", "slice_*.json")
OUT_DIR = os.path.join(BASE, "..", "crm", "data")
OUT = os.path.join(OUT_DIR, "leads.json")

FINTECH = {"fintech", "payments", "banking-as-a-service", "insurance", "accounting", "tax", "payroll"}
HEALTH = {"healthcare", "health-tech", "digital-health", "healthcare-it", "telehealth",
          "health-insurance", "medical-devices", "hipaa"}
AIINFRA = {"ai", "artificial-intelligence", "machine-learning", "generative-ai", "llms",
           "developer-tools", "api", "infrastructure", "data-engineering", "aiops", "ai-assistant"}


def sectors_for(c):
    tags = {str(t).lower() for t in (c.get("tags") or [])}
    inds = {str(i).lower() for i in (c.get("industries") or [])}
    out = []
    if tags & FINTECH or "fintech" in inds:
        out.append("Fintech")
    if tags & HEALTH or "healthcare" in inds:
        out.append("Healthtech")
    if tags & AIINFRA:
        out.append("AI/Infra")
    if "b2b" in inds or "saas" in tags:
        out.append("SaaS/B2B")
    if "government" in inds or tags & {"govtech", "defense", "compliance", "regtech", "legaltech", "security", "cybersecurity"}:
        out.append("Regulated/Other")
    return out or ["SaaS/B2B"]


def tier_for(lead, researched):
    if lead.get("soc2_status") == "has_soc2":
        return "attested"
    if not researched:
        return "watch"
    fs = lead.get("fit_score") or 0
    if fs >= 70:
        return "hot"
    if fs >= 50:
        return "warm"
    return "watch"


def main():
    enriched = json.load(open(ENRICHED))
    research = {}
    for path in sorted(glob.glob(RESULTS_GLOB)):
        try:
            for r in json.load(open(path)):
                research[r["slug"]] = r
        except Exception as e:
            print(f"WARN: could not parse {path}: {e}")

    leads = []
    for c in enriched:
        r = research.get(c["slug"], {})
        researched = bool(r)
        lead = {
            **{k: c.get(k) for k in (
                "slug", "name", "website", "one_liner", "long_description", "team_size",
                "batch", "industry", "industries", "tags", "is_hiring", "locations",
                "logo", "yc_url", "soc2_prior", "founders", "company_linkedin",
            )},
            "sectors": sectors_for(c),
            "soc2_status": r.get("soc2_status"),
            "soc2_evidence": r.get("soc2_evidence") or [],
            "hiring_signals": r.get("hiring_signals") or [],
            "funding": r.get("funding"),
            "aws_native": r.get("aws_native") or "unknown",
            "aws_evidence": r.get("aws_evidence"),
            "contacts": r.get("contacts") or [],
            "fit_score": r.get("fit_score") if researched else c.get("soc2_prior"),
            "pitch_note": r.get("pitch_note"),
            "researched": researched,
        }
        lead["tier"] = tier_for(lead, researched)
        leads.append(lead)

    order = {"hot": 0, "warm": 1, "watch": 2, "attested": 3}
    leads.sort(key=lambda x: (order[x["tier"]], -(x["fit_score"] or 0)))

    meta = {
        "total": len(leads),
        "tiers": {t: sum(1 for x in leads if x["tier"] == t) for t in order},
        "researched": sum(1 for x in leads if x["researched"]),
        "aws_confirmed": sum(1 for x in leads if x["aws_native"] == "yes"),
        "with_contact": sum(1 for x in leads if x["contacts"] or any(f.get("linkedin") for f in (x["founders"] or []))),
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump({"generated_at": datetime.date.today().isoformat(), "meta": meta, "leads": leads},
              open(OUT, "w"), indent=1)
    print(json.dumps(meta, indent=1))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
