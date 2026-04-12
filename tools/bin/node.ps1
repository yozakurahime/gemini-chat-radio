$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$LocalExe = Join-Path $ToolsRoot 'runtime\node\node.exe'

if (Test-Path -LiteralPath $LocalExe) {
    & $LocalExe @args
    exit $LASTEXITCODE
}

$SystemNode = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if ($SystemNode) {
    & $SystemNode @args
    exit $LASTEXITCODE
}

Write-Error '[tools] node.exe nao encontrado. Execute tools/bootstrap-tools.ps1'
exit 9009
