$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$node = Join-Path $root "tools\bin\node.cmd"
$worker = Join-Path $root "apps\server\scripts\sca_db_sync_worker.js"

if (-not (Test-Path $node)) {
  throw "Node wrapper nao encontrado em $node. Execute o bootstrap de tools."
}
if (-not (Test-Path $worker)) {
  throw "Worker SCA DB nao encontrado em $worker."
}

& $node $worker
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  throw "SCA DB sync finalizou com erro (exit code $exitCode)."
}
