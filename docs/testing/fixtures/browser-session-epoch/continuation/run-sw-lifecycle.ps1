param([ValidatePattern('^(red-worker|red-tls|green)-[a-zA-Z0-9-]+$')][string]$Run='green-sw-r1')
$ErrorActionPreference='Stop'
$epochProbeRoot='E:\Codex\2026-10-04\task-4\network-modules-native';$epochProbeExe='E:\Codex\2026-10-04\task-4\audit-r3-r4\node_modules\electron\dist\electron.exe'
$epochProbeTmp=Join-Path $epochProbeRoot "sw-lifecycle-temp-$Run";$epochProbeData=Join-Path $epochProbeRoot "sw-lifecycle-$Run"
if(Test-Path -LiteralPath (Join-Path $epochProbeRoot "sw-lifecycle-evidence-$Run.json")){throw 'Do not overwrite prior evidence'}
New-Item -ItemType Directory -Path $epochProbeTmp -Force|Out-Null
$epochOldTemp=$env:TEMP;$epochOldTmp=$env:TMP;$epochOldRunnerTemp=$env:RUNNER_TEMP
try{
 $env:TEMP=$epochProbeTmp;$env:TMP=$epochProbeTmp;$env:RUNNER_TEMP=$epochProbeTmp
 node --check (Join-Path $epochProbeRoot 'sw-lifecycle.cjs');if($LASTEXITCODE-ne 0){throw 'Syntax failed'}
 $epochProcess=Start-Process -FilePath $epochProbeExe -ArgumentList @((Join-Path $epochProbeRoot 'sw-lifecycle.cjs'),"--probe-run=$Run","--user-data-dir=$epochProbeData") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $epochProbeRoot "sw-lifecycle-stdout-$Run.log") -RedirectStandardError (Join-Path $epochProbeRoot "sw-lifecycle-stderr-$Run.log")
 if(-not $epochProcess.WaitForExit(55000)){throw "Owned PID $($epochProcess.Id) exceeded deadline; inspect before cleanup"};$epochProcess.Refresh()
 @{run=$Run;pid=$epochProcess.Id;exitCode=$epochProcess.ExitCode;temp=$epochProbeTmp;userData=$epochProbeData}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $epochProbeRoot "sw-lifecycle-launcher-$Run.json")
 Get-Content -LiteralPath (Join-Path $epochProbeRoot "sw-lifecycle-launcher-$Run.json")
 if($epochProcess.ExitCode-ne 0){throw 'Probe failed; inspect expected RED or unexpected result'}
 $swEvidence=Get-Content -LiteralPath (Join-Path $epochProbeRoot "sw-lifecycle-evidence-$Run.json") -Raw|ConvertFrom-Json
 if($swEvidence.errors.Count-ne 0 -or $swEvidence.lifecycle.willQuit-ne 1 -or $swEvidence.lifecycle.quit-ne 1 -or $swEvidence.lifecycle.cleanupRuns-ne 1 -or $swEvidence.lifecycle.beforeUnloadEvents-ne 0 -or $swEvidence.lifecycle.reentryBlocked-lt 1 -or -not ($swEvidence.lifecycle.phases -contains 'before-quit allowed after cleanup')){throw 'Native exit alone is insufficient: evidence or lifecycle assertion failed'}
 Write-Output 'Raw evidence and native quit lifecycle assertions passed'
}finally{$env:TEMP=$epochOldTemp;$env:TMP=$epochOldTmp;$env:RUNNER_TEMP=$epochOldRunnerTemp}
