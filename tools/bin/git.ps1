$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$candidates = @(
    (Join-Path $ToolsRoot 'runtime\git\cmd\git.exe'),
    (Join-Path $ToolsRoot 'runtime\git\bin\git.exe')
)

$local = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($local) {
    & $local @args
    exit $LASTEXITCODE
}

$systemGit = (Get-Command git.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if ($systemGit) {
    & $systemGit @args
    exit $LASTEXITCODE
}

Write-Error '[tools] git.exe nao encontrado. Execute tools/bootstrap-tools.ps1'
exit 9009
