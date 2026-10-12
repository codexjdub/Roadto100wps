#!/usr/bin/env python3
"""Set the site version everywhere it appears. Run before each push.

Updates version.json (what the live site reports), the version baked into
index.html (what the page you're running reports), and the ?v= on every
script and stylesheet link so browsers fetch the new files instead of
mixing in cached old ones.

Usage:
  python3 tools/bump_version.py 1.4                 # date defaults to today
  python3 tools/bump_version.py 1.4 --date 2026-10-13
"""

import argparse
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("version", help="e.g. 1.4")
    ap.add_argument("--date", default=datetime.date.today().isoformat(), help="YYYY-MM-DD")
    args = ap.parse_args()
    if not re.fullmatch(r"\d+(\.\d+)*", args.version):
        sys.exit("version must look like 1.4")
    datetime.date.fromisoformat(args.date)

    with open(os.path.join(ROOT, "version.json"), "w", encoding="utf-8") as f:
        json.dump({"version": args.version, "date": args.date}, f)
        f.write("\n")

    path = os.path.join(ROOT, "index.html")
    with open(path, encoding="utf-8") as f:
        html = f.read()
    html, n1 = re.subn(r'window\.APP_VERSION = "[^"]*"; window\.APP_DATE = "[^"]*";',
                       f'window.APP_VERSION = "{args.version}"; window.APP_DATE = "{args.date}";', html)
    html, n2 = re.subn(r'((?:src|href)="(?:js/[\w.-]+\.js|style\.css))(?:\?v=[^"]*)?"', rf'\1?v={args.version}"', html)
    if n1 != 1 or n2 == 0:
        sys.exit(f"index.html didn't match as expected (version line: {n1}, file links: {n2})")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"version {args.version} ({args.date}): version.json, index.html ({n2} file links)")


if __name__ == "__main__":
    main()
