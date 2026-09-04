#!/usr/bin/env python3
"""Convert a markdown research report to a standalone HTML file.

Usage:
    uv run --with markdown python scripts/markdown-to-html.py report.md -o report.html

Dependencies:
    - markdown (python-markdown), provided by `uv run --with markdown`

Wraps the rendered markdown in a minimal GitHub-like inline-CSS page so the
output is a single self-contained file with no external assets.
"""

import argparse
import sys
from pathlib import Path

try:
    import markdown as md_lib
except ImportError:
    sys.stderr.write(
        "error: the 'markdown' package is required. Run via:\n"
        "  uv run --with markdown python scripts/markdown-to-html.py IN.md -o OUT.html\n"
    )
    sys.exit(2)

CSS = """
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 16px; line-height: 1.6; color: #1f2328; background: #ffffff;
  max-width: 980px; margin: 0 auto; padding: 32px 44px; }
h1, h2, h3, h4, h5, h6 { font-weight: 600; line-height: 1.25; margin-top: 24px;
  margin-bottom: 16px; }
h1 { font-size: 2em; border-bottom: 1px solid #d1d9e0; padding-bottom: .3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #d1d9e0; padding-bottom: .3em; }
h3 { font-size: 1.25em; }
p { margin-top: 0; margin-bottom: 16px; }
a { color: #0969da; text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 85%; padding: .2em .4em; background: #f0f2f5; border-radius: 6px; }
pre { background: #f6f8fa; border-radius: 6px; padding: 16px; overflow: auto; }
pre code { background: transparent; padding: 0; font-size: 85%; }
blockquote { border-left: .25em solid #d1d9e0; color: #59636e; padding: 0 1em;
  margin: 0 0 16px 0; }
table { border-collapse: collapse; margin-bottom: 16px; display: block;
  overflow: auto; max-width: 100%; }
table th, table td { border: 1px solid #d1d9e0; padding: 6px 13px; }
table tr:nth-child(2n) { background: #f6f8fa; }
ul, ol { margin-bottom: 16px; padding-left: 2em; }
hr { height: .25em; background: #d1d9e0; border: 0; margin: 24px 0; }
"""


def convert(markdown_path: Path, title: str) -> str:
    text = markdown_path.read_text(encoding="utf-8")
    body = md_lib.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    return (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{title}</title>\n"
        f"<style>{CSS}</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a markdown file to standalone GitHub-like HTML."
    )
    parser.add_argument("input", help="input markdown file")
    parser.add_argument("-o", "--output", help="output HTML file (default: input with .html)")
    parser.add_argument("--title", help="HTML <title> (default: input filename stem)")
    args = parser.parse_args()

    src = Path(args.input)
    if not src.is_file():
        sys.stderr.write(f"error: no such file: {src}\n")
        sys.exit(1)

    out = Path(args.output) if args.output else src.with_suffix(".html")
    title = args.title or src.stem.replace("_", " ").replace("-", " ").title()
    out.write_text(convert(src, title), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
