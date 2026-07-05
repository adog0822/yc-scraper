#!/usr/bin/env python3
"""Phase 1: hard-filter post-2023 YC companies to the ICP candidate pool.

ICP: Active, 1-30 employees, SaaS/AI/Fintech/Healthtech/regulated-industry.
Scores each candidate for likely SOC 2 Type I need so Phase 3 deep research
can prioritize the top of the list.
"""
import json
import glob
import os

RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")
OUT = os.path.join(os.path.dirname(__file__), "candidates.json")

# Sector allowlist (industries[] and tags[] are matched lowercase)
REGULATED_INDUSTRIES = {
    "fintech", "healthcare", "government", "industrials", "real estate and construction",
}
SAAS_INDUSTRIES = {"b2b"}  # B2B umbrella = SaaS in YC taxonomy
SECTOR_TAGS = {
    "saas", "b2b", "fintech", "payments", "banking-as-a-service", "insurance",
    "healthcare", "health-tech", "digital-health", "health-insurance", "medical-devices",
    "healthcare-it", "telehealth", "ai", "artificial-intelligence", "machine-learning",
    "generative-ai", "ai-assistant", "aiops", "llms", "compliance", "regtech", "legaltech",
    "security", "cybersecurity", "identity", "privacy", "govtech", "defense",
    "developer-tools", "api", "infrastructure", "data-engineering", "enterprise",
    "enterprise-software", "hr-tech", "payroll", "accounting", "tax",
}
# Tags signalling a regulated/enterprise buyer -> stronger SOC 2 need
SOC2_NEED_TAGS = {
    "fintech", "payments", "banking-as-a-service", "insurance", "healthcare",
    "digital-health", "health-tech", "healthcare-it", "telehealth", "health-insurance",
    "compliance", "regtech", "legaltech", "security", "cybersecurity", "identity",
    "privacy", "govtech", "defense", "enterprise", "enterprise-software", "hipaa",
    "accounting", "tax", "payroll", "hr-tech",
}


def norm(xs):
    return {str(x).strip().lower() for x in (xs or [])}


def sector_match(c):
    inds = norm(c.get("industries")) | {str(c.get("industry", "")).lower()}
    tags = norm(c.get("tags"))
    reasons = []
    if inds & REGULATED_INDUSTRIES:
        reasons.append("regulated-industry:" + ",".join(sorted(inds & REGULATED_INDUSTRIES)))
    if inds & SAAS_INDUSTRIES or "saas" in tags or "b2b" in tags:
        reasons.append("saas/b2b")
    if tags & {"ai", "artificial-intelligence", "machine-learning", "generative-ai", "llms"}:
        reasons.append("ai")
    if tags & SECTOR_TAGS:
        reasons.append("sector-tags:" + ",".join(sorted((tags & SECTOR_TAGS))[:4]))
    return reasons


def soc2_need_score(c):
    """0-100 prior that this company needs SOC 2 soon (before web research)."""
    tags = norm(c.get("tags"))
    inds = norm(c.get("industries")) | {str(c.get("industry", "")).lower()}
    score = 0
    score += 30 if inds & {"fintech", "healthcare", "government"} else 0
    score += min(30, 10 * len(tags & SOC2_NEED_TAGS))
    if "b2b" in inds or "saas" in tags:
        score += 15  # B2B SaaS => enterprise buyers ask for SOC 2
    if c.get("isHiring"):
        score += 10  # hiring = growth = security hires possible
    ts = c.get("team_size") or 0
    if 3 <= ts <= 30:
        score += 10  # big enough to sell, small enough to lack GRC
    elif ts in (1, 2):
        score += 5
    return min(score, 100)


def main():
    candidates = []
    per_batch = {}
    for path in sorted(glob.glob(os.path.join(RAW_DIR, "*.json"))):
        batch_file = os.path.basename(path)
        companies = json.load(open(path))
        kept = 0
        for c in companies:
            ts = c.get("team_size")
            if c.get("status") != "Active":
                continue
            if not isinstance(ts, int) or not (1 <= ts <= 30):
                continue
            reasons = sector_match(c)
            if not reasons:
                continue
            kept += 1
            candidates.append({
                "slug": c.get("slug"),
                "name": c.get("name"),
                "website": c.get("website"),
                "one_liner": c.get("one_liner"),
                "long_description": (c.get("long_description") or "")[:600],
                "team_size": ts,
                "batch": c.get("batch"),
                "industry": c.get("industry"),
                "subindustry": c.get("subindustry"),
                "industries": c.get("industries"),
                "tags": c.get("tags"),
                "is_hiring": c.get("isHiring"),
                "locations": c.get("all_locations"),
                "logo": c.get("small_logo_thumb_url"),
                "yc_url": c.get("url"),
                "sector_reasons": reasons,
                "soc2_prior": soc2_need_score(c),
            })
        per_batch[batch_file] = f"{kept}/{len(companies)}"
    candidates.sort(key=lambda x: -x["soc2_prior"])
    json.dump(candidates, open(OUT, "w"), indent=1)
    print("kept per batch:", json.dumps(per_batch, indent=1))
    print("total candidates:", len(candidates))
    print("score>=60:", sum(1 for c in candidates if c["soc2_prior"] >= 60))
    print("top 5:", [(c["name"], c["soc2_prior"]) for c in candidates[:5]])


if __name__ == "__main__":
    main()
