param([string[]]$TestFiles = @())

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$vitest = Join-Path $projectRoot 'node_modules\vitest\vitest.mjs'
$node = (Get-Command node -ErrorAction Stop).Source
$outputRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$outputPrefix = "firefly-vitest-$PID-$([guid]::NewGuid().ToString('N'))"
$stdoutPath = Join-Path $outputRoot "$outputPrefix.stdout.log"
$stderrPath = Join-Path $outputRoot "$outputPrefix.stderr.log"
$arguments = @($vitest, 'run', '--reporter=verbose', '--logHeapUsage') + $TestFiles
$runner = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
$children = @{}
$lastReport = [datetime]::MinValue

while (-not $runner.HasExited) {
  try {
    $activeChildren = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($runner.Id)")
    foreach ($child in $activeChildren) {
      $childId = [int]$child.ProcessId
      if (-not $children.ContainsKey($childId)) {
        $childProcess = [System.Diagnostics.Process]::GetProcessById($childId)
        $null = $childProcess.Handle
        $children[$childId] = [pscustomobject]@{
          Process = $childProcess
          PeakWorkingSetMiB = 0
        }
        Write-Output "[vitest-diagnostic] child-start pid=$childId"
      }
      $entry = $children[$childId]
      $entry.Process.Refresh()
      if (-not $entry.Process.HasExited) {
        $entry.PeakWorkingSetMiB = [math]::Max($entry.PeakWorkingSetMiB, [math]::Round($entry.Process.WorkingSet64 / 1MB, 1))
      }
    }
    if (((Get-Date) - $lastReport).TotalSeconds -ge 30) {
      $system = Get-CimInstance Win32_OperatingSystem
      $freeMiB = [math]::Round($system.FreePhysicalMemory / 1024)
      $runner.Refresh()
      $runnerMiB = if ($runner.HasExited) { 0 } else { [math]::Round($runner.WorkingSet64 / 1MB) }
      Write-Output "[vitest-diagnostic] parent-rss-mib=$runnerMiB free-physical-mib=$freeMiB observed-children=$($children.Count)"
      $lastReport = Get-Date
    }
  } catch {
    Write-Output "[vitest-diagnostic] monitor-error=$($_.Exception.GetType().Name)"
  }
  Start-Sleep -Seconds 1
}

$runner.WaitForExit()
foreach ($childId in @($children.Keys | Sort-Object)) {
  $entry = $children[$childId]
  $entry.Process.Refresh()
  $exitCode = if ($entry.Process.HasExited) {
    $entry.Process.WaitForExit()
    $entry.Process.ExitCode
  } else { 'still-running' }
  Write-Output "[vitest-diagnostic] child-exit pid=$childId code=$exitCode peak-rss-mib=$($entry.PeakWorkingSetMiB)"
  $entry.Process.Dispose()
}
Write-Output "[vitest-diagnostic] test-exit code=$($runner.ExitCode)"
Get-Content -LiteralPath $stdoutPath
Get-Content -LiteralPath $stderrPath
exit $runner.ExitCode
