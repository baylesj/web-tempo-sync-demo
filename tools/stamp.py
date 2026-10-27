#!/usr/bin/env python3
"""Stamp a static site's local script and stylesheet URLs with a version, so a browser never mixes releases.

Run by .github/workflows/pages.yml on the copy about to go live (a copy of unraid-config's scripts/site-stamp.py,
which does the same for bayl.es):
    stamp.py <site dir> <version>
In .html files, src/href pointing at a local .js or .css get ?v=<version>; in .js files, every relative
`import ... from './x.js'` (and `import './x.js'`, `import('./x.js')`) gets the same. Every file then refers to
each module by one URL, so the browser loads each module once, all of them from this release.
"""

import re
import sys
from pathlib import Path

LOCAL = r"(?!(?:[a-z]+:)?//|/|#|data:|mailto:)"  # relative URLs only
HTML_ATTR = re.compile(r'\b(src|href)="(' + LOCAL + r'[^"?#]+\.(?:js|css))"')
JS_IMPORT = re.compile(r"""(\bimport\b[^'";]*?\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?/[^'"?#]+\.js)\2""")


def stamp(site, version):
    changed = 0
    for path in Path(site).rglob("*"):
        if path.suffix == ".html":
            text = path.read_text()
            new = HTML_ATTR.sub(lambda m: f'{m.group(1)}="{m.group(2)}?v={version}"', text)
        elif path.suffix == ".js":
            text = path.read_text()
            new = JS_IMPORT.sub(lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}?v={version}{m.group(2)}", text)
        else:
            continue
        if new != text:
            path.write_text(new)
            changed += 1
    print(f"stamped {changed} file(s) with v={version}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or not re.fullmatch(r"[\w.-]+", sys.argv[2]):
        sys.exit(__doc__)
    stamp(sys.argv[1], sys.argv[2])
