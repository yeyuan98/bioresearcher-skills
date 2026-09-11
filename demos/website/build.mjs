#!/usr/bin/env node
/*
 * demos/website/build.mjs — static-site generator for the BioResearcher
 * GitHub Pages showroom. Zero npm dependencies (node:stdlib only), no
 * client JavaScript in the output; the site is assembled from committed
 * repo data into demos/website/_site/ (gitignored, never committed) and
 * deployed by .github/workflows/pages.yml.
 *
 * Templates are FUNCTIONS, not string interpolation: esc() escapes by
 * default (prompt/report text WILL contain <, &, quotes), layout() wraps
 * every page, and component fns (card/badge/table/promptBlock) compose.
 *
 * Declared inputs (all committed; fail-fast: every missing input is
 * collected, then the build fails ONCE with the full list):
 *   VERSION, skills.json, per-skill SKILL.md frontmatter (skills dir),
 *   connector/workbuddy/skill-locales.json, connector/workbuddy/icon.png,
 *   demos/lib/biomcp-tools@1.4.0.json,
 *   demos/scenarios (per-scenario scenario.json),
 *   demos/artifacts (per-case result.json, provenance.json, outputs,
 *   screenshots),
 *   demos/website/cases/<id>.json (curated overlays),
 *   demos/website/src/{strings.en.json,strings.zh.json,skills-extra.json,
 *   mcp-captures.json,style.css}
 *
 * Flags:
 *   --out DIR               output directory (default demos/website/_site;
 *                           independent absolute path, roots derived from
 *                           import.meta.url, never cwd)
 *   --no-copy-artifacts     skip copying artifact assets (fast iteration;
 *                           the internal link check downgrades to warnings)
 *
 * Post-build self checks (exit 1 on failure unless noted):
 *   link check  — every internal href/src/iframe src resolves inside the
 *                 site (internal links are relative-only by construction;
 *                 external http(s)/mailto/data URLs are exempt everywhere,
 *                 and <meta>/<link> tags are stripped before scanning so
 *                 og:image / hreflang absolute URLs never trip it); warns
 *                 under --no-copy-artifacts instead of failing.
 *   tripwire    — warn (never fail) if an embedded artifact HTML contains
 *                 remote src/href references (self-containment regression).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WEBSITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMOS_DIR = path.dirname(WEBSITE_DIR);
const REPO = path.dirname(DEMOS_DIR);
const SITE_URL = "https://yeyuan98.github.io/bioresearcher-skills";
const REPO_URL = "https://github.com/yeyuan98/bioresearcher-skills";
const MAX_ASSET_BYTES = 1.5 * 1024 * 1024;
const PACK_COMMIT = "2d4ab09d272b87c9dcf04cb55b46ab274892ebc5"; // artifacts permalink commit

// Per-language section anchors into demos/docs/agent.{en,zh}.md. Each anchor
// is asserted at build time against the doc's heading text (catches
// renumbering); GitHub slugs drop "&" without a hyphen (常见 Q&A -> 常见-qa).
const DOC_ANCHORS = {
  en: { onboarding: ["#5-onboarding", "## 5. Onboarding"], faq: ["#7-faq", "## 7. FAQ"], api: ["#4-api--interface-documentation", "## 4. API / interface documentation"] },
  zh: { onboarding: ["#5-开通流程", "## 5. 开通流程"], faq: ["#7-常见-qa", "## 7. 常见 Q&A"], api: ["#4-api--接口文档", "## 4. API / 接口文档"] },
};

/* ----------------------------------------------------------------- helpers */

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
const raw = (s) => String(s ?? "");
const lines = (arr) => arr.filter((x) => x !== null && x !== undefined).join("\n");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Vendored from scripts/ci/lint-frontmatter.mjs parseFrontmatter (not
// exported there; copied verbatim apart from this note) — flat scalar keys
// + one optional nested `metadata:` map of scalar strings.
function parseFrontmatter(text) {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return { error: "file must start with '---' frontmatter fence" };
  const end = norm.indexOf("\n---", 4);
  if (end === -1) return { error: "missing closing '---' fence" };
  const fmLines = norm.slice(4, end).split("\n");
  const fm = {};
  const seen = new Set();
  let inMeta = false;
  for (const rawLine of fmLines) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s+\S/.test(line)) {
      if (!inMeta) return { error: `indented line outside metadata: ${line.trim()}` };
      const m = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!m) return { error: `unparseable metadata line: ${line.trim()}` };
      const mk = `metadata.${m[1]}`;
      if (seen.has(mk)) return { error: `duplicate key: ${mk}` };
      seen.add(mk);
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (fm.metadata == null || typeof fm.metadata === "string") return { error: "metadata key defined twice" };
      fm.metadata[m[1]] = v;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) return { error: `unparseable line: ${line.trim()}` };
    if (seen.has(m[1])) return { error: `duplicate key: ${m[1]}` };
    seen.add(m[1]);
    inMeta = m[1] === "metadata";
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[m[1]] = m[1] === "metadata" && v === "" ? {} : v;
  }
  return { fm };
}

function gitSha() {
  try {
    const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8", timeout: 15000 });
    if (r.status === 0) return r.stdout.trim();
  } catch {}
  return "dev";
}

/* ------------------------------------------------------ input enumeration */

function parseArgs(argv) {
  const a = { out: null, noCopyArtifacts: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") a.out = argv[++i];
    else if (argv[i] === "--no-copy-artifacts") a.noCopyArtifacts = true;
    else if (argv[i] === "--help" || argv[i] === "-h") a.help = true;
    else { console.error(`unknown argument: ${argv[i]}`); a.help = true; }
  }
  return a;
}

const CASE_ORDER = [
  "agent-deep-research-en",
  "agent-deep-research-zh",
  "agent-interview-en",
  "agent-pubmed-weekly-en",
  "agent-plot-making-en",
  "mcp-tool-tour-en",
  "mcp-tool-tour-zh",
];

// Tool catalog domain grouping (must exactly partition the registry core).
const CORE_DOMAINS = [
  ["articles", ["article_search", "article_get"]],
  ["genes", ["gene_search", "gene_get", "gene_diseases", "gene_drugs", "gene_trials", "gene_articles", "gene_enrich"]],
  ["variants", ["variant_search", "variant_get", "variant_oncokb", "variant_trials"]],
  ["drugs", ["drug_search", "drug_get", "drug_trials"]],
  ["diseases", ["disease_search", "disease_get", "disease_drugs", "disease_trials"]],
  ["clinical trials", ["trial_search", "trial_get"]],
  ["patents", ["patent_search", "patent_get"]],
  ["omics databases", ["geo_search", "geo_get", "sra_search", "sra_get", "genbank_search", "genbank_get", "genbank_genes"]],
  ["GTEx", ["gtex_expression", "gtex_eqtl"]],
  ["Ensembl/PDB", ["ensembl_lookup", "ensembl_homology", "ensembl_consequence", "ensembl_region", "pdb"]],
  ["utility", ["discover", "batch_get", "biomcp_configure"]],
];
const OPTIONAL_GROUPS = [
  ["SQL database (mysql2)", ["db_query", "db_list_tables", "db_describe_table"]],
  ["R analysis (webR)", ["analysis_r_deseq2", "analysis_r_edger", "analysis_r_limma", "analysis_r_session_info"]],
  ["Biowasm (SAM/BCF/BED)", [
    "analysis_bam_summary", "analysis_bam_view_region", "analysis_bcf_summary", "analysis_bcf_view_region",
    "analysis_bed_op", "analysis_biowasm_convert", "analysis_biowasm_session_info", "analysis_biowasm_cli",
  ]],
];

function loadInputs() {
  const missing = [];
  const need = (p) => {
    const abs = path.join(REPO, p);
    if (!fs.existsSync(abs)) missing.push(p);
    return abs;
  };

  const version = need("VERSION");
  const skillsJson = need("skills.json");
  const locales = need("connector/workbuddy/skill-locales.json");
  const icon = need("connector/workbuddy/icon.png");
  const registry = need(path.join("demos", "lib", "biomcp-tools@1.4.0.json"));
  const stringsEn = need(path.join("demos", "website", "src", "strings.en.json"));
  const stringsZh = need(path.join("demos", "website", "src", "strings.zh.json"));
  const skillsExtra = need(path.join("demos", "website", "src", "skills-extra.json"));
  const mcpCaptures = need(path.join("demos", "website", "src", "mcp-captures.json"));
  const css = need(path.join("demos", "website", "src", "style.css"));

  const agentDocEn = need(path.join("demos", "docs", "agent.en.md"));
  const agentDocZh = need(path.join("demos", "docs", "agent.zh.md"));
  const skillsRoot = need("skills");
  const scenariosRoot = need(path.join("demos", "scenarios"));
  const artifactsRoot = need(path.join("demos", "artifacts"));

  for (const id of CASE_ORDER) {
    need(path.join("demos", "scenarios", id, "scenario.json"));
    need(path.join("demos", "artifacts", id, "result.json"));
    need(path.join("demos", "artifacts", id, "provenance.json"));
    need(path.join("demos", "website", "cases", `${id}.json`));
  }

  if (missing.length) {
    console.error(`build: ${missing.length} declared input(s) missing:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  const skills = readJson(skillsJson).skills.map((s) => {
    const skmd = path.join(skillsRoot, s.name, "SKILL.md");
    const parsed = parseFrontmatter(fs.readFileSync(skmd, "utf8"));
    if (parsed.error) throw new Error(`${s.name}/SKILL.md: ${parsed.error}`);
    return { name: s.name, version: s.version, description: parsed.fm.description ?? "" };
  });
  const localesData = readJson(locales);

  const cases = CASE_ORDER.map((id) => {
    const scenario = readJson(path.join(scenariosRoot, id, "scenario.json"));
    const result = readJson(path.join(artifactsRoot, id, "result.json"));
    const provenance = readJson(path.join(artifactsRoot, id, "provenance.json"));
    const overlay = readJson(path.join(WEBSITE_DIR, "cases", `${id}.json`));
    if (overlay.artifactLang !== "en" && overlay.artifactLang !== "zh") {
      throw new Error(`cases/${id}.json: artifactLang must be "en"|"zh"`);
    }
    return { id, scenario, result, provenance, overlay };
  });

  // Domain grouping must exactly partition the pinned registry (fail fast).
  const reg = readJson(registry);
  const grouped = CORE_DOMAINS.flatMap(([, tools]) => tools).sort();
  const coreSorted = [...reg.core].sort();
  if (JSON.stringify(grouped) !== JSON.stringify(coreSorted)) {
    throw new Error("CORE_DOMAINS does not exactly partition the registry core set");
  }
  const optGrouped = OPTIONAL_GROUPS.flatMap(([, tools]) => tools).sort();
  if (JSON.stringify(optGrouped) !== JSON.stringify([...reg.optional].sort())) {
    throw new Error("OPTIONAL_GROUPS does not exactly partition the registry optional set");
  }

  // Anchor drift gate: every DOC_ANCHORS heading must exist verbatim in the
  // matching doc (renumbering fails the build instead of shipping dead links).
  for (const [lang, anchors] of Object.entries(DOC_ANCHORS)) {
    const doc = fs.readFileSync(lang === "en" ? agentDocEn : agentDocZh, "utf8");
    for (const [, [slug, heading]] of Object.entries(anchors)) {
      if (!doc.includes(heading)) {
        throw new Error(`DOC_ANCHORS drift: heading ${JSON.stringify(heading)} (anchor ${slug}) not found in agent.${lang}.md`);
      }
    }
  }

  return {
    version: fs.readFileSync(version, "utf8").trim(),
    skills,
    locales: localesData,
    icon,
    registry: reg,
    coreDomains: CORE_DOMAINS,
    optionalGroups: OPTIONAL_GROUPS,
    strings: { en: readJson(stringsEn), zh: readJson(stringsZh) },
    skillsExtra: readJson(skillsExtra),
    mcpCaptures: readJson(mcpCaptures),
    css: fs.readFileSync(css, "utf8"),
    cases,
    sha: gitSha(),
  };
}

/* ------------------------------------------------------------- components */

function badge(text, cls) {
  return `<span class="badge ${cls ?? ""}">${esc(text)}</span>`;
}

function card({ title, body, href, badgeHtml }) {
  const inner = lines([
    `<h3>${title}</h3>`,
    `<p>${body}</p>`,
  ]);
  const content = `<div class="card">${badgeHtml ? `<div class="card-badges">${badgeHtml}</div>` : ""}${inner}${href ? `<p class="card-link"><a href="${esc(href)}">${esc(href.replace(/\.html$/, "").replace(/^\.\.\//, "").replaceAll("/", " · "))}</a></p>` : ""}</div>`;
  return content;
}

function kvTable(rows, cls) {
  return `<table class="${cls ?? "kv"}">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>`;
}

function promptBlock(prompt) {
  return `<pre class="prompt">${esc(prompt)}</pre>`;
}

function codeBlock(code, lang = "") {
  return `<pre class="code"><code>${esc(code)}</code></pre>`;
}

/* ----------------------------------------------------------------- layout */

function navHtml(S, langDepth, active) {
  const p = langDepth === 0 ? "" : "../";
  const items = [
    ["home", `${p}index.html`],
    ["getStarted", `${p}get-started.html`],
    ["skills", `${p}skills/index.html`],
    ["mcp", `${p}mcp.html`],
    ["demos", `${p}demos/index.html`],
    ["faq", `${p}faq.html`],
  ];
  return `<nav class="site-nav">${items.map(([k, href]) =>
    `<a href="${esc(href)}" class="${active === k ? "active" : ""}">${esc(S.nav[k])}</a>`).join("")}</nav>`;
}

function layout({ S, lang, title, description, body, active, pagePath, headExtra }) {
  // pagePath is the LANGUAGE-relative path (e.g. "index.html",
  // "skills/x.html", "demos/y.html"); langDepth = directory levels below the
  // language root, siteDepth = levels below the site root (langDepth + 1).
  const langDepth = pagePath ? pagePath.split("/").length - 1 : 0;
  const siteDepth = langDepth + 1;
  const root = "../".repeat(siteDepth);
  // Language switcher: counterpart lives under the other language root at
  // the same language-relative path.
  let switcher = "";
  if (pagePath) {
    const otherLang = lang === "zh" ? "en" : "zh";
    const otherHref = "../".repeat(langDepth + 1) + otherLang + "/" + pagePath;
    switcher = `<div class="lang-switch"><a href="${esc(otherHref)}">${otherLang === "zh" ? "中文" : "English"}</a></div>`;
  }
  return `<!DOCTYPE html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" type="image/png" href="${root}favicon.png">
<link rel="stylesheet" href="${root}assets/style.css">
${pagePath ? `<link rel="alternate" hreflang="${lang}" href="${SITE_URL}/${lang}/${pagePath}">` : ""}
${pagePath ? `<link rel="alternate" hreflang="${lang === "zh" ? "en" : "zh"}" href="${SITE_URL}/${lang === "zh" ? "en" : "zh"}/${pagePath}">` : ""}
${pagePath ? `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/en/${pagePath}">` : ""}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE_URL}/assets/icon.png">
<meta name="twitter:card" content="summary">
${headExtra ?? ""}
</head>
<body>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="${root}index.html"><img src="${root}assets/icon.png" alt="" class="brand-icon">BioResearcher</a>
    ${navHtml(S, pagePath ? pagePath.split("/").length - 1 : 0, active)}
    ${switcher}
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>BioResearcher <strong>v${esc(siteVersion)}</strong> · ${esc(S.footer.built)} <code>${esc(buildStamp)}</code> · ${esc(S.footer.license)} <a href="${REPO_URL}/blob/main/LICENSE">Apache-2.0</a> · <a href="${REPO_URL}">GitHub</a></p>
    <p><a href="${REPO_URL}/blob/main/demos/docs/agent.${lang}.md">${esc(S.footer.agentDoc)}</a> · <a href="${REPO_URL}/blob/main/demos/docs/mcp.${lang}.md">${esc(S.footer.mcpDoc)}</a> · <a href="${REPO_URL}/blob/main/demos/docs/glossary.md">${esc(S.footer.glossary)}</a> · <a href="${REPO_URL}/blob/main/CITATION.cff">${esc(S.footer.citation)}</a></p>
  </div>
</footer>
</body>
</html>
`;
}

let buildStamp = "";
let siteVersion = "";

/* ------------------------------------------------------------------ pages */

function splashPage(data) {
  const en = data.strings.en;
  const zh = data.strings.zh;
  const body = `<div class="splash">
  <img class="splash-icon" src="assets/icon.png" alt="BioResearcher logo">
  <h1>BioResearcher <span class="ver">v${esc(data.version)}</span></h1>
  <div class="splash-cols">
    <div class="splash-col">
      <p class="pitch">${esc(zh.splash.pitch)}</p>
      <a class="btn primary" href="zh/index.html">中文 →</a>
    </div>
    <div class="splash-col">
      <p class="pitch">${esc(en.splash.pitch)}</p>
      <a class="btn primary" href="en/index.html">English →</a>
    </div>
  </div>
  <p class="splash-foot">${esc(zh.splash.foot)} · ${esc(en.splash.foot)}</p>
</div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BioResearcher</title>
<meta name="description" content="${esc(en.splash.pitch)}">
<link rel="icon" type="image/png" href="favicon.png">
<link rel="stylesheet" href="assets/style.css">
<meta property="og:title" content="BioResearcher">
<meta property="og:description" content="${esc(en.splash.pitch)}">
<meta property="og:image" content="${SITE_URL}/assets/icon.png">
<meta name="twitter:card" content="summary">
</head>
<body class="splash-body">
${body}
</body>
</html>
`;
}

function notFoundPage(data) {
  const en = data.strings.en;
  const zh = data.strings.zh;
  const body = `<div class="notfound">
  <h1>404</h1>
  <p>${esc(zh.notfound)}</p>
  <p>${esc(en.notfound)}</p>
  <p><a class="btn" href="index.html">${zh.notfoundHome} / ${en.notfoundHome}</a></p>
</div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>404 · BioResearcher</title><link rel="icon" type="image/png" href="favicon.png"><link rel="stylesheet" href="assets/style.css"></head>
<body class="splash-body">${body}</body></html>
`;
}

function homePage(data, lang) {
  const S = data.strings[lang];
  const cards = S.home.cards
    .map((c) => card({ title: esc(c.title), body: esc(c.body), href: c.href ?? null }))
    .join("");
  const navCards = S.home.navCards
    .map((c) => `<a class="nav-card" href="${esc(c.href)}"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></a>`)
    .join("");
  const body = `<section class="hero">
  <h1>${esc(S.home.heroTitle)} <span class="ver">v${esc(data.version)}</span></h1>
  <p class="hero-sub">${esc(S.home.heroSub)}</p>
  <p><a class="btn primary" href="get-started.html">${esc(S.home.cta)}</a>
     <a class="btn" href="demos/index.html">${esc(S.home.ctaDemos)}</a></p>
</section>
<section>
  <h2>${esc(S.home.cardsTitle)}</h2>
  <div class="card-grid">${cards}</div>
</section>
<section>
  <h2>${esc(S.home.navTitle)}</h2>
  <div class="nav-grid">${navCards}</div>
</section>`;
  return layout({ S, lang, title: `${S.home.heroTitle} — BioResearcher`, description: S.splash.pitch, body, active: "home", pagePath: "index.html" });
}

function getStartedPage(data, lang) {
  const S = data.strings[lang];
  const channels = S.getStarted.channels
    .map((c) => `<div class="channel"><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p>${codeBlock(c.code)}</div>`)
    .join("");
  const body = `<section class="hero"><h1>${esc(S.getStarted.title)}</h1><p>${esc(S.getStarted.intro)}</p></section>
<section><h2>${esc(S.getStarted.reqTitle)}</h2>${kvTable(S.getStarted.requirements.map(([k, v]) => [esc(k), esc(v)]))}</section>
<section><h2>${esc(S.getStarted.channelsTitle)}</h2>${channels}</section>
<section><h2>${esc(S.getStarted.chinaTitle)}</h2><p>${esc(S.getStarted.chinaBody)}</p></section>
<section><h2>${esc(S.getStarted.doctorTitle)}</h2><p>${esc(S.getStarted.doctorBody)}</p>${codeBlock(S.getStarted.doctorCode)}</section>
<section><p class="more">${esc(S.getStarted.more)} <a href="${REPO_URL}/blob/main/demos/docs/agent.${lang}.md${DOC_ANCHORS[lang].onboarding[0]}">${esc(S.getStarted.moreLink)}</a></p></section>`;
  return layout({ S, lang, title: `${S.getStarted.title} — BioResearcher`, description: S.getStarted.intro.slice(0, 160), body, active: "getStarted", pagePath: "get-started.html" });
}

function faqPage(data, lang) {
  const S = data.strings[lang];
  const items = S.faq.items
    .map((it, i) => `<details class="faq" ${i === 0 ? "open" : ""}><summary>${esc(it.q)}</summary><div class="faq-a">${esc(it.a)}${it.link ? ` <a href="${esc(it.link)}">${esc(it.linkText ?? "→")}</a>` : ""}</div></details>`)
    .join("");
  const body = `<section class="hero"><h1>${esc(S.faq.title)}</h1><p>${esc(S.faq.intro)}</p></section>
<section>${items}</section>
<section><p class="more">${esc(S.faq.more)} <a href="${REPO_URL}/blob/main/demos/docs/agent.${lang}.md${DOC_ANCHORS[lang].faq[0]}">${esc(S.faq.moreLink)}</a></p></section>`;
  return layout({ S, lang, title: `${S.faq.title} — BioResearcher`, description: S.faq.intro.slice(0, 160), body, active: "faq", pagePath: "faq.html" });
}

function skillsIndexPage(data, lang) {
  const S = data.strings[lang];
  const cards = data.skills
    .map((sk) => {
      const extra = data.skillsExtra[sk.name] ?? {};
      const zhDesc = (data.skillsExtra[sk.name] ?? {}).descZh ?? data.locales.skills?.[sk.name]?.description_zh;
      const desc = lang === "zh" ? (zhDesc ?? sk.description) : sk.description;
      return card({
        title: `<code>${esc(sk.name)}</code> <span class="mini-badge">v${esc(sk.version)}</span>`,
        body: esc(desc.length > 220 ? desc.slice(0, 220) + "…" : desc),
        href: `${sk.name}.html`,
      });
    })
    .join("");
  const body = `<section class="hero"><h1>${esc(S.skills.title)}</h1><p>${esc(S.skills.intro)}</p></section>
<section><div class="card-grid">${cards}</div></section>`;
  return layout({ S, lang, title: `${S.skills.title} — BioResearcher`, description: S.skills.intro.slice(0, 160), body, active: "skills", pagePath: "skills/index.html" });
}

function skillPage(data, lang, skillName) {
  const S = data.strings[lang];
  const sk = data.skills.find((s) => s.name === skillName);
  const extra = data.skillsExtra[skillName] ?? {};
  const zhDesc = extra.descZh ?? data.locales.skills?.[skillName]?.description_zh;
  const desc = lang === "zh" ? (zhDesc ?? sk.description) : sk.description;
  const rows = [];
  rows.push([esc(S.skills.p.version), esc(sk.version)]);
  if (extra.outputs?.[lang]) rows.push([esc(S.skills.p.outputs), esc(extra.outputs[lang])]);
  const demoCase = extra.demo ? data.cases.find((c) => c.id === extra.demo) : null;
  if (demoCase) rows.push([esc(S.skills.p.demo), `<a href="../demos/${demoCase.id}.html">${esc(lang === "zh" ? demoCase.scenario.title_zh : demoCase.scenario.title_en)}</a>`]);
  const note = extra.note?.[lang];
  const body = `<section class="hero"><h1><code>${esc(skillName)}</code> <span class="mini-badge">v${esc(sk.version)}</span></h1></section>
<section>${kvTable(rows)}</section>
${note ? `<section class="note"><p>${esc(note)}</p></section>` : ""}
<section><p>${esc(desc)}</p></section>
<section><p class="more">
  <a href="${REPO_URL}/blob/main/skills/${skillName}/SKILL.md">${esc(S.skills.p.skillMd)}</a>
  · <a href="${REPO_URL}/blob/main/demos/docs/agent.${lang}.md${DOC_ANCHORS[lang].api[0]}">${esc(S.skills.p.contract)}</a>
</p></section>`;
  return layout({ S, lang, title: `${skillName} — BioResearcher`, description: desc.slice(0, 160), body, active: "skills", pagePath: `skills/${skillName}.html` });
}

function mcpPage(data, lang) {
  const S = data.strings[lang];
  const coreRows = data.coreDomains
    .map(([domain, tools]) => `<tr><th>${esc(domain)}</th><td>${tools.map((t) => `<code>${esc(t)}</code>`).join(" ")}</td></tr>`)
    .join("");
  const optRows = data.optionalGroups
    .map(([g, tools]) => `<tr><th>${esc(g)}</th><td>${tools.map((t) => `<code>${esc(t)}</code>`).join(" ")}</td></tr>`)
    .join("");
  const captures = data.mcpCaptures.captures
    .map((c) => `<div class="capture"><h3><code>${esc(c.tool)}</code></h3>
<p>${esc(c.note[lang])}</p>
<p class="capture-req">${esc(S.mcp.request)}</p>${codeBlock(JSON.stringify(c.args, null, 2))}
<p class="capture-resp">${esc(S.mcp.response)}</p><pre class="code resp">${esc(c.response)}</pre></div>`)
    .join("");
  const tourEn = data.cases.find((c) => c.id === "mcp-tool-tour-en");
  const tourZh = data.cases.find((c) => c.id === "mcp-tool-tour-zh");
  const body = `<section class="hero"><h1>${esc(S.mcp.title)}</h1>
<p>${esc(S.mcp.intro)}</p>
<p><a class="btn" href="https://github.com/yeyuan98/biomcp-ts">GitHub ↗</a> <a class="btn" href="https://www.npmjs.com/package/biomcp">npm ↗</a></p></section>
<section><h2>${esc(S.mcp.catalogTitle)} (${data.registry.core.length} + ${data.registry.optional.length})</h2>
<table class="catalog"><tr><th class="colspan" colspan="2">${esc(S.mcp.coreTitle)} · ${data.registry.core.length}</th></tr>${coreRows}
<tr><th class="colspan" colspan="2">${esc(S.mcp.optionalTitle)} · ${data.registry.optional.length} (${esc(S.mcp.optionalNote)})</th></tr>${optRows}</table></section>
<section><h2>${esc(S.mcp.wiringTitle)}</h2><p>${esc(S.mcp.wiringBody)}</p>${codeBlock(S.mcp.wiringCode)}<p class="more"><a href="${REPO_URL}/blob/main/docs/biomcp-ts-setup.md">${esc(S.mcp.wiringMore)}</a></p></section>
<section><h2>${esc(S.mcp.capturesTitle)}</h2><p>${esc(S.mcp.capturesIntro)}</p>${captures}</section>
<section><p class="more">${esc(S.mcp.tours)} <a href="demos/mcp-tool-tour-en.html">${esc(tourEn.scenario.title_en)}</a> · <a href="demos/mcp-tool-tour-zh.html">${esc(tourZh.scenario.title_en)}</a> — ${esc(S.mcp.more)} <a href="${REPO_URL}/blob/main/demos/docs/mcp.${lang}.md">${esc(S.mcp.moreLink)}</a></p></section>`;
  return layout({ S, lang, title: `${S.mcp.title} — BioResearcher`, description: S.mcp.intro.slice(0, 160), body, active: "mcp", pagePath: "mcp.html" });
}

function outcomeBadges(c, D) {
  const adj = (c.result.adjudications ?? []).length > 0;
  return badge(adj ? D.rubricPass : D.pass, adj ? "amber" : "green") + badge(`${c.provenance.durationSec ?? "—"}s`, "") + badge(`${D.promptLang}: ${c.scenario.lang ?? "?"}`, "") + badge(`${D.artifactLang}: ${c.overlay.artifactLang}`, "");
}

function checksStrip(c, D, lang) {
  // Manual (rubric) checks are reported via the rubric note, not counted in
  // the machine-check denominator (otherwise adjudicated cases read 1/2).
  const machine = (c.result.checks ?? []).filter((x) => x.status !== "manual");
  const total = machine.length;
  const pass = machine.filter((x) => x.status === "pass").length;
  const rubric = (c.result.adjudications ?? []).length;
  const counted = `<strong>${pass}/${total}</strong>`;
  const label = lang === "zh" ? `${counted} ${esc(D.checks)}` : `${esc(D.checks)}: ${counted}`;
  return `<p class="checks">${label}${rubric ? ` · ${esc(D.rubricNote)}` : ""}</p>`;
}

function evidencePanel(c, D, assetsPrefix, lang) {
  const id = c.id;
  const ev = c.overlay.evidence;
  const cap = (t) => `<p class="ev-caption">${esc(t)}</p>`;
  if (ev.type === "iframe") {
    return `<div class="doc-viewport">
  <div class="doc-bar"><span>${esc(D.embeddedReport)}</span><a href="${assetsPrefix}${id}/final_report.html" target="_blank" rel="noopener">${esc(D.openFull)} ↗</a></div>
  <iframe src="${assetsPrefix}${id}/final_report.html" loading="lazy" sandbox="allow-same-origin" title="${esc(c.scenario.title_en)}"></iframe>
</div>
<p class="asset-links"><a href="${assetsPrefix}${id}/final_report.md">final_report.md</a> · <a href="${assetsPrefix}${id}/final_report-top.jpg">${D.screenshot}</a></p>`;
  }
  if (ev.type === "figure") {
    const qa = ev.qa.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
    return `<figure class="figure-panel">
  <a href="${assetsPrefix}${id}/fig1_kras_landscape.png"><img src="${assetsPrefix}${id}/fig1_kras_landscape.png" alt="${esc(ev.alt ?? "figure")}" loading="lazy"></a>
</figure>
<table class="kv">${qa}</table>
<p class="asset-links"><a href="${assetsPrefix}${id}/fig1_kras_landscape.pdf">PDF</a> · <a href="${assetsPrefix}${id}/fig1_kras_landscape.svg">SVG</a> · <a href="${assetsPrefix}${id}/LEGENDS.md">LEGENDS.md</a> · <a href="${assetsPrefix}${id}/fig1_kras_landscape.alignment.json">alignment.json</a></p>`;
  }
  if (ev.type === "xlsx") {
    const rows = ev.table.map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("");
    return `<table class="grid">${rows}</table>
<p class="asset-links"><a href="${assetsPrefix}${id}/combined.xlsx">combined.xlsx</a></p>`;
  }
  if (ev.type === "interview") {
    return `<div class="doc-viewport static"><div class="doc-bar"><span>${esc(D.questionsLabel)}</span></div><div class="doc-body">${esc(ev.excerpt)}</div></div>`;
  }
  if (ev.type === "probe") {
    const calls = ev.calls
      .map((r) => `<tr><td><code>${esc(r[0])}</code></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`)
      .join("");
    const samples = (ev.samples ?? [])
      .map((s) => `<div class="capture"><h3><code>${esc(s.tool)}</code></h3><p>${esc(s.note?.[lang] ?? "")}</p>
<p class="capture-req">${esc(D.request)}</p>${codeBlock(JSON.stringify(s.args, null, 2))}
<p class="capture-resp">${esc(D.response)}</p><pre class="code resp">${esc(s.response)}</pre></div>`)
      .join("");
    return `<table class="grid probe"><tr><th>${esc(D.tool)}</th><th>${esc(D.assert)}</th><th>${esc(D.ms)}</th></tr>${calls}</table>
${samples}
<p class="asset-links"><a href="${assetsPrefix}${id}/capture.jsonl">capture.jsonl</a> · <a href="${assetsPrefix}${id}/tools-list.json">tools-list.json</a></p>`;
  }
  throw new Error(`cases/${id}.json: unknown evidence type ${ev.type}`);
}

function casePage(data, lang, c) {
  const S = data.strings[lang];
  const D = S.demos;
  const assetsPrefix = "../../assets/";
  const findings = (c.overlay.findings[lang] ?? c.overlay.findings.en)
    .map((f) => `<li>${esc(f)}</li>`).join("");
  const isProbe = c.scenario.kind === "mcp-probe";
  const packDirUrl = `${REPO_URL}/tree/${PACK_COMMIT}/demos/artifacts/${c.id}`;
  // Note is chosen by ARTIFACT language and rendered in the PAGE language:
  // the zh string describes an English artifact; the en string a Chinese one.
  const langNote = c.overlay.artifactLang !== lang
    ? `<p class="lang-note">${esc(c.overlay.artifactLang === "zh" ? D.artifactLangNoteEn : D.artifactLangNoteZh)}</p>`
    : "";
  const body = `<section class="hero case-hero">
  <h1>${esc(lang === "zh" ? c.scenario.title_zh : c.scenario.title_en)}</h1>
  <div class="badges">${outcomeBadges(c, D)}</div>
</section>
<section>
  <h2>${esc(D.promptTitle)}</h2>
  ${(c.result.promptText ?? c.scenario.prompt) ? promptBlock(c.result.promptText ?? c.scenario.prompt) : `<p class="replay-note">${esc(D.noPrompt)}</p>`}
</section>
<section>
  <h2>${esc(D.findingsTitle)}</h2>
  <ul class="findings">${findings}</ul>
</section>
<section>
  <h2>${esc(D.evidenceTitle)}</h2>
  ${langNote}
  ${evidencePanel(c, D, assetsPrefix, lang)}
</section>
<section>
  <h2>${esc(D.checksTitle)}</h2>
  ${checksStrip(c, D, lang)}
  ${kvTable([
    [esc(D.fanout), esc(c.overlay.fanout?.[lang] ?? "—")],
    [esc(D.provenance), [
      `<code>${esc((c.provenance.gitCommit ?? "").slice(0, 7))}</code>`,
      c.provenance.opencodeVersion ? `opencode ${esc(c.provenance.opencodeVersion)}` : null,
      c.provenance.biomcpPin ? `biomcp@${esc(c.provenance.biomcpPin)}` : null,
    ].filter((x) => x).join(" · ")],
  ])}
</section>
<section>
  <h2>${esc(D.replayTitle)}</h2>
  ${codeBlock(`node demos/run-demo.mjs --only ${c.id} --publish`)}
  <p class="replay-note">${esc(isProbe ? D.replayFree : D.replayWarn)}</p>
</section>
<section>
  <p class="more">${esc(D.more)}:
  <a href="${REPO_URL}/blob/${PACK_COMMIT}/demos/artifacts/${c.id}/README.md">README</a> ·
  <a href="${REPO_URL}/blob/${PACK_COMMIT}/demos/artifacts/${c.id}/transcript.md">transcript</a> ·
  <a href="${REPO_URL}/blob/${PACK_COMMIT}/demos/artifacts/${c.id}/result.json">result.json</a> ·
  <a href="${packDirUrl}">${esc(D.dir)}</a></p>
</section>`;
  return layout({ S, lang, title: `${lang === "zh" ? c.scenario.title_zh : c.scenario.title_en} — BioResearcher`, description: (lang === "zh" ? c.scenario.summary_zh : c.scenario.summary_en).slice(0, 160), body, active: "demos", pagePath: `demos/${c.id}.html` });
}

function demosIndexPage(data, lang) {
  const S = data.strings[lang];
  const D = S.demos;
  const cards = data.cases
    .map((c) => card({
      title: esc(lang === "zh" ? c.scenario.title_zh : c.scenario.title_en),
      body: esc((() => { const t = lang === "zh" ? c.scenario.summary_zh : c.scenario.summary_en; return t.length > 180 ? t.slice(0, 180) + "…" : t; })()),
      href: `${c.id}.html`,
      badgeHtml: outcomeBadges(c, D),
    }))
    .join("");
  const body = `<section class="hero"><h1>${esc(D.title)}</h1><p>${esc(D.intro)}</p><p class="note-line">${esc(D.htmlNote)}</p></section>
<section><div class="card-grid">${cards}</div></section>
<section><p class="more">${esc(D.replayAll)} <a href="${REPO_URL}/blob/main/demos/README.md">demos/README.md</a></p></section>`;
  return layout({ S, lang, title: `${D.title} — BioResearcher`, description: D.intro.slice(0, 160), body, active: "demos", pagePath: "demos/index.html" });
}

/* ------------------------------------------------------------------ build */

function collectAssetFiles(c) {
  // Everything under outputs/ + screenshots/, flattened by basename.
  const out = [];
  const base = path.join(REPO, "demos", "artifacts", c.id);
  for (const sub of ["outputs", "screenshots"]) {
    const dir = path.join(base, sub);
    if (!fs.existsSync(dir)) continue;
    {
      const stack = [dir];
      while (stack.length) {
        const d = stack.pop();
        for (const de of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, de.name);
          if (de.isDirectory()) stack.push(p);
          else out.push(p);
        }
      }
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("usage: node demos/website/build.mjs [--out DIR] [--no-copy-artifacts]");
    return 0;
  }
  const data = loadInputs();
  const outDir = path.resolve(args.out ?? path.join(WEBSITE_DIR, "_site"));
  // Safety guard: the build rmSync's the output directory recursively —
  // refuse anything inside the repo except the default _site location.
  if (outDir !== path.join(WEBSITE_DIR, "_site") && (outDir === REPO || outDir.startsWith(REPO + path.sep))) {
    console.error(`build: refusing to rmSync inside the repo: ${outDir} (use a path outside, or omit --out)`);
    return 1;
  }
  buildStamp = `${data.sha} · ${new Date().toISOString().slice(0, 10)}`;
  siteVersion = data.version;
  fs.rmSync(outDir, { recursive: true, force: true });
  const W = (rel) => { const p = path.join(outDir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); return p; };

  const warnings = [];

  // 1) assets: icon + css + per-case artifact outputs (flattened).
  fs.copyFileSync(data.icon, W("favicon.png"));
  fs.copyFileSync(data.icon, W("assets/icon.png"));
  // Backwards-compatible aliases for external caches:
  fs.copyFileSync(data.icon, W("favicon.jpg"));
  fs.copyFileSync(data.icon, W("assets/icon.jpg"));
  fs.writeFileSync(W("assets/style.css"), data.css);
  if (!args.noCopyArtifacts) {
    for (const c of data.cases) {
      const seen = new Set();
      for (const src of collectAssetFiles(c)) {
        const name = path.basename(src);
        if (seen.has(name)) throw new Error(`asset basename collision in ${c.id}: ${name}`);
        seen.add(name);
        const st = fs.statSync(src);
        if (st.size > MAX_ASSET_BYTES) {
          warnings.push(`asset skipped (> ${(MAX_ASSET_BYTES / 1048576).toFixed(1)} MiB cap): ${c.id}/${name}`);
          continue;
        }
        fs.copyFileSync(src, W(path.join("assets", c.id, name)));
      }
    }
  } else {
    warnings.push("--no-copy-artifacts: artifact assets not copied; link check runs in warn mode");
  }

  // 2) pages.
  const pages = [];
  pages.push(["index.html", splashPage(data)]);
  pages.push(["404.html", notFoundPage(data)]);
  for (const lang of ["en", "zh"]) {
    pages.push([`${lang}/index.html`, homePage(data, lang)]);
    pages.push([`${lang}/get-started.html`, getStartedPage(data, lang)]);
    pages.push([`${lang}/faq.html`, faqPage(data, lang)]);
    pages.push([`${lang}/skills/index.html`, skillsIndexPage(data, lang)]);
    for (const sk of data.skills) pages.push([`${lang}/skills/${sk.name}.html`, skillPage(data, lang, sk.name)]);
    pages.push([`${lang}/mcp.html`, mcpPage(data, lang)]);
    pages.push([`${lang}/demos/index.html`, demosIndexPage(data, lang)]);
    for (const c of data.cases) pages.push([`${lang}/demos/${c.id}.html`, casePage(data, lang, c)]);
  }
  for (const [rel, html] of pages) fs.writeFileSync(W(rel), html);

  // 3) robots + sitemap + .nojekyll.
  fs.writeFileSync(W("robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  const sitemapUrls = pages
    .filter(([rel]) => rel !== "404.html")
    .map(([rel]) => `${SITE_URL}/${rel.replaceAll(path.sep, "/")}`);
  fs.writeFileSync(W("sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(W(".nojekyll"), "");

  // 4) tripwire: embedded artifact HTML must stay self-contained — no
  //    remotely LOADED assets (<img>/<script>/<iframe>/<link> src|href).
  //    Plain outbound text anchors (doi.org, pubmed — auto-linkified by the
  //    1.2.0+ report renderer) are citations, not asset dependencies.
  for (const c of data.cases) {
    const p = path.join(outDir, "assets", c.id, "final_report.html");
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    if (/<(?:img|script|iframe|source|link|video|audio|track|embed|object)\b[^>]*(src|href|data)\s*=\s*["']\s*(?:https?:)?\/\//i.test(text)) {
      warnings.push(`tripwire: ${c.id}/final_report.html loads remote assets`);
    }
  }

  // 5) link check: internal href/src must resolve; absolute URLs allowed only
  //    in sitemap.xml and inside <meta>/<link> tags.
  let broken = 0;
  const htmlFiles = [];
  const stack = [outDir];
  while (stack.length) {
    const d = stack.pop();
    for (const de of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, de.name);
      if (de.isDirectory()) stack.push(p);
      else if (de.name.endsWith(".html") || de.name.endsWith(".htm")) htmlFiles.push(p);
    }
  }
  for (const file of htmlFiles.sort()) {
    let text = fs.readFileSync(file, "utf8");
    text = text.replace(/<meta\b[^>]*>/gi, "").replace(/<link\b[^>]*>/gi, "");
    // Embedded artifact reports ship interactive-citation inline <script>
    // whose template strings contain href="' + expr + '" fragments; those
    // are code, not links — strip script blocks before scanning.
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    for (const m of text.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|data:)/i.test(href) || href.startsWith("#")) continue;
      const clean = href.split("#")[0];
      if (!clean) continue;
      const target = path.resolve(path.dirname(file), clean);
      if (!fs.existsSync(target)) {
        const rel = path.relative(outDir, file);
        if (args.noCopyArtifacts && clean.includes("assets/")) {
          warnings.push(`link (warn, assets not copied): ${rel} -> ${clean}`);
        } else {
          console.error(`FAIL link: ${rel} -> ${clean}`);
          broken++;
        }
      }
    }
  }
  // sitemap absolute URLs must point at files we generated.
  const sitemap = fs.readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
  for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const rel = m[1].replace(`${SITE_URL}/`, "");
    if (!fs.existsSync(path.join(outDir, rel))) {
      console.error(`FAIL sitemap loc does not exist: ${m[1]}`);
      broken++;
    }
  }

  // 6) report.
  let fileCount = 0;
  let byteCount = 0;
  const countStack = [outDir];
  while (countStack.length) {
    const d = countStack.pop();
    for (const de of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, de.name);
      if (de.isDirectory()) countStack.push(p);
      else { fileCount++; byteCount += fs.statSync(p).size; }
    }
  }
  for (const w of warnings) console.warn(`warn: ${w}`);
  console.log(`site: ${pages.length} page(s), ${fileCount} file(s), ${(byteCount / 1024).toFixed(0)} KiB -> ${outDir}`);
  if (broken) {
    console.error(`link check: ${broken} broken reference(s)`);
    return 1;
  }
  console.log("link check: all internal references resolve");
  return 0;
}

process.exitCode = main();
