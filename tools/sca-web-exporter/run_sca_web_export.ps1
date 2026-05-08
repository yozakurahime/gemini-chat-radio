$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot ".")
$nodeExe = Join-Path $root "runtime\node\node.exe"
$worker = Join-Path $root "sca_web_export_worker.js"

if (-not (Test-Path $nodeExe)) {
  throw "Node runtime nao encontrado: $nodeExe"
}
if (-not (Test-Path $worker)) {
  throw "Worker nao encontrado: $worker"
}

Push-Location $root
try {
  & $nodeExe $worker
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
