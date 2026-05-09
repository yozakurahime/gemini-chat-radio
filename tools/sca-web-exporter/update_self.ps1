$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot ".")
$envFile = Join-Path $root ".env"
$logFile = Join-Path $root "logs\sca-web-updater.log"
$stateFile = Join-Path $root "runtime\updater-state.json"

function Ensure-Dir([string]$filePath) {
  $dir = Split-Path -Parent $filePath
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

function Write-Log([string]$message) {
  Ensure-Dir $logFile
  $line = "[{0}] {1}" -f ([DateTime]::UtcNow.ToString("o")), $message
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Load-EnvFile([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  Get-Content -LiteralPath $path | ForEach-Object {
    $line = [string]$_
    if (-not $line) { return }
    $trim = $line.Trim()
    if (-not $trim -or $trim.StartsWith("#")) { return }
    $idx = $trim.IndexOf("=")
    if ($idx -le 0) { return }
    $key = $trim.Substring(0, $idx).Trim()
    $value = $trim.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }
  return $map
}

function Get-EnvValue($map, [string]$name, [string]$fallback = "") {
  if ($map.ContainsKey($name) -and [string]$map[$name] -ne "") { return [string]$map[$name] }
  $procValue = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($procValue) -eq $false) { return [string]$procValue }
  return $fallback
}

function Load-State() {
  if (-not (Test-Path $stateFile)) {
    return @{
      last_check_at = 0
      installed_version_token = ""
      package_file = ""
      installed_at = 0
    }
  }
  try {
    return (Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json -AsHashtable)
  } catch {
    return @{
      last_check_at = 0
      installed_version_token = ""
      package_file = ""
      installed_at = 0
    }
  }
}

function Save-State($state) {
  Ensure-Dir $stateFile
  $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $stateFile -Encoding UTF8
}

function Should-SkipPath([string]$relativePath) {
  $rel = $relativePath.Replace('/', '\')
  if ($rel -ieq ".env") { return $true }
  if ($rel -like "runtime\browser-profile\*") { return $true }
  if ($rel -like "runtime\downloads\*") { return $true }
  if ($rel -like "runtime\exports\*") { return $true }
  if ($rel -ieq "runtime\updater-state.json") { return $true }
  if ($rel -ieq "logs\sca-web-export.log") { return $true }
  if ($rel -ieq "logs\sca-web-updater.log") { return $true }
  return $false
}

$envMap = Load-EnvFile $envFile
$enabled = (Get-EnvValue $envMap "SCA_WEB_AUTO_UPDATE" "1")
if ($enabled -eq "0") {
  Write-Log "Auto-update desativado (SCA_WEB_AUTO_UPDATE=0)."
  exit 0
}

$checkMinutes = [Math]::Max(1, [int](Get-EnvValue $envMap "SCA_WEB_UPDATE_CHECK_MINUTES" "30"))
$metaUrl = Get-EnvValue $envMap "SCA_WEB_UPDATE_META_URL" "https://www.academiaoxigenio.com/programarecepcaoweb/meta"
$defaultDownloadUrl = Get-EnvValue $envMap "SCA_WEB_UPDATE_DOWNLOAD_URL" "https://www.academiaoxigenio.com/programarecepcaoweb"
$timeoutSec = [Math]::Max(10, [int](Get-EnvValue $envMap "SCA_WEB_UPDATE_TIMEOUT_SEC" "40"))

$state = Load-State
$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$lastCheck = [int64]($state.last_check_at)
if (($nowMs - $lastCheck) -lt ($checkMinutes * 60 * 1000)) {
  exit 0
}

try {
  $meta = Invoke-RestMethod -Method Get -Uri $metaUrl -TimeoutSec $timeoutSec
  if (-not $meta -or -not $meta.version_token) {
    throw "Resposta de meta sem version_token."
  }
  $remoteVersion = [string]$meta.version_token
  $state.last_check_at = $nowMs
  Save-State $state

  if ([string]$state.installed_version_token -eq $remoteVersion) {
    Write-Log "Sem atualizacao. Versao atual: $remoteVersion"
    exit 0
  }

  $downloadUrl = if ($meta.download_url) { [string]$meta.download_url } else { $defaultDownloadUrl }
  $tmpDir = Join-Path $root "runtime\update-temp"
  $tmpZip = Join-Path $tmpDir "sca-web-exporter-update.zip"
  $stageDir = Join-Path $tmpDir "stage"
  if (Test-Path $tmpDir) { Remove-Item -LiteralPath $tmpDir -Recurse -Force }
  New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

  Write-Log "Baixando atualizacao: $downloadUrl"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpZip -TimeoutSec $timeoutSec

  Expand-Archive -LiteralPath $tmpZip -DestinationPath $stageDir -Force
  $sourceRoot = Join-Path $stageDir "SCA-Web-Exporter"
  if (-not (Test-Path $sourceRoot)) {
    $sourceRoot = $stageDir
  }

  $files = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File
  foreach ($file in $files) {
    $rel = $file.FullName.Substring($sourceRoot.Length).TrimStart('\','/')
    if (Should-SkipPath $rel) { continue }
    $target = Join-Path $root $rel
    Ensure-Dir $target
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
  }

  $state.installed_version_token = $remoteVersion
  $state.package_file = [string]$meta.package_file
  $state.installed_at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $state.last_check_at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  Save-State $state
  Write-Log "Atualizacao aplicada: $remoteVersion"
} catch {
  Write-Log ("Falha no auto-update: " + $_.Exception.Message)
}

exit 0
