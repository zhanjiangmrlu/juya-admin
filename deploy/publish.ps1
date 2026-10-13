[CmdletBinding()]
param(
    [ValidateSet('test', 'production')]
    [string]$Environment = 'test',
    [ValidateSet('publish', 'rollback', 'doctor', 'plan')]
    [string]$Action = 'publish',
    [string]$Config,
    [switch]$BuildOnly
)

$ErrorActionPreference = 'Stop'
# 转发后台项目、目标环境和操作，配置路径保持完整参数边界
$workspaceEntry = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'publish.ps1'
$releaseArguments = @{
    Project = 'juya-admin'
    Environment = $Environment
    Action = $Action
}
if ($PSBoundParameters.ContainsKey('Config')) {
    $releaseArguments.Config = $Config
}
if ($BuildOnly) {
    $releaseArguments.BuildOnly = $true
}
& $workspaceEntry @releaseArguments
exit $LASTEXITCODE
