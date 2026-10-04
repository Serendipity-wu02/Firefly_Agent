param([ValidatePattern('^fault-cleanup-[a-zA-Z0-9-]+$')][string]$Run='fault-cleanup-r1')
$ErrorActionPreference='Stop'
$faultProbeRoot='E:\Codex\2026-10-04\task-4\network-modules-native'
$faultProbeExe='E:\Codex\2026-10-04\task-4\audit-r3-r4\node_modules\electron\dist\electron.exe'
$faultProbeTmp=Join-Path $faultProbeRoot "cleanup-fault-temp-$Run"
$faultProbeData=Join-Path $faultProbeRoot "cleanup-fault-$Run"
if(Test-Path -LiteralPath (Join-Path $faultProbeRoot "cleanup-fault-evidence-$Run.json")){throw 'Do not overwrite prior evidence'}
New-Item -ItemType Directory -Path $faultProbeTmp -Force|Out-Null
$faultOldTemp=$env:TEMP;$faultOldTmp=$env:TMP;$faultOldRunnerTemp=$env:RUNNER_TEMP
try{
 $env:TEMP=$faultProbeTmp;$env:TMP=$faultProbeTmp;$env:RUNNER_TEMP=$faultProbeTmp
 node --check (Join-Path $faultProbeRoot 'cleanup-fault.cjs');if($LASTEXITCODE-ne 0){throw 'Syntax failed'}
 $faultProcess=Start-Process -FilePath $faultProbeExe -ArgumentList @((Join-Path $faultProbeRoot 'cleanup-fault.cjs'),"--probe-run=$Run","--user-data-dir=$faultProbeData") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $faultProbeRoot "cleanup-fault-stdout-$Run.log") -RedirectStandardError (Join-Path $faultProbeRoot "cleanup-fault-stderr-$Run.log")
 if(-not $faultProcess.WaitForExit(55000)){throw "Owned PID $($faultProcess.Id) exceeded deadline; inspect before cleanup"};$faultProcess.Refresh()
 @{run=$Run;pid=$faultProcess.Id;exitCode=$faultProcess.ExitCode;temp=$faultProbeTmp;userData=$faultProbeData;expectedNativeExitCode=1}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $faultProbeRoot "cleanup-fault-launcher-$Run.json")
 $faultEvidence=Get-Content -LiteralPath (Join-Path $faultProbeRoot "cleanup-fault-evidence-$Run.json") -Raw|ConvertFrom-Json
 if($faultProcess.ExitCode-ne 1 -or $faultEvidence.pid-ne $faultProcess.Id -or $faultEvidence.run-ne $Run -or $faultEvidence.faultChecks.allAssertionsPassed-ne $true -or $faultEvidence.faultChecks.injectionCount-ne 1 -or $faultEvidence.cleanupResult.ok-ne $false -or $faultEvidence.cleanupResult.code-ne 'cleanup_failed' -or $faultEvidence.lifecycle.willQuit-ne 0 -or $faultEvidence.lifecycle.cleanupRuns-ne 1 -or $faultEvidence.lifecycle.reentryBlocked-ne 1 -or $faultEvidence.lifecycle.beforeUnloadEvents-ne 0 -or ($faultEvidence.lifecycle.phases -contains 'before-quit allowed after cleanup') -or $faultEvidence.diagnostics.resolves.Count-ne 0 -or $faultEvidence.diagnostics.pins.Count-ne 0 -or $faultEvidence.diagnostics.http.Count-ne 0 -or $faultEvidence.diagnostics.challenges.Count-ne 0 -or $faultEvidence.diagnostics.certificates.Count-ne 0 -or -not ([string]::Join("`n",$faultEvidence.errors).Contains('FF_FIXTURE_FIRST_DOMAIN_CLEAR_STORAGE_FAILED'))){throw 'Expected exit1 alone is insufficient: cleanup fault evidence assertion failed'}
 $faultA=@($faultEvidence.lifecycle.operations|Where-Object {$_.domain-eq 'A' -and $_.name-eq 'clearStorageData'})
 $faultB=@($faultEvidence.faultChecks.bOperations)
 if($faultA.Count-ne 1 -or $faultA[0].ok-ne $false -or $faultB.Count-ne 5 -or @($faultB|Where-Object {$_.ok-ne $true}).Count-ne 0){throw 'Native clear call results incomplete'}
 if($faultEvidence.faultChecks.injectionKind-ne 'awaited Promise.reject' -or $faultEvidence.faultChecks.unexpectedCleanupErrors.Count-ne 0 -or $faultEvidence.faultChecks.nativeOperations.Count-ne 10 -or $faultEvidence.faultChecks.proxyOperations.Count-ne 2 -or @($faultEvidence.faultChecks.proxyOperations|Where-Object {$_.ok-ne $true}).Count-ne 0){throw 'Unexpected cleanup or proxy result'}
 foreach($faultOp in $faultEvidence.faultChecks.nativeOperations){$faultExpectedOk=-not ($faultOp.domain-eq 'A' -and $faultOp.name-eq 'clearStorageData');if($faultOp.ok-ne $faultExpectedOk){throw 'Additional native cleanup failure'}}
 foreach($faultError in $faultEvidence.errors){if($faultError-eq 'cleanup A/clearStorageData: Error: FF_FIXTURE_FIRST_DOMAIN_CLEAR_STORAGE_FAILED' -or $faultError-eq 'observe cleanup A: Error: timeout: all A workers actually stopped after storage cleanup' -or $faultError-eq 'remaining state A' -or $faultError-eq 'native quit lifecycle mismatch' -or $faultError.StartsWith("Error: cleanup errors; normal quit GREEN forbidden`n")){continue};throw 'Unexpected error cannot be accepted as fault-negative pass'}
 Get-Content -LiteralPath (Join-Path $faultProbeRoot "cleanup-fault-launcher-$Run.json")
 Write-Output 'Cleanup failure negative assertions passed; native exit1 and cleanup_failed retained; normal quit not passed'
}finally{$env:TEMP=$faultOldTemp;$env:TMP=$faultOldTmp;$env:RUNNER_TEMP=$faultOldRunnerTemp}
