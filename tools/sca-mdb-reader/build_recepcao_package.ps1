param(
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $OutputDir) {
  $OutputDir = Join-Path $projectRoot "dist-recepcao"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stage = Join-Path $OutputDir "sca-mdb-reader-$stamp"
$zipPath = Join-Path $OutputDir "sca-mdb-reader-$stamp.zip"
$targetRoot = Join-Path $stage "SCA-MDB-Reader"

if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null

function Copy-FromReader([string]$RelPath) {
  $src = Join-Path $PSScriptRoot $RelPath
  if (-not (Test-Path $src)) {
    throw "Arquivo/pasta obrigatorio nao encontrado: $src"
  }
  $dst = Join-Path $targetRoot $RelPath
  $dstParent = Split-Path -Parent $dst
  if (-not (Test-Path $dstParent)) {
    New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
  }
  Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
}

Copy-FromReader "sca_mdb_sync_worker.js"
Copy-FromReader "package.json"
Copy-FromReader "run_sca_mdb_sync.ps1"
Copy-FromReader "run_now.bat"
Copy-FromReader "install_task_scheduler.bat"
Copy-FromReader "instalar_recepcao.bat"
Copy-FromReader ".env.recepcao.example"
Copy-FromReader "config\sca_db_profile.json"

$runtimeNode = Join-Path $projectRoot "tools\runtime\node"
if (-not (Test-Path $runtimeNode)) {
  throw "Runtime Node nao encontrado em $runtimeNode"
}
Copy-Item -LiteralPath $runtimeNode -Destination (Join-Path $targetRoot "runtime\node") -Recurse -Force

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force

$publishTargets = @(
  (Join-Path $projectRoot "updates\reception"),
  (Join-Path $projectRoot "runtime\updates\reception")
)

foreach ($target in $publishTargets) {
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  $zipName = Split-Path -Leaf $zipPath
  Copy-Item -LiteralPath $zipPath -Destination (Join-Path $target $zipName) -Force
  Copy-Item -LiteralPath $zipPath -Destination (Join-Path $target "sca-mdb-reader-latest.zip") -Force
  $meta = [ordered]@{
    generated_at = (Get-Date).ToString("o")
    package_file = $zipName
    latest_file = "sca-mdb-reader-latest.zip"
  }
  $meta | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $target "latest-mdb-reader.json") -Encoding UTF8
}

Write-Host "[OK] Pacote criado:"
Write-Host $zipPath
