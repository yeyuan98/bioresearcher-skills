#!/usr/bin/env python3
"""Convert a markdown research report to a standalone, publication-grade HTML file.

Usage:
    uv run --with markdown python scripts/markdown-to-html.py report.md -o report.html

Dependencies:
    - markdown (python-markdown), provided by `uv run --with markdown`

Features:
    - 100% self-contained: zero external network assets (fonts, icons, CDN scripts).
    - BioResearcher · Deep Research branding & metadata card.
    - Responsive Table of Contents: sticky desktop sidebar and mobile slide-over drawer.
    - Interactive in-text citations: superscript badges, floating boundary-aware
      tooltips with tail flipping, auto-linkified DOIs, PMIDs, and NCT trial IDs.
    - Print-ready typography and media queries.
"""

import argparse
import html
import re
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
:root {
  --primary: #0284c7;
  --primary-hover: #0369a1;
  --primary-light: #f0f9ff;
  --primary-border: #bae6fd;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --text-light: #94a3b8;
  --bg-page: #f8fafc;
  --bg-surface: #ffffff;
  --border-color: #e2e8f0;
  --border-subtle: #f1f5f9;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --sidebar-w: 270px;
}

*, *::before, *::after { box-sizing: border-box; }

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.65;
  color: var(--text-main);
  background-color: var(--bg-page);
  -webkit-font-smoothing: antialiased;
}

/* ---------------- Layout ---------------- */
.report-wrapper {
  display: flex;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 20px;
  gap: 36px;
}

.report-sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.report-main {
  flex: 1;
  min-width: 0; /* Prevents flex child overflow from wide tables */
  max-width: 900px;
}

/* ---------------- Header & Branding ---------------- */
.report-header-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 28px 32px;
  margin-bottom: 28px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.brand-badge-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--primary-light);
  border: 1px solid var(--primary-border);
  color: var(--primary);
  font-size: 13px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
}

.brand-icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.report-title {
  margin: 0 0 16px 0;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-main);
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.meta-item {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.meta-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.meta-value {
  color: var(--text-main);
}

.meta-code {
  font-family: var(--font-mono);
  background: var(--border-subtle);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  display: inline-block;
  width: fit-content;
}

.meta-scope {
  grid-column: 1 / -1;
  line-height: 1.5;
}

/* ---------------- Main Content Body ---------------- */
.markdown-body {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 36px 40px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.8em;
  margin-bottom: 0.6em;
  color: var(--text-main);
  scroll-margin-top: 80px;
}

.markdown-body h1 {
  font-size: 1.75rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}

.markdown-body h2 {
  font-size: 1.4rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
  color: #1e293b;
}

.markdown-body h3 {
  font-size: 1.15rem;
  color: #334155;
}

.markdown-body p {
  margin-top: 0;
  margin-bottom: 1.1em;
}

.markdown-body a {
  color: var(--primary);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body ul, .markdown-body ol {
  margin-top: 0;
  margin-bottom: 1.2em;
  padding-left: 1.6em;
}

.markdown-body li {
  margin-bottom: 0.35em;
}

.markdown-body hr {
  height: 1px;
  background: var(--border-color);
  border: 0;
  margin: 2.2em 0;
}

.markdown-body blockquote {
  margin: 1.2em 0;
  padding: 0.6em 1.2em;
  border-left: 4px solid var(--primary-border);
  background: var(--primary-light);
  color: #334155;
  border-radius: 0 8px 8px 0;
}

/* ---------------- Tables ---------------- */
.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.4em 0;
  font-size: 14px;
  display: block;
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.markdown-body th, .markdown-body td {
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  text-align: left;
}

.markdown-body th {
  background: #f8fafc;
  font-weight: 600;
  color: #475569;
  white-space: nowrap;
}

.markdown-body tr:nth-child(even) td {
  background: #fbfcfd;
}

.markdown-body tr:hover td {
  background: #f1f5f9;
}

/* ---------------- Code ---------------- */
.markdown-body code {
  font-family: var(--font-mono);
  font-size: 85%;
  background: #f1f5f9;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  color: #0f172a;
}

.markdown-body pre {
  background: #0f172a;
  color: #f8fafc;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1.2em 0;
}

.markdown-body pre code {
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: 90%;
}

/* ---------------- Table of Contents (Sidebar) ---------------- */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 14px;
  color: var(--text-main);
}

.sidebar-badge {
  font-size: 11px;
  color: var(--primary);
  background: var(--primary-light);
  border: 1px solid var(--primary-border);
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.toc-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.toc-container .toc ul {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.toc-container .toc ul ul {
  padding-left: 14px;
}

.toc-container .toc li {
  margin-bottom: 4px;
}

.toc-container .toc a {
  display: block;
  font-size: 13px;
  color: var(--text-muted);
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1.4;
  text-decoration: none;
  transition: all 0.15s ease;
}

.toc-container .toc a:hover {
  color: var(--primary);
  background: var(--primary-light);
}

.toc-container .toc a.active {
  color: var(--primary);
  background: var(--primary-light);
  font-weight: 600;
  border-left: 3px solid var(--primary);
  border-radius: 0 6px 6px 0;
  padding-left: 7px;
}

/* ---------------- Mobile TOC Drawer & Toggle ---------------- */
.mobile-toc-btn {
  display: none;
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999;
  align-items: center;
  gap: 8px;
  background: var(--primary);
  color: #ffffff;
  border: none;
  border-radius: 30px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.mobile-toc-btn:active {
  transform: scale(0.96);
}

.mobile-toc-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  z-index: 1000;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.mobile-toc-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  max-width: 85vw;
  background: var(--bg-surface);
  z-index: 1001;
  box-shadow: -4px 0 20px rgba(0,0,0,0.15);
  transform: translateX(100%);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.mobile-toc-drawer.open {
  transform: translateX(0);
}

.mobile-toc-backdrop.open {
  display: block;
  opacity: 1;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);
}

.drawer-title {
  font-weight: 700;
  font-size: 16px;
  color: var(--text-main);
}

.drawer-close {
  background: transparent;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
}

.drawer-toc {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.drawer-toc .toc ul {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.drawer-toc .toc ul ul {
  padding-left: 14px;
}

.drawer-toc .toc li {
  margin-bottom: 6px;
}

.drawer-toc .toc a {
  display: block;
  font-size: 14px;
  color: var(--text-muted);
  padding: 6px 8px;
  border-radius: 6px;
  text-decoration: none;
}

.drawer-toc .toc a.active {
  color: var(--primary);
  background: var(--primary-light);
  font-weight: 600;
}

/* ---------------- Citations & Tooltips ---------------- */
.cite-ref {
  font-size: 0.75em;
  line-height: 0;
  vertical-align: super;
  margin: 0 1.5px;
}

.cite-ref a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35em;
  height: 1.35em;
  padding: 0 4px;
  background: var(--primary-light);
  color: var(--primary);
  border: 1px solid var(--primary-border);
  border-radius: 4px;
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 0.85em;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cite-ref a:hover {
  background: var(--primary);
  color: #ffffff;
  border-color: var(--primary);
  box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);
  text-decoration: none;
}

.cite-tooltip {
  position: absolute;
  z-index: 9999;
  max-width: 440px;
  min-width: 260px;
  width: max-content;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-main);
  display: none;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.cite-tooltip.visible {
  display: block;
  pointer-events: auto;
}

.cite-tooltip.fade-in {
  opacity: 1;
}

.cite-tooltip.fade-out {
  opacity: 0;
}

.cite-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 8px;
}

.cite-tooltip .cite-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0;
}

.cite-jump-link {
  font-size: 11px;
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
  white-space: nowrap;
}

.cite-jump-link:hover {
  text-decoration: underline;
}

.cite-tail {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid var(--border-color);
}

.cite-tail::after {
  content: '';
  position: absolute;
  top: 1px;
  left: -5px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid var(--bg-surface);
}

.cite-tail.flip {
  top: auto;
  bottom: -6px;
  border-bottom: none;
  border-top: 6px solid var(--border-color);
}

.cite-tail.flip::after {
  top: auto;
  bottom: 1px;
  border-bottom: none;
  border-top: 5px solid var(--bg-surface);
}

.cite-tooltip a.ref-link {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}

.cite-tooltip a.ref-link:hover {
  text-decoration: underline;
}

/* ---------------- Bibliography / References Section ---------------- */
.references-container {
  margin-top: 1.2em;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ref-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
  line-height: 1.55;
  padding: 10px 14px;
  border-radius: 8px;
  background: #fbfcfd;
  border: 1px solid var(--border-subtle);
  scroll-margin-top: 80px;
  transition: background-color 0.3s ease;
}

.ref-item:hover {
  border-color: var(--border-color);
}

.ref-item:target {
  animation: ref-target-pulse 2.2s ease-out;
  border-color: var(--primary-border);
}

@keyframes ref-target-pulse {
  0% { background-color: #fef08a; }
  60% { background-color: #fef9c3; }
  100% { background-color: #fbfcfd; }
}

.ref-num {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--primary);
  font-size: 13px;
  flex-shrink: 0;
  padding-top: 1px;
}

.ref-body {
  flex: 1;
  color: #334155;
  word-break: break-word;
}

/* ---------------- Responsive Styles ---------------- */
@media (max-width: 1024px) {
  .report-sidebar {
    display: none;
  }
  .report-wrapper {
    padding: 16px;
  }
  .report-header-card, .markdown-body {
    padding: 24px 20px;
  }
  .mobile-toc-btn {
    display: inline-flex;
  }
}

@media (max-width: 640px) {
  .report-title {
    font-size: 1.5rem;
  }
  .meta-grid {
    grid-template-columns: 1fr;
  }
  .cite-tooltip {
    max-width: calc(100vw - 32px);
  }
}

/* ---------------- Print Styles ---------------- */
@media print {
  @page { margin: 1.5cm; }
  body {
    background: #ffffff !important;
    color: #000000 !important;
    font-size: 11pt;
  }
  .report-sidebar,
  .mobile-toc-btn,
  .mobile-toc-backdrop,
  .mobile-toc-drawer,
  #cite-tooltip {
    display: none !important;
  }
  .report-wrapper {
    max-width: 100% !important;
    padding: 0 !important;
  }
  .report-header-card, .markdown-body {
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin-bottom: 24px !important;
  }
  a {
    color: #000000 !important;
    text-decoration: underline !important;
  }
  .ref-item {
    background: transparent !important;
    border: none !important;
    padding: 4px 0 !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table, pre, blockquote {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  h1, h2, h3 {
    break-after: avoid;
    page-break-after: avoid;
  }
}
""".strip()

SVG_DNA_ICON = """<svg class="brand-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 3a1.5 1.5 0 0 0-1.5 1.5v.38c0 .4.16.78.44 1.06L7.38 10l-3.94 4.06a1.5 1.5 0 0 0-.44 1.06v.38a1.5 1.5 0 0 0 1.5 1.5h.38c.4 0 .78-.16 1.06-.44L10 12.62l3.94 4.06c.28.28.66.44 1.06.44h.38a1.5 1.5 0 0 0 1.5-1.5v-.38c0-.4-.16-.78-.44-1.06L12.5 10l4.06-3.94c.28-.28.44-.66.44-1.06V4.5A1.5 1.5 0 0 0 15.5 3h-.38c-.4 0-.78.16-1.06.44L10 7.38 6.06 3.44A1.5 1.5 0 0 0 5.02 3H4.5zM12 2a1 1 0 0 1 1 1v1.17l2.29-2.29A2.5 2.5 0 0 1 17.06 1H18.5A2.5 2.5 0 0 1 21 3.5v1.44c0 .66-.26 1.3-.73 1.77L16.41 10l3.86 3.86c.47.47.73 1.11.73 1.77v1.87a2.5 2.5 0 0 1-2.5 2.5h-1.44a2.5 2.5 0 0 1-1.77-.73L13 16.9V21a1 1 0 1 1-2 0v-4.1l-2.29 2.37a2.5 2.5 0 0 1-1.77.73H5.5A2.5 2.5 0 0 1 3 17.5v-1.87c0-.66.26-1.3.73-1.77L7.59 10 3.73 6.14A2.5 2.5 0 0 1 3 4.37V2.5A2.5 2.5 0 0 1 5.5 0h1.44c.66 0 1.3.26 1.77.73L11 3.03V2a1 1 0 0 1 1-1z"/></svg>"""
SVG_LIST_ICON = """<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>"""

CLIENT_SCRIPT = r"""
(function() {
  var contentEl = document.getElementById('content');
  if (!contentEl) return;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatReferenceHtml(str) {
    var placeholders = [];
    function pushPh(h) { var idx = placeholders.length; placeholders.push(h); return '%%%PH_' + idx + '%%%'; }

    // 1. DOIs
    var s = str.replace(/\bdoi:\s*(10\.\d{4,9}\/[^\s;,]+)/gi, function(_, doi) {
      var cleanDoi = doi.replace(/[.,;:!?)\]]+$/, '');
      return pushPh('<a class="ref-link" href="https://doi.org/' + esc(cleanDoi) + '" target="_blank" rel="noopener noreferrer">doi:' + esc(cleanDoi) + '</a>');
    });

    // 2. PMIDs
    s = s.replace(/\bPMID:\s*(\d+)/gi, function(_, id) {
      return pushPh('<a class="ref-link" href="https://pubmed.ncbi.nlm.nih.gov/' + id + '/" target="_blank" rel="noopener noreferrer">PMID: ' + id + '</a>');
    });

    // 3. ClinicalTrials.gov NCT IDs
    s = s.replace(/\b(NCT\d{8})\b/gi, function(_, nct) {
      return pushPh('<a class="ref-link" href="https://clinicaltrials.gov/study/' + nct + '" target="_blank" rel="noopener noreferrer">' + nct + '</a>');
    });

    // 4. URLs
    s = s.replace(/(https?:\/\/[^\s<>"]+)/g, function(url) {
      var cleanUrl = url.replace(/[.,;:!?)\]]+$/, '');
      var trailing = url.slice(cleanUrl.length);
      return pushPh('<a class="ref-link" href="' + esc(cleanUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(cleanUrl) + '</a>') + esc(trailing);
    });

    s = esc(s).replace(/%%%PH_(\d+)%%%/g, function(_, idx) {
      return placeholders[parseInt(idx, 10)];
    });
    return s;
  }

  // ---- 1. Process Bibliography ----
  var headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  var refHeading = null;
  for (var i = 0; i < headings.length; i++) {
    if (/^(?:\d+[\.\s]+)?(?:references?|bibliography|literature cited|citations|参考文献)[\s:]*$/i.test(headings[i].textContent.trim())) {
      refHeading = headings[i];
      break;
    }
  }

  var refsMap = new Map();
  var refElements = [];

  if (refHeading) {
    var refLevel = parseInt(refHeading.tagName.charAt(1), 10);
    var next = refHeading.nextElementSibling;
    while (next) {
      if (/^H[1-6]$/i.test(next.tagName)) {
        if (parseInt(next.tagName.charAt(1), 10) <= refLevel) break;
      }
      refElements.push(next);
      next = next.nextElementSibling;
    }

    var rawEntries = [];
    refElements.forEach(function(el) {
      if (el.tagName === 'OL' || el.tagName === 'UL') {
        el.querySelectorAll('li').forEach(function(li, idx) {
          var text = li.textContent.trim();
          var m = text.match(/^\[(\d+)\]\s*([\s\S]*)/);
          if (m) {
            rawEntries.push({ num: parseInt(m[1], 10), body: m[2].trim() });
          } else {
            rawEntries.push({ num: idx + 1, body: text });
          }
        });
      } else {
        var text = el.textContent;
        var regex = /(?:^|\n)\s*\[(\d+)\]\s*([\s\S]*?)(?=(?:\n\s*\[\d+\]|$))/g;
        var match, found = false;
        while ((match = regex.exec(text)) !== null) {
          found = true;
          rawEntries.push({ num: parseInt(match[1], 10), body: match[2].trim() });
        }
        if (!found && text.trim()) {
          var m = text.trim().match(/^\[(\d+)\]\s*([\s\S]*)/);
          if (m) rawEntries.push({ num: parseInt(m[1], 10), body: m[2].trim() });
        }
      }
    });

    if (rawEntries.length > 0) {
      var container = document.createElement('div');
      container.className = 'references-container';
      rawEntries.forEach(function(item) {
        refsMap.set(item.num, item.body);
        var div = document.createElement('div');
        div.className = 'ref-item';
        div.id = 'ref-' + item.num;
        div.innerHTML = '<span class="ref-num">[' + item.num + ']</span><div class="ref-body">' + formatReferenceHtml(item.body) + '</div>';
        container.appendChild(div);
      });
      refElements[0].parentNode.insertBefore(container, refElements[0]);
      refElements.forEach(function(e) { e.remove(); });
    }
  }

  // ---- 2. In-Text Citation Replacement ----
  var forbidden = new Set(['CODE', 'PRE', 'A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'NAV', 'BUTTON']);
  function isForbidden(n) {
    var p = n.parentElement;
    while (p && p !== contentEl) {
      if (forbidden.has(p.tagName) || (p.classList && p.classList.contains('references-container'))) return true;
      p = p.parentElement;
    }
    return false;
  }

  var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  var textNodes = [];
  while (walker.nextNode()) {
    if (!isForbidden(walker.currentNode)) {
      textNodes.push(walker.currentNode);
    }
  }

  var citeRegex = /\[(\d+(?:\s*[-–—]\s*\d+)?(?:\s*[,，]\s*\d+(?:\s*[-–—]\s*\d+)?)*)\]/g;

  textNodes.forEach(function(node) {
    var text = node.textContent;
    if (!citeRegex.test(text)) return;
    citeRegex.lastIndex = 0;

    var frag = document.createDocumentFragment();
    var lastIdx = 0, m;

    while ((m = citeRegex.exec(text)) !== null) {
      var nums = [];
      m[1].split(/[,，]/).forEach(function(part) {
        part = part.trim();
        var rm = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
        if (rm) {
          var start = parseInt(rm[1], 10);
          var end = parseInt(rm[2], 10);
          for (var k = start; k <= end; k++) nums.push(k);
        } else {
          var single = parseInt(part, 10);
          if (!isNaN(single)) nums.push(single);
        }
      });

      if (refsMap.size > 0 && !nums.some(function(n) { return refsMap.has(n); })) {
        continue;
      }

      if (m.index > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      }

      var sup = document.createElement('sup');
      sup.className = 'cite-ref';
      nums.forEach(function(num, idx) {
        if (idx > 0) sup.appendChild(document.createTextNode(', '));
        var a = document.createElement('a');
        a.textContent = num;
        a.setAttribute('data-ref', num);
        a.href = '#ref-' + num;
        sup.appendChild(a);
      });
      frag.appendChild(sup);
      lastIdx = citeRegex.lastIndex;
    }

    if (lastIdx === 0) return;

    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    node.parentNode.replaceChild(frag, node);
  });

  // ---- 3. Interactive Singleton Tooltip Engine ----
  var tooltip = document.getElementById('cite-tooltip');
  var tooltipTail = tooltip ? tooltip.querySelector('.cite-tail') : null;
  var tooltipBody = tooltip ? tooltip.querySelector('.cite-body') : null;
  var tooltipLabel = tooltip ? tooltip.querySelector('.cite-label') : null;
  var tooltipJump = tooltip ? tooltip.querySelector('.cite-jump-link') : null;
  var activeTrigger = null;
  var showTimer = null, hideTimer = null;

  function showTooltip(triggerEl) {
    if (!tooltip || !tooltipBody) return;
    clearTimeout(hideTimer); hideTimer = null;
    var num = triggerEl.getAttribute('data-ref');
    var refText = refsMap.get(parseInt(num, 10));
    if (!refText) return;

    if (tooltipLabel) tooltipLabel.textContent = 'Reference [' + num + ']';
    if (tooltipJump) tooltipJump.href = '#ref-' + num;
    tooltipBody.innerHTML = formatReferenceHtml(refText);

    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.classList.add('visible');
    tooltip.classList.remove('fade-out');

    var r = triggerEl.getBoundingClientRect();
    var tr = tooltip.getBoundingClientRect();
    var sy = window.scrollY || document.documentElement.scrollTop;
    var sx = window.scrollX || document.documentElement.scrollLeft;
    var clientW = document.documentElement.clientWidth;

    var left = r.left + sx + (r.width / 2) - (tr.width / 2);
    if (left < sx + 12) left = sx + 12;
    if (left + tr.width > sx + clientW - 12) left = sx + clientW - tr.width - 12;

    var top = r.bottom + sy + 6;
    var above = false;
    if (top + tr.height > window.innerHeight + sy - 12) {
      top = r.top + sy - tr.height - 6;
      above = true;
    }
    if (above && top < sy + 6) top = sy + 6;

    if (tooltipTail) {
      var tailLeft = (r.left + sx + r.width / 2) - left;
      tailLeft = Math.max(14, Math.min(tr.width - 14, tailLeft));
      tooltipTail.style.left = tailLeft + 'px';
      tooltipTail.style.transform = 'none';
      if (above) tooltipTail.classList.add('flip');
      else tooltipTail.classList.remove('flip');
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    requestAnimationFrame(function() { tooltip.classList.add('fade-in'); });
    activeTrigger = triggerEl;
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove('fade-in');
    tooltip.classList.add('fade-out');
    setTimeout(function() {
      if (tooltip.classList.contains('fade-out')) {
        tooltip.classList.remove('visible', 'fade-out');
        activeTrigger = null;
      }
    }, 150);
  }

  document.addEventListener('mouseenter', function(e) {
    var a = e.target.closest('.cite-ref a');
    if (!a) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(function() { showTooltip(a); }, 200);
  }, true);

  document.addEventListener('mouseleave', function(e) {
    var a = e.target.closest('.cite-ref a');
    if (!a) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(hideTooltip, 220);
  }, true);

  if (tooltip) {
    tooltip.addEventListener('mouseenter', function() {
      clearTimeout(hideTimer);
    });
    tooltip.addEventListener('mouseleave', function() {
      hideTimer = setTimeout(hideTooltip, 220);
    });
  }

  document.addEventListener('click', function(e) {
    var a = e.target.closest('.cite-ref a');
    if (a) {
      if (e.pointerType === 'touch' && (!activeTrigger || activeTrigger !== a || !tooltip.classList.contains('fade-in'))) {
        e.preventDefault();
        showTooltip(a);
      } else {
        hideTooltip();
      }
    } else if (e.target.closest('.cite-jump-link')) {
      hideTooltip();
    } else if (!e.target.closest('#cite-tooltip')) {
      hideTooltip();
    }
  });

  // ---- 4. ScrollSpy Engine ----
  var headingsList = Array.from(contentEl.querySelectorAll('h1, h2, h3'));
  var tocLinks = Array.from(document.querySelectorAll('.report-sidebar .toc a, .drawer-toc .toc a'));

  function updateScrollSpy() {
    if (!headingsList.length || !tocLinks.length) return;
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    var isAtBottom = (window.innerHeight + scrollY) >= (document.documentElement.scrollHeight - 36);

    var currentId = '';
    if (isAtBottom) {
      currentId = headingsList[headingsList.length - 1].id;
    } else {
      for (var i = headingsList.length - 1; i >= 0; i--) {
        if (headingsList[i].offsetTop <= scrollY + 95) {
          currentId = headingsList[i].id;
          break;
        }
      }
    }

    tocLinks.forEach(function(link) {
      var match = link.getAttribute('href') === '#' + currentId;
      link.classList.toggle('active', match);
      if (match && link.closest('.report-sidebar')) {
        link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }
  window.addEventListener('scroll', updateScrollSpy, { passive: true });
  updateScrollSpy();

  // ---- 5. Mobile TOC Drawer Controls ----
  var drawerToggle = document.getElementById('mobile-toc-toggle');
  var drawer = document.getElementById('mobile-toc-drawer');
  var backdrop = document.getElementById('mobile-toc-backdrop');
  var drawerClose = document.getElementById('drawer-close-btn');

  function openDrawer() {
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (drawerToggle) drawerToggle.addEventListener('click', openDrawer);
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  document.querySelectorAll('.drawer-toc a').forEach(function(link) {
    link.addEventListener('click', function() {
      closeDrawer();
    });
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeDrawer();
      hideTooltip();
    }
  });
})();
""".strip()


def parse_metadata(raw_text: str) -> tuple[str, dict[str, str], str]:
    """Extract report title, metadata fields, and cleaned markdown text."""
    lines = raw_text.splitlines()
    title = ""
    metadata = {}
    cleaned_lines = []

    # Check first few lines for # Title and Generated: line
    skip_indices = set()
    for idx, line in enumerate(lines[:6]):
        stripped = line.strip()
        if stripped.startswith("# ") and not title:
            title = stripped[2:].strip()
            skip_indices.add(idx)
        elif re.search(r"Generated:\s*", stripped, re.IGNORECASE) and "|" in stripped:
            skip_indices.add(idx)
            # Parse key-value tokens separated by pipe
            parts = [p.strip() for p in stripped.split("|")]
            for p in parts:
                if ":" in p:
                    k, v = p.split(":", 1)
                    metadata[k.strip().lower()] = v.strip()

    for idx, line in enumerate(lines):
        if idx not in skip_indices:
            cleaned_lines.append(line)

    return title, metadata, "\n".join(cleaned_lines)


def build_header_card(title: str, metadata: dict[str, str]) -> str:
    """Construct publication-grade header hero card."""
    items = []
    if "topic" in metadata:
        items.append(f'<div class="meta-item"><span class="meta-label">Topic</span><span class="meta-code">{html.escape(metadata["topic"])}</span></div>')
    if "generated" in metadata:
        items.append(f'<div class="meta-item"><span class="meta-label">Generated</span><span class="meta-value">{html.escape(metadata["generated"])}</span></div>')
    if "scope" in metadata:
        items.append(f'<div class="meta-item meta-scope"><span class="meta-label">Research Scope</span><span class="meta-value">{html.escape(metadata["scope"])}</span></div>')

    meta_html = f'<div class="meta-grid">{"".join(items)}</div>' if items else ""

    return f"""
<header class="report-header-card">
  <div class="brand-badge-bar">
    <div class="brand-badge">
      {SVG_DNA_ICON}
      <span>BioResearcher · Deep Research</span>
    </div>
  </div>
  <h1 class="report-title">{html.escape(title)}</h1>
  {meta_html}
</header>
""".strip()


def convert(markdown_path: Path, title: str) -> str:
    raw_text = markdown_path.read_text(encoding="utf-8")
    doc_title, metadata, cleaned_markdown = parse_metadata(raw_text)
    effective_title = doc_title or title

    md = md_lib.Markdown(
        extensions=["tables", "fenced_code", "sane_lists", "toc"],
        extension_configs={
            "toc": {
                "toc_depth": "2-3",
                "title": "",
                "permalink": False,
            }
        },
    )
    body_html = md.convert(cleaned_markdown)
    toc_html = md.toc or ""

    header_card = build_header_card(effective_title, metadata)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(effective_title)}</title>
<style>{CSS}</style>
</head>
<body>

<div class="report-wrapper">
  <aside class="report-sidebar">
    <div class="sidebar-header">
      <div class="sidebar-brand">
        {SVG_DNA_ICON}
        <span>BioResearcher</span>
      </div>
      <span class="sidebar-badge">Deep Research</span>
    </div>
    <div class="toc-title">Table of Contents</div>
    <nav class="toc-container">
      {toc_html}
    </nav>
  </aside>

  <main class="report-main">
    {header_card}
    <article id="content" class="markdown-body">
      {body_html}
    </article>
  </main>
</div>

<button class="mobile-toc-btn" id="mobile-toc-toggle" aria-label="Toggle Table of Contents">
  {SVG_LIST_ICON}
  <span>Contents</span>
</button>

<div class="mobile-toc-backdrop" id="mobile-toc-backdrop"></div>
<div class="mobile-toc-drawer" id="mobile-toc-drawer">
  <div class="drawer-header">
    <div class="drawer-title">Table of Contents</div>
    <button class="drawer-close" id="drawer-close-btn" aria-label="Close Table of Contents">&times;</button>
  </div>
  <nav class="drawer-toc">
    {toc_html}
  </nav>
</div>

<div id="cite-tooltip" class="cite-tooltip" role="tooltip" aria-hidden="true">
  <div class="cite-tail"></div>
  <div class="cite-header">
    <span class="cite-label">Reference</span>
    <a class="cite-jump-link" href="#">Jump to reference &darr;</a>
  </div>
  <div class="cite-body"></div>
</div>

<script>
{CLIENT_SCRIPT}
</script>

</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a markdown file to standalone publication-grade HTML."
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
