---
name: bioresearcher-python-setup-uv
description: "Sets up a project-local Python environment with the uv package manager: downloads uv binary from astral.sh, creates .venv, configures dependencies (pandas or scientific plotting: pymol-open-source, matplotlib, pymupdf, biopython), verifies install, and appends usage rules to AGENTS.md. Auto-races PyPI and CN mirrors. Use when uv/Python is missing, for plotting/analysis, or on requests like install uv, set up Python, prepare plotting packages, use a China mirror, or prepare .scripts/py/."
license: Apache-2.0
compatibility: "Unix-like shells (Linux, macOS, Git Bash) and Windows cmd.exe; requires curl or PowerShell for download"
metadata:
  version: "1.1.0"
  source: "opencode-bioresearcher-plugin@1.7.2"
allowed-tools: Bash Read
---

# Python Environment Setup with uv

This skill sets up a Python environment using the uv package manager.

## Prerequisites
- Internet connection for downloading uv
- Python 3.8+ should be available on PATH (or uv will prompt to install it)

## Steps

Follow the sequence below in order. Perform environment verification before proceeding.

### Step 1: Auto-Select the Fastest Package Index (mirror race)

Do NOT ask the user which mirror to use — probe and adopt the fastest index automatically (honor an explicit user-specified mirror if one was requested). Direct PyPI access can be extremely slow or unreachable from some networks (e.g. mainland China); regional mirrors fix this. Race PyPI, Aliyun, Tsinghua, and USTC with a timed probe and export the winner for the WHOLE session (uv reads `UV_INDEX_URL` automatically on every later `./uv pip` / `./uv venv` call):

**For Unix-like shells:**
```bash
export UV_INDEX_URL="$(
  for idx in "https://pypi.org/simple" \
             "https://mirrors.aliyun.com/pypi/simple" \
             "https://pypi.tuna.tsinghua.edu.cn/simple" \
             "https://mirrors.ustc.edu.cn/pypi/simple"; do
    if t=$(curl -o /dev/null -sS -m 6 -w '%{time_total}' "$idx/pip/" 2>/dev/null); then
      echo "$t $idx"
    fi
  done | sort -n | head -1 | cut -d' ' -f2-
)"
case "$UV_INDEX_URL" in http*) echo "Using index: $UV_INDEX_URL" ;; *) unset UV_INDEX_URL; echo "No index reachable; proceeding with defaults" ;; esac
```

Only curl exit status 0 counts as a probe success (a mirror that fails fast — DNS block, connection refused, TLS error — is excluded entirely rather than winning with a bogus near-zero time).

**For Windows cmd.exe:**
```bash
powershell -NoProfile -Command "$t=@{}; foreach($u in 'https://pypi.org/simple','https://mirrors.aliyun.com/pypi/simple','https://pypi.tuna.tsinghua.edu.cn/simple','https://mirrors.ustc.edu.cn/pypi/simple'){ try { $sw=[Diagnostics.Stopwatch]::StartNew(); Invoke-WebRequest -UseBasicParsing -TimeoutSec 6 "$u/pip/" | Out-Null; $t[$sw.Elapsed.TotalSeconds]=$u } catch {} }; if($t.Count){ [Console]::WriteLine(($t.GetEnumerator() | Sort-Object Name | Select-Object -First 1).Value) }"
:: then: set UV_INDEX_URL=<winner>  (or leave unset if PyPI is fast for you)
```

### Step 2: Detect Shell and Download uv Binary

First, detect your shell environment:

```bash
# Detect shell type
# MSYSTEM is set by Git Bash, MINGW_PREFIX by MSYS2
if [ -n "$MSYSTEM" ] || [ -n "$MINGW_PREFIX" ] || command -v curl >/dev/null 2>&1; then
  echo "Unix-like shell detected (Git Bash, bash, zsh, etc.)"
  IS_UNIX_SHELL=true
else
  echo "Windows cmd.exe detected"
  IS_UNIX_SHELL=false
fi
```

Download the official standalone installer script to disk, verify, and run locally into `.uv`:

**For Unix-like shells (Git Bash / macOS / Linux):**
```bash
mkdir -p .uv
curl -LsSf https://astral.sh/uv/install.sh -o .uv/install-uv.sh
UV_INSTALL_DIR="$(pwd)/.uv" sh .uv/install-uv.sh
rm -f .uv/install-uv.sh
```

The installer already falls back from `releases.astral.sh` to `github.com` automatically. If BOTH are slow/unreachable (mainland China), retry with a GitHub-proxy mirror via the documented `UV_DOWNLOAD_URL` override:
```bash
UV_DOWNLOAD_URL="https://ghfast.top/https://github.com/astral-sh/uv/releases/download" \
  UV_INSTALL_DIR="$(pwd)/.uv" sh .uv/install-uv.sh
```

**For Windows cmd.exe (if Git Bash unavailable):**
```bash
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Force -Path .uv | Out-Null; $env:UV_INSTALL_DIR = (Get-Location).Path + '\.uv'; Invoke-WebRequest -Uri 'https://astral.sh/uv/install.ps1' -OutFile '.uv\install-uv.ps1'; & '.uv\install-uv.ps1'; Remove-Item -Force '.uv\install-uv.ps1'"
```

### Step 3: Create Symlink or Copy uv to Working Directory

**For Unix-like shells (Git Bash / macOS / Linux):**
```bash
ln -sf .uv/uv uv
```

**For Windows cmd.exe:**

Try symlink first, fall back to copy if no Admin rights:
```bash
cmd /c "(mklink uv .uv\uv.exe) 2>nul || copy /Y .uv\uv.exe uv.exe"
```

### Step 4: Create Virtual Environment and Install Packages

NOTE: this step (package installation) may timeout. If timed out, ask the user whether they would like to retry package installation. If successful, do NOT ask any question and continue to Step 5.

**For Unix-like shells:**
```bash
./uv venv .venv
# Standard Analysis:
VIRTUAL_ENV="$(pwd)/.venv" ./uv pip install pandas
# Scientific Visualization & Plot-Making (for bioresearcher-plot-making):
# VIRTUAL_ENV="$(pwd)/.venv" ./uv pip install pymol-open-source matplotlib pymupdf numpy pillow biopython pandas
```

CRITICAL: always export `VIRTUAL_ENV="$(pwd)/.venv"` before `./uv pip install` and `./uv run`. Without it, an active conda/mamba environment on the host (`CONDA_PREFIX`) takes precedence over the project `./.venv`, and uv will silently install into (and mutate) the HOST environment.

All `./uv pip install` calls automatically use the `UV_INDEX_URL` selected in Step 1 (pass `--index-url "$UV_INDEX_URL"` explicitly if the env var may have been dropped between commands).

**For Windows cmd.exe:**
```bash
uv.exe venv .venv
# Standard Analysis:
uv.exe pip install --python .venv\Scripts\python.exe pandas
# Scientific Visualization & Plot-Making:
# uv.exe pip install --python .venv\Scripts\python.exe pymol-open-source matplotlib pymupdf numpy pillow biopython pandas
```

### Step 5: Verification

**For Unix-like shells:**
```bash
./uv --version
./.venv/bin/python -c "import pandas; print('pandas', pandas.__version__)"
# For visualization stack verification:
# ./.venv/bin/python -c "from pymol import cmd; import matplotlib, pymupdf, Bio; print('PyMOL + Plotting stack ready')"
```

**For Windows cmd.exe:**
```bash
uv.exe --version
.venv\Scripts\python.exe -c "import pandas; print('pandas', pandas.__version__)"
# For visualization stack verification:
# .venv\Scripts\python.exe -c "from pymol import cmd; import matplotlib, pymupdf, Bio; print('PyMOL + Plotting stack ready')"
```

### Step 6: Update Agent Instruction File

Ask the user whether they want to update AGENTS.md (or CLAUDE.md / other agent instruction file) in the WORKING DIRECTORY to "direct agents to use the installed UV Python" (options: "Yes" / "No"). If you receive no answer, continue to Step 7 (do NOT modify the instruction file NOR create directories). If you receive a "Yes" answer, follow the steps below.

1. If the agent instruction file (AGENTS.md or equivalent) is not found in WORKING DIR, create an empty AGENTS.md.
2. Inspect its content. If you do not see the content block below, APPEND EXACTLY AS IS to the end of the file.
3. Check if `./.scripts/py` exists. If not, create the directories.

Content block:

```md
<!-- BEGIN BIORESEARCHER UV ENVIRONMENT GUIDELINES -->
## Important note about Python

ALWAYS use the uv package manager available in WORKING DIRECTORY. Pin every install and invocation to the project-local virtual environment: `VIRTUAL_ENV="$(pwd)/.venv" ./uv pip ...` for package management and `./.venv/bin/python ...` to run Python scripts or package executables. NEVER run bare `uv pip install` or `uv run` — an active host conda environment (CONDA_PREFIX) would silently take precedence over `./.venv`.

ALWAYS save python scripts under path `./.scripts/py/` and run the script with `./.venv/bin/python ...` whenever your work involves executing python scripts. Your script MUST contain concise docstrings and comments and use good engineering practices including separation of concerns.
<!-- END BIORESEARCHER UV ENVIRONMENT GUIDELINES -->
```

### Step 7: Return summary to user (Usage After Setup)

**For Unix-like shells:**
```bash
./.venv/bin/python your_script.py
```

**For Windows cmd.exe:**
```bash
.venv\Scripts\python.exe your_script.py
```

## Notes
- Add `.uv/` and `.venv/` to `.gitignore`
- `uv run`/`uv pip` only target `./.venv` when no `--python` flag, `VIRTUAL_ENV`, or host `CONDA_PREFIX` takes precedence — pin with `VIRTUAL_ENV="$(pwd)/.venv"` or invoke `./.venv/bin/python` directly
- If uv must download a Python interpreter (none found on PATH), set `UV_PYTHON_INSTALL_MIRROR` to a GitHub-proxy prefix of `https://github.com/astral-sh/python-build-standalone/releases/download` on slow networks
- Use `VIRTUAL_ENV="$(pwd)/.venv" ./uv pip install <package>` (Unix) or `uv.exe pip install --python .venv\Scripts\python.exe <package>` (Windows cmd.exe) for additional packages; avoid `uv add` unless a `pyproject.toml` project is intended
- Windows with Git Bash: Follow Unix-like shell instructions
- Windows cmd.exe without Admin rights: `uv.exe` is copied instead of symlinked
