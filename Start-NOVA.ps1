$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$novaNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$novaNode = if ($novaNodeCommand) { $novaNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $novaNode)) { throw 'Install Node.js 22.13 or newer, then run npm start.' }
$novaOllama = Join-Path $env:LOCALAPPDATA 'NOVA/ollama/ollama.exe'
if (Test-Path -LiteralPath $novaOllama) {
    try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 }
    catch {
        $env:OLLAMA_HOST = '127.0.0.1:11434'
        $env:OLLAMA_NO_CLOUD = '1'
        $env:OLLAMA_MODELS = Join-Path $env:LOCALAPPDATA 'NOVA/models'
        Start-Process -FilePath $novaOllama -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'ollama.log') -RedirectStandardError (Join-Path $PSScriptRoot 'ollama-error.log')
    }
}
Write-Host 'NOVA: http://localhost:3000 — keep this window open. Ctrl+C stops the server.'
& $novaNode server.mjs
