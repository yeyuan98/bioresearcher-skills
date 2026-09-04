# Stage 0 Zero-Dependency PowerShell Bootstrap for bioresearcher-onboard (Windows)
# Checks for existing Node >= 22.13; if missing, downloads pinned portable
# Node.js LTS into .bioresearcher-runtime\node, verifies SHA256, and hands off
# execution to onboard.mjs.
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeRoot = if ($env:BIORESEARCHER_RUNTIME_DIR) { $env:BIORESEARCHER_RUNTIME_DIR } else { Join-Path (Get-Location).Path ".bioresearcher-runtime" }
$NodeDir = Join-Path $RuntimeRoot "node"
$NodeExe = Join-Path $NodeDir "node.exe"

$NodeVer = "v22.14.0"

# 1. Probe if host already satisfies Node >= 22.13
if (Get-Command node -ErrorAction SilentlyContinue) {
    try {
        $check = node -e "var v=process.versions.node.split('.');process.exit((v[0]>22||(v[0]==22&&v[1]>=13))?0:1)"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[bioresearcher-onboard] Found host $(node -v) on PATH"
            & node "$ScriptDir\onboard.mjs" @args
            exit $LASTEXITCODE
        }
    } catch {}
}

# If already vendored in working directory, reuse directly
if (Test-Path $NodeExe) {
    $env:PATH = "$NodeDir;$env:PATH"
    & "$NodeExe" "$ScriptDir\onboard.mjs" @args
    exit $LASTEXITCODE
}

Write-Host "[bioresearcher-onboard] Host Node >= 22.13 not found. Bootstrapping portable Node.js $NodeVer into .bioresearcher-runtime\..."

# 2. Architecture Detection
$Arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq [System.Runtime.InteropServices.Architecture]::Arm64) {
    "arm64"
} else {
    "x64"
}

# 3. Mirror Selection Probe (2-second integer timeout)
$MirrorBase = "https://nodejs.org/dist/$NodeVer"
$NpmRegistry = "https://registry.npmjs.org"
try {
    $req = [System.Net.WebRequest]::Create("https://nodejs.org/dist/")
    $req.Timeout = 2000
    $res = $req.GetResponse()
    $res.Close()
} catch {
    Write-Host "[bioresearcher-onboard] nodejs.org unreachable; using npmmirror.com fast mirror"
    $MirrorBase = "https://npmmirror.com/mirrors/node/$NodeVer"
    $NpmRegistry = "https://registry.npmmirror.com"
}

$File = "node-$NodeVer-win-$Arch.zip"
$DownloadUrl = "$MirrorBase/$File"

$Checksums = @{
    "x64"   = "55b639295920b219bb2acbcfa00f90393a2789095b7323f79475c9f34795f217"
    "arm64" = "2d71f5f9b2fffa33baa108c07d74b0d24e0c3dd8f441d567772ae0e3dd4b1a22"
}
$ExpectedSha = $Checksums[$Arch]

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
$TmpArchive = Join-Path $RuntimeRoot "node.zip"

Write-Host "[bioresearcher-onboard] Downloading $File..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TmpArchive -UseBasicParsing

# 4. Checksum verification
$ActualSha = (Get-FileHash -Path $TmpArchive -Algorithm SHA256).Hash.ToLower()
if ($ActualSha -ne $ExpectedSha) {
    Remove-Item -Force $TmpArchive -ErrorAction SilentlyContinue
    Write-Error "SHA256 checksum verification failed for $File.`nExpected: $ExpectedSha`nActual:   $ActualSha"
    exit 1
}

# 5. Extract and flatten layout
$TmpExtract = Join-Path $RuntimeRoot "node-extract-tmp"
if (Test-Path $TmpExtract) { Remove-Item -Recurse -Force $TmpExtract }
New-Item -ItemType Directory -Force -Path $TmpExtract | Out-Null
Expand-Archive -Path $TmpArchive -DestinationPath $TmpExtract -Force
Remove-Item -Force $TmpArchive

New-Item -ItemType Directory -Force -Path $NodeDir | Out-Null
$ExtractedFolder = Get-ChildItem -Path $TmpExtract | Select-Object -First 1
Get-ChildItem -Path $ExtractedFolder.FullName | Move-Item -Destination $NodeDir -Force
Remove-Item -Recurse -Force $TmpExtract

Write-Host "[bioresearcher-onboard] Portable Node.js ready: $(& $NodeExe -v)"

# 6. Hand off to Stage 1
$env:PATH = "$NodeDir;$env:PATH"
$env:NPM_CONFIG_REGISTRY = $NpmRegistry
& "$NodeExe" "$ScriptDir\onboard.mjs" @args
exit $LASTEXITCODE
