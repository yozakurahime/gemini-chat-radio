$ErrorActionPreference = "Stop"

$root = Resolve-Path $PSScriptRoot
$worker = Join-Path $root "sca_mdb_sync_worker.js"
$envFile = Join-Path $root ".env"
$bundledNode = Join-Path $root "runtime\node\node.exe"

if (-not (Test-Path $worker)) {
  throw "Worker nao encontrado em $worker."
}

if (-not (Test-Path $envFile)) {
  throw "Arquivo .env nao encontrado em $envFile."
}

$nodeCmd = $null
if (Test-Path $bundledNode) {
  $nodeCmd = $bundledNode
} else {
  $nodeInPath = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeInPath) {
    $nodeCmd = $nodeInPath.Source
  }
}

if (-not $nodeCmd) {
  throw "Node.js nao encontrado. Instale Node no sistema ou inclua runtime\\node\\node.exe."
}

Push-Location $root
try {
  & $nodeCmd $worker
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "SCA MDB sync finalizou com erro (exit code $exitCode)."
  }
} finally {
  Pop-Location
}
