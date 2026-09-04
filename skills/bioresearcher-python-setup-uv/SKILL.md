---
name: bioresearcher-python-setup-uv
description: "Sets up a project-local Python environment with the uv package manager: downloads the uv binary from official astral.sh, symlinks or copies it into working directory, creates a .venv with pandas, verifies install, and appends uv usage rules to AGENTS.md. Supports regional PyPI mirrors (Aliyun/Tsinghua). Use when uv or Python is missing, when analysis scripts need pandas/openpyxl, or on requests like install uv, set up Python, use a China mirror, or prepare .scripts/py/."
license: Apache-2.0
compatibility: "Unix-like shells (Linux, macOS, Git Bash) and Windows cmd.exe; requires curl or PowerShell for download"
metadata:
  version: "1.0.1"
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

### Step 1: Ask user which installer to use

Ask the user which installation source and mirror configuration should be used:

- Official Astral uv installer (https://astral.sh)
- Regional PyPI mirror acceleration (Aliyun / Tsinghua mirror via `UV_INDEX_URL`)

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

### Step 4: Create Virtual Environment and Install pandas

NOTE: this step (package installation) may timeout. If timed out, ask the user whether they would like to retry package installation. If successful, do NOT ask any question and continue to Step 5.

**For Unix-like shells:**
```bash
./uv venv
./uv pip install pandas
```

**For Windows cmd.exe:**
```bash
uv.exe venv
uv.exe pip install pandas
```

### Step 5: Verification

**For Unix-like shells:**
```bash
./uv --version
./uv run python -c "import pandas; print(pandas.__version__)"
```

**For Windows cmd.exe:**
```bash
uv.exe --version
uv.exe run python -c "import pandas; print(pandas.__version__)"
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

ALWAYS use the uv package manager available in WORKING DIRECTORY, including `uv add ...` or `uv pip ...` for package management and `uv run ...` to run python package executables.

ALWAYS save python scripts under path `./.scripts/py/` and run the script with `uv run python ...` whenever your work involves executing python scripts. Your script MUST contain concise docstrings and comments and use good engineering practices including separation of concerns.
<!-- END BIORESEARCHER UV ENVIRONMENT GUIDELINES -->
```

### Step 7: Return summary to user (Usage After Setup)

**For Unix-like shells:**
```bash
./uv run python your_script.py
```

**For Windows cmd.exe:**
```bash
uv.exe run python your_script.py
```

## Notes
- Add `.uv/` and `.venv/` to `.gitignore`
- `uv run` handles venv activation automatically
- Use `./uv add <package>` (Unix) or `uv.exe add <package>` (Windows cmd.exe) for project dependencies
- Windows with Git Bash: Follow Unix-like shell instructions
- Windows cmd.exe without Admin rights: `uv.exe` is copied instead of symlinked
