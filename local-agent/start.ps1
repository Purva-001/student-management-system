# ── Local Docker Execution Agent — Start Script ──────────────────────────────
# Run this script on your local machine to start the Docker agent.
# The agent listens ONLY on 127.0.0.1:4000 (not exposed to the network).
#
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          Local Docker Execution Agent Launcher              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path "$scriptDir\.env")) {
    Write-Host "❌ .env file not found in $scriptDir" -ForegroundColor Red
    Write-Host "   Copy .env.example to .env and fill in LOCAL_AGENT_SECRET" -ForegroundColor Yellow
    exit 1
}

# Check if node_modules exist
if (-not (Test-Path "$scriptDir\node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    Set-Location $scriptDir
    npm install
}

# Check if dist exists, build if not
if (-not (Test-Path "$scriptDir\dist\index.js")) {
    Write-Host "🔨 Building TypeScript..." -ForegroundColor Yellow
    Set-Location $scriptDir
    npm run build
}

Write-Host "🚀 Starting Local Docker Execution Agent..." -ForegroundColor Green
Write-Host "   Bound to: http://127.0.0.1:4000 (local only)" -ForegroundColor Gray
Write-Host "   Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

Set-Location $scriptDir
node dist/index.js
