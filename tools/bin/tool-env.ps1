$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$ToolsBin = Join-Path $ToolsRoot 'bin'
$ToolsNode = Join-Path $ToolsRoot 'runtime\node'
$ToolsGit = Join-Path $ToolsRoot 'runtime\git\cmd'
$ToolsRg = Join-Path $ToolsRoot 'runtime\rg'
$env:PATH = "$ToolsBin;$ToolsNode;$ToolsGit;$ToolsRg;$env:PATH"

if ($args -contains '--ensure') {
    $NodeExe = Join-Path $ToolsRoot 'runtime\node\node.exe'
    if (-not (Test-Path -LiteralPath $NodeExe)) {
        Write-Host '[tools] Node local nao encontrado. Executando bootstrap...'
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ToolsRoot 'bootstrap-tools.ps1')
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}
