# Quillby Installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/vncsleal/quillby/main/install.ps1 | iex
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Quillby Installer" -ForegroundColor Magenta
Write-Host ""

# ── 1. Node.js check ─────────────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "   Node.js not found — installing it now..." -ForegroundColor Yellow
    Write-Host ""

    $installed = $false

    # Try winget first (built into Windows 10 1709+ and Windows 11)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "   Using winget..."
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        $installed = $true
    } else {
        # Fallback: download the official LTS MSI
        Write-Host "   Downloading Node.js LTS installer..."
        $arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
        $indexJson = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
        $lts = $indexJson | Where-Object { $_.lts } | Select-Object -First 1
        $version = $lts.version
        $msiUrl = "https://nodejs.org/dist/$version/node-$version-$arch.msi"
        $msiPath = Join-Path $env:TEMP "node-lts.msi"
        Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
        Write-Host "   Running installer..."
        Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /quiet /norestart" -Wait
        Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
        $installed = $true
    }

    # Refresh PATH so node is visible in this session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "x  Node.js installation failed." -ForegroundColor Red
        Write-Host "   Please install it manually from https://nodejs.org and re-run:"
        Write-Host "   irm https://raw.githubusercontent.com/vncsleal/quillby/main/install.ps1 | iex"
        exit 1
    }
}

$nodeVersion = node --version
Write-Host "v  Node.js $nodeVersion" -ForegroundColor Green

# ── 2. Install quillby globally ───────────────────────────────────────────────
Write-Host "->  Installing Quillby (npm install -g @vncsleal/quillby)..."
npm install -g @vncsleal/quillby --silent
Write-Host "v  Quillby installed" -ForegroundColor Green

# ── 3. Resolve absolute paths ─────────────────────────────────────────────────
$nodeBin = (Get-Command node).Source
$npmGlobalRoot = (npm root -g).Trim()
$serverJs = Join-Path $npmGlobalRoot "@vncsleal\quillby\dist\mcp\server.js"

if (-not (Test-Path $serverJs)) {
    Write-Host "x  Could not find $serverJs" -ForegroundColor Red
    Write-Host "   Try running: npm install -g @vncsleal/quillby"
    exit 1
}

# ── 4. Find Claude Desktop config ────────────────────────────────────────────
$configDir = Join-Path $env:APPDATA "Claude"
$configFile = Join-Path $configDir "claude_desktop_config.json"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

# ── 5. Merge config via Node.js (already guaranteed available) ────────────────
$configScript = @"
const fs = require('fs');
const [,, configPath, nodeBin, serverJs] = process.argv;
let config = {};
if (fs.existsSync(configPath)) {
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
}
config.mcpServers = config.mcpServers || {};
config.mcpServers.quillby = { command: nodeBin, args: [serverJs] };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
"@

node -e $configScript -- $configFile $nodeBin $serverJs

Write-Host "v  Claude Desktop config updated" -ForegroundColor Green
Write-Host "   $configFile"

# ── 6. Done ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Done!" -ForegroundColor White
Write-Host ""
Write-Host "   1. Fully quit Claude Desktop (right-click the taskbar icon -> Quit)."
Write-Host "   2. Reopen Claude Desktop."
Write-Host "   3. In a new chat, type:"
Write-Host ""
Write-Host "      'Set me up with Quillby'" -ForegroundColor Magenta
Write-Host ""
