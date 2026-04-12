param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsRoot = $ScriptDir
$RuntimeDir = Join-Path $ToolsRoot 'runtime'
$CacheDir = Join-Path $ToolsRoot 'cache'

$NodeVersion = if ($env:HIME_TOOLS_NODE_VERSION) { $env:HIME_TOOLS_NODE_VERSION } else { '22.16.0' }
$GitVersion = if ($env:HIME_TOOLS_GIT_VERSION) { $env:HIME_TOOLS_GIT_VERSION } else { '2.49.0.windows.1' }
$RgVersion = if ($env:HIME_TOOLS_RG_VERSION) { $env:HIME_TOOLS_RG_VERSION } else { '14.1.1' }
$GitAssetVersion = $GitVersion -replace '\.windows\.\d+$', ''

$NodeUrl = if ($env:HIME_TOOLS_NODE_URL) { $env:HIME_TOOLS_NODE_URL } else { "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" }
$GitUrl = if ($env:HIME_TOOLS_GIT_URL) { $env:HIME_TOOLS_GIT_URL } else { "https://github.com/git-for-windows/git/releases/download/v$GitVersion/MinGit-$GitAssetVersion-64-bit.zip" }
$RgUrl = if ($env:HIME_TOOLS_RG_URL) { $env:HIME_TOOLS_RG_URL } else { "https://github.com/BurntSushi/ripgrep/releases/download/$RgVersion/ripgrep-$RgVersion-x86_64-pc-windows-msvc.zip" }

$NodeZip = Join-Path $CacheDir 'node.zip'
$GitZip = Join-Path $CacheDir 'git.zip'
$RgZip = Join-Path $CacheDir 'rg.zip'

$NodeTarget = Join-Path $RuntimeDir 'node'
$GitTarget = Join-Path $RuntimeDir 'git'
$RgTarget = Join-Path $RuntimeDir 'rg'

$ProgressPreference = 'SilentlyContinue'

function Ensure-Dir([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Download-IfNeeded([string]$Url, [string]$Destination, [switch]$ForceDownload) {
    if ((-not $ForceDownload) -and (Test-Path -LiteralPath $Destination)) {
        Write-Host "[tools] usando cache: $Destination"
        return
    }
    Write-Host "[tools] baixando: $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Destination
}

function Reset-Directory([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path | Out-Null
}

function Expand-ZipSingleRoot([string]$ZipPath, [string]$FinalDir) {
    $TempDir = Join-Path $RuntimeDir ('__tmp_' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $TempDir | Out-Null
    try {
        Expand-Archive -LiteralPath $ZipPath -DestinationPath $TempDir -Force
        $Entries = Get-ChildItem -LiteralPath $TempDir
        if ($Entries.Count -eq 1 -and $Entries[0].PSIsContainer) {
            $Source = $Entries[0].FullName
        } else {
            $Source = $TempDir
        }

        if (Test-Path -LiteralPath $FinalDir) {
            Remove-Item -LiteralPath $FinalDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $FinalDir | Out-Null

        Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
            Move-Item -LiteralPath $_.FullName -Destination $FinalDir -Force
        }
    }
    finally {
        if (Test-Path -LiteralPath $TempDir) {
            Remove-Item -LiteralPath $TempDir -Recurse -Force
        }
    }
}

function Should-SkipExtract([string]$TargetDir, [string[]]$ProbeFiles, [switch]$ForceExtract) {
    if ($ForceExtract) { return $false }
    if (-not (Test-Path -LiteralPath $TargetDir)) { return $false }
    foreach ($probe in $ProbeFiles) {
        if (Test-Path -LiteralPath (Join-Path $TargetDir $probe)) {
            return $true
        }
    }
    return $false
}

Ensure-Dir $RuntimeDir
Ensure-Dir $CacheDir

Download-IfNeeded -Url $NodeUrl -Destination $NodeZip -ForceDownload:$Force
Download-IfNeeded -Url $GitUrl -Destination $GitZip -ForceDownload:$Force
Download-IfNeeded -Url $RgUrl -Destination $RgZip -ForceDownload:$Force

if (Should-SkipExtract -TargetDir $NodeTarget -ProbeFiles @('node.exe') -ForceExtract:$Force) {
    Write-Host '[tools] Node ja instalado. Pulando extracao.'
}
else {
    Write-Host '[tools] extraindo Node...'
    Expand-ZipSingleRoot -ZipPath $NodeZip -FinalDir $NodeTarget
}

if (Should-SkipExtract -TargetDir $GitTarget -ProbeFiles @('cmd\\git.exe', 'bin\\git.exe') -ForceExtract:$Force) {
    Write-Host '[tools] Git ja instalado. Pulando extracao.'
}
else {
    Write-Host '[tools] extraindo Git...'
    Expand-ZipSingleRoot -ZipPath $GitZip -FinalDir $GitTarget
}

if (Should-SkipExtract -TargetDir $RgTarget -ProbeFiles @('rg.exe') -ForceExtract:$Force) {
    Write-Host '[tools] ripgrep ja instalado. Pulando extracao.'
}
else {
    Write-Host '[tools] extraindo ripgrep...'
    Expand-ZipSingleRoot -ZipPath $RgZip -FinalDir $RgTarget
}

$Manifest = [ordered]@{
    generated_at = (Get-Date).ToString('o')
    node = [ordered]@{ version = $NodeVersion; url = $NodeUrl }
    git = [ordered]@{ version = $GitVersion; url = $GitUrl }
    rg = [ordered]@{ version = $RgVersion; url = $RgUrl }
}

$Manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $RuntimeDir 'manifest.json') -Encoding UTF8

Write-Host '[tools] pronto.'
