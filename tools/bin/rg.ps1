$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$local = Join-Path $ToolsRoot 'runtime\rg\rg.exe'
if (Test-Path -LiteralPath $local) {
    & $local @args
    exit $LASTEXITCODE
}

$systemRg = (Get-Command rg.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if ($systemRg) {
    & $systemRg @args
    exit $LASTEXITCODE
}

Write-Error '[tools] rg.exe nao encontrado. Execute tools/bootstrap-tools.ps1'
exit 9009
