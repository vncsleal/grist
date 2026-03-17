# Quillby Installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/vncsleal/quillby/main/install.ps1 | iex
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Quillby Installer" -ForegroundColor Magenta
Write-Host ""

# ── 1. Detect platform ────────────────────────────────────────────────────────
$arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
if ($arch -ne "x64") {
    Write-Host "x  Unsupported architecture: $arch. Only x64 is supported." -ForegroundColor Red
    exit 1
}
$asset = "quillby-mcp-windows-x64.exe"

# ── 2. Determine install location ─────────────────────────────────────────────
$installDir = Join-Path $env:LOCALAPPDATA "Quillby"
$binaryPath = Join-Path $installDir "quillby-mcp.exe"

# ── 3. Fetch latest release ───────────────────────────────────────────────────
Write-Host "->  Checking latest release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/vncsleal/quillby/releases/latest" -UseBasicParsing
$tag = $release.tag_name

if (-not $tag) {
    Write-Host "x  Could not determine latest release." -ForegroundColor Red
    exit 1
}

Write-Host "->  Downloading Quillby $tag..."

# ── 4. Download binary ────────────────────────────────────────────────────────
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
}

$downloadUrl = "https://github.com/vncsleal/quillby/releases/download/$tag/$asset"
Invoke-WebRequest -Uri $downloadUrl -OutFile $binaryPath -UseBasicParsing

Write-Host "v  Quillby downloaded" -ForegroundColor Green

# ── 5. Find Claude Desktop config ─────────────────────────────────────────────
$configDir = Join-Path $env:APPDATA "Claude"
$configFile = Join-Path $configDir "claude_desktop_config.json"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

# ── 6. Write Claude Desktop config ────────────────────────────────────────────
$config = @{}
if (Test-Path $configFile) {
    try {
        $config = Get-Content $configFile -Raw | ConvertFrom-Json -AsHashtable
    } catch {
        $config = @{}
    }
}

if (-not $config.ContainsKey("mcpServers")) {
    $config["mcpServers"] = @{}
}

$config["mcpServers"]["quillby"] = @{ command = $binaryPath }

$config | ConvertTo-Json -Depth 10 | Set-Content -Path $configFile -Encoding UTF8

Write-Host "v  Claude Desktop config updated" -ForegroundColor Green
Write-Host "   $configFile"

# ── 7. Done ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Done!" -ForegroundColor White
Write-Host ""
Write-Host "   1. Fully quit Claude Desktop (right-click the taskbar icon -> Quit)."
Write-Host "   2. Reopen Claude Desktop."
Write-Host "   3. In a new chat, type:"
Write-Host ""
Write-Host "      'Set me up with Quillby'" -ForegroundColor Magenta
Write-Host ""
