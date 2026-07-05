#!/usr/bin/env python3
"""Merge audit-firm research results -> crm/data/firms.json."""
import json
import glob
import os
import datetime

BASE = os.path.dirname(__file__)
RESULTS_GLOB = os.path.join(BASE, "firm_results", "*.json")
OUT = os.path.join(BASE, "..", "crm", "data", "firms.json")


GRC_CANON = ["Vanta", "Drata", "Secureframe", "Thoropass", "Oneleet", "Hyperproof",
             "Sprinto", "Scytale", "Tugboat", "AuditBoard", "Delve", "AWS Marketplace"]


def short(text, limit=40):
    """Strip parentheticals/semicolon asides and truncate."""
    if not text:
        return text
    s = str(text).split("(")[0].split(";")[0].strip(" ,.-–—")
    return (s[:limit].rstrip() + "…") if len(s) > limit else s


def canon_grc(items):
    out = []
    for raw in items or []:
        hit = next((c for c in GRC_CANON if c.lower() in str(raw).lower()), None)
        name = hit or short(raw, 24)
        if name and name not in out:
            out.append(name)
    return out


def normalize(f):
    f["team_size_estimate"] = short(f.get("team_size_estimate"), 24)
    f["founded"] = short(f.get("founded"), 16)
    f["hq"] = short(f.get("hq"), 32)
    f["grc_partnerships"] = canon_grc(f.get("grc_partnerships"))
    f["services"] = [short(s, 40) for s in (f.get("services") or [])]
    return f


def tier_for(f):
    fs = f.get("fit_score") or 0
    if fs >= 75:
        return "prime"
    if fs >= 55:
        return "strong"
    return "bench"


def main():
    firms, seen = [], set()
    for path in sorted(glob.glob(RESULTS_GLOB)):
        try:
            f = json.load(open(path))
        except Exception as e:
            print(f"WARN: could not parse {path}: {e}")
            continue
        slug = f.get("slug") or os.path.splitext(os.path.basename(path))[0]
        if slug in seen:
            continue
        seen.add(slug)
        f["slug"] = slug
        f["tier"] = tier_for(f)
        firms.append(normalize(f))

    order = {"prime": 0, "strong": 1, "bench": 2}
    firms.sort(key=lambda x: (order[x["tier"]], -(x.get("fit_score") or 0)))

    meta = {
        "total": len(firms),
        "tiers": {t: sum(1 for x in firms if x["tier"] == t) for t in order},
        "founder_led": sum(1 for x in firms if x.get("founder_led")),
        "with_contact": sum(1 for x in firms if x.get("contacts")),
        "grc_networked": sum(1 for x in firms if x.get("grc_partnerships")),
    }
    json.dump({"generated_at": datetime.date.today().isoformat(), "meta": meta, "firms": firms},
              open(OUT, "w"), indent=1)
    print(json.dumps(meta, indent=1))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
