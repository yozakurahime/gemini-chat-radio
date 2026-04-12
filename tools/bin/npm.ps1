$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$LocalNode = Join-Path $ToolsRoot 'runtime\node\node.exe'
$LocalNpmCli = Join-Path $ToolsRoot 'runtime\node\node_modules\npm\bin\npm-cli.js'

if ((Test-Path -LiteralPath $LocalNode) -and (Test-Path -LiteralPath $LocalNpmCli)) {
    $env:PATH = \"$(Split-Path -Parent $LocalNode);$env:PATH\"
    & $LocalNode $LocalNpmCli @args
    exit $LASTEXITCODE
}

$SystemNpm = (Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if ($SystemNpm) {
    & $SystemNpm @args
    exit $LASTEXITCODE
}

Write-Error '[tools] npm nao encontrado. Execute tools/bootstrap-tools.ps1'
exit 9009
