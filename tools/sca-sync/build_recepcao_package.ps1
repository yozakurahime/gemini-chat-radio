param(
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $OutputDir) {
  $OutputDir = Join-Path $root "dist-recepcao"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stage = Join-Path $OutputDir "sca-sync-recepcao-$stamp"
$zipPath = Join-Path $OutputDir "sca-sync-recepcao-$stamp.zip"

if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null

function Copy-RelPath([string]$RelPath) {
  $src = Join-Path $root $RelPath
  if (-not (Test-Path $src)) {
    throw "Arquivo/pasta obrigatorio nao encontrado: $RelPath"
  }
  $dst = Join-Path $stage $RelPath
  $dstParent = Split-Path -Parent $dst
  if (-not (Test-Path $dstParent)) {
    New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
  }
  Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
}

Copy-RelPath "tools\bin\node.cmd"
Copy-RelPath "tools\bin\tool-env.cmd"
Copy-RelPath "tools\runtime\node"
Copy-RelPath "apps\server\package.json"
Copy-RelPath "apps\server\scripts\sca_db_sync_worker.js"
Copy-RelPath "apps\server\node_modules\dotenv"
Copy-RelPath "apps\server\node_modules\better-sqlite3"
Copy-RelPath "apps\server\node_modules\bindings"
Copy-RelPath "apps\server\node_modules\file-uri-to-path"
Copy-RelPath "tools\sca-sync\run_sca_db_sync.ps1"
Copy-RelPath "tools\sca-sync\run_sca_db_sync.bat"
Copy-RelPath "tools\sca-sync\install_task_scheduler.bat"
Copy-RelPath "tools\sca-sync\instalar_recepcao.bat"
Copy-RelPath ".env.recepcao.example"

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force

$publishTargets = @(
  (Join-Path $root "updates\reception"),
  (Join-Path $root "runtime\updates\reception")
)

foreach ($target in $publishTargets) {
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  $zipName = Split-Path -Leaf $zipPath
  Copy-Item -LiteralPath $zipPath -Destination (Join-Path $target $zipName) -Force
  Copy-Item -LiteralPath $zipPath -Destination (Join-Path $target "sca-sync-recepcao-latest.zip") -Force
  $meta = [ordered]@{
    generated_at = (Get-Date).ToString("o")
    package_file = $zipName
    latest_file = "sca-sync-recepcao-latest.zip"
  }
  $meta | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $target "latest.json") -Encoding UTF8
}

Write-Host "[OK] Pacote recepcao criado:"
Write-Host $zipPath
