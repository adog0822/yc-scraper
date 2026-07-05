#!/usr/bin/env python3
"""Phase 2: enrich top candidates with founder details from YC profile pages.

Copies the [data-page] JSON pattern from scrapy-project/ycombinator/spiders/yscraper.py
(props.company.founders[] -> full_name, title, founder_bio, linkedin_url, twitter_url)
but uses plain urllib so we don't need the Selenium/Scrapy pipeline.
Checkpointed: safe to re-run, skips already-fetched slugs.
"""
import json
import html
import os
import re
import sys
import time
import urllib.request

BASE = os.path.dirname(__file__)
CANDIDATES = os.path.join(BASE, "candidates.json")
CHECKPOINT = os.path.join(BASE, "founders_checkpoint.json")
OUT = os.path.join(BASE, "enriched.json")

TOP_N = int(sys.argv[1]) if len(sys.argv) > 1 else 140
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def parse_company(html_text):
    m = re.search(r'data-page="([^"]*)"', html_text)
    if not m:
        return None
    jo = json.loads(html.unescape(m.group(1)))
    return jo.get("props", {}).get("company")


def main():
    cands = json.load(open(CANDIDATES))[:TOP_N]
    ckpt = json.load(open(CHECKPOINT)) if os.path.exists(CHECKPOINT) else {}
    done = 0
    for i, c in enumerate(cands):
        slug = c["slug"]
        if slug in ckpt:
            continue
        url = f"https://www.ycombinator.com/companies/{slug}"
        try:
            company = parse_company(fetch(url))
            founders = (company or {}).get("founders", [])
            ckpt[slug] = {
                "founders": [
                    {
                        "name": f.get("full_name"),
                        "title": f.get("title"),
                        "bio": (f.get("founder_bio") or "")[:400],
                        "linkedin": f.get("linkedin_url"),
                        "twitter": f.get("twitter_url"),
                    }
                    for f in founders
                ],
                "company_linkedin": (company or {}).get("linkedin_url"),
                "company_twitter": (company or {}).get("twitter_url"),
                "year_founded": (company or {}).get("year_founded"),
                "error": None if company else "no data-page",
            }
        except Exception as e:  # keep going; record the failure
            ckpt[slug] = {"founders": [], "error": str(e)[:200]}
        done += 1
        if done % 10 == 0:
            json.dump(ckpt, open(CHECKPOINT, "w"))
            print(f"{i+1}/{len(cands)} fetched (last: {slug})", flush=True)
        time.sleep(1.2)
    json.dump(ckpt, open(CHECKPOINT, "w"))

    # merge
    enriched = []
    for c in cands:
        e = dict(c)
        e.update(ckpt.get(c["slug"], {"founders": [], "error": "not fetched"}))
        enriched.append(e)
    json.dump(enriched, open(OUT, "w"), indent=1)
    with_li = sum(1 for e in enriched if any(f.get("linkedin") for f in e["founders"]))
    errs = sum(1 for e in enriched if e.get("error"))
    print(f"enriched: {len(enriched)}, with>=1 founder LinkedIn: {with_li}, errors: {errs}")


if __name__ == "__main__":
    main()
