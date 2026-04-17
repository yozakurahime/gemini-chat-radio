param(
  [Parameter(Mandatory = $true)] [string]$Host,
  [Parameter(Mandatory = $true)] [string]$User,
  [int]$Port = 22,
  [string]$Branch = "main",
  [string]$AppDir = "/opt/himefit",
  [switch]$SkipTests,
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"

Write-Host "[deploy] Branch: $Branch"
Write-Host "[deploy] Target: $User@$Host`:$Port"

if (-not $SkipTests) {
  Write-Host "[deploy] Running local tests/build..."
  & tools\bin\npm.cmd run panel_v2:test
  if ($LASTEXITCODE -ne 0) { throw "panel_v2:test failed" }
  & tools\bin\npm.cmd run server:test
  if ($LASTEXITCODE -ne 0) { throw "server:test failed" }
  & tools\bin\npm.cmd run panel_v2:build
  if ($LASTEXITCODE -ne 0) { throw "panel_v2:build failed" }
  & tools\bin\npm.cmd run landing:build
  if ($LASTEXITCODE -ne 0) { throw "landing:build failed" }
}

if (-not $SkipPush) {
  Write-Host "[deploy] Pushing branch to origin..."
  & tools\bin\git.cmd push origin $Branch
  if ($LASTEXITCODE -ne 0) { throw "git push failed" }
}

$remote = @"
set -euo pipefail
cd $AppDir
export BRANCH=$Branch
bash tools/deploy/update-server.sh
"@

Write-Host "[deploy] Executing remote update..."
ssh -p $Port "$User@$Host" $remote
if ($LASTEXITCODE -ne 0) { throw "Remote deploy failed" }

Write-Host "[deploy] Done."
