$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$LocalNode = Join-Path $ToolsRoot 'runtime\node\node.exe'
$LocalNpxCli = Join-Path $ToolsRoot 'runtime\node\node_modules\npm\bin\npx-cli.js'

if ((Test-Path -LiteralPath $LocalNode) -and (Test-Path -LiteralPath $LocalNpxCli)) {
    $env:PATH = \"$(Split-Path -Parent $LocalNode);$env:PATH\"
    & $LocalNode $LocalNpxCli @args
    exit $LASTEXITCODE
}

$SystemNpx = (Get-Command npx.cmd -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if ($SystemNpx) {
    & $SystemNpx @args
    exit $LASTEXITCODE
}

Write-Error '[tools] npx nao encontrado. Execute tools/bootstrap-tools.ps1'
exit 9009
