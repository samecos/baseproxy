#Requires -RunAsAdministrator
<#
  BaseProxy 开机自启计划任务安装脚本
  以管理员身份运行此脚本即可注册任务
#>
$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName    = "BaseProxy-AutoStart"
$logPath     = Join-Path $projectPath "logs.txt"

# 校验入口文件
$entry = Join-Path $projectPath "dist\index.js"
if (-not (Test-Path $entry)) {
    Write-Error "未找到 $entry，请先执行：npm run build"
    exit 1
}

Write-Host "项目路径: $projectPath"
Write-Host "任务名称: $taskName"
Write-Host "日志文件: $logPath"
Write-Host ""

# 动作：隐藏窗口启动 node，标准输出/错误统一追加到 logs.txt
$psCommand = "Set-Location '$projectPath'; node dist/index.js *>> logs.txt"
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$psCommand`"" `
    -WorkingDirectory $projectPath

# 触发器：系统启动时（无需登录）
$trigger = New-ScheduledTaskTrigger -AtStartup

# 运行设置：后台、不休眠停止、隐藏、忽略重复实例
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -Hidden `
    -MultipleInstances IgnoreNew

# 以 SYSTEM 身份、最高权限运行，无窗口交互
$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

# 若已存在则先移除
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "检测到已存在的任务，正在卸载..."
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# 注册
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "✅ 计划任务 [$taskName] 注册成功！" -ForegroundColor Green
Write-Host "   • 触发时机 : 每次系统开机"
Write-Host "   • 运行账户 : SYSTEM"
Write-Host "   • 权限级别 : Highest（最高权限）"
Write-Host "   • 日志输出 : $logPath"
Write-Host ""
Write-Host "常用命令："
Write-Host "   立即运行  : Start-ScheduledTask -TaskName '$taskName'"
Write-Host "   停止任务  : Stop-ScheduledTask  -TaskName '$taskName'"
Write-Host "   查看状态  : Get-ScheduledTask   -TaskName '$taskName'"
Write-Host "   删除任务  : Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
