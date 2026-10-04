param([ValidatePattern('^(red-worker|red-tls|green)-[a-zA-Z0-9-]+$')][string]$Run='red-worker-r1')
$ErrorActionPreference='Stop'
$epochProbeRoot='E:\Codex\2026-10-04\task-4\network-modules-native';$epochProbeExe='E:\Codex\2026-10-04\task-4\audit-r3-r4\node_modules\electron\dist\electron.exe'
$epochProbeTmp=Join-Path $epochProbeRoot "epoch-temp-$Run";$epochProbeData=Join-Path $epochProbeRoot "epoch-$Run"
if(Test-Path -LiteralPath (Join-Path $epochProbeRoot "epoch-evidence-$Run.json")){throw 'Do not overwrite prior evidence'}
New-Item -ItemType Directory -Path $epochProbeTmp -Force|Out-Null
$epochOldTemp=$env:TEMP;$epochOldTmp=$env:TMP;$epochOldRunnerTemp=$env:RUNNER_TEMP
try{
 $env:TEMP=$epochProbeTmp;$env:TMP=$epochProbeTmp;$env:RUNNER_TEMP=$epochProbeTmp
 node --check (Join-Path $epochProbeRoot 'session-epoch.cjs');if($LASTEXITCODE-ne 0){throw 'Syntax failed'}
 $epochProcess=Start-Process -FilePath $epochProbeExe -ArgumentList @((Join-Path $epochProbeRoot 'session-epoch.cjs'),"--probe-run=$Run","--user-data-dir=$epochProbeData") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $epochProbeRoot "epoch-stdout-$Run.log") -RedirectStandardError (Join-Path $epochProbeRoot "epoch-stderr-$Run.log")
 if(-not $epochProcess.WaitForExit(55000)){throw "Owned PID $($epochProcess.Id) exceeded deadline; inspect before cleanup"};$epochProcess.Refresh()
 @{run=$Run;pid=$epochProcess.Id;exitCode=$epochProcess.ExitCode;temp=$epochProbeTmp;userData=$epochProbeData}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $epochProbeRoot "epoch-launcher-$Run.json")
 Get-Content -LiteralPath (Join-Path $epochProbeRoot "epoch-launcher-$Run.json")
 if($epochProcess.ExitCode-ne 0){throw 'Probe failed; inspect expected RED or unexpected result'}
}finally{$env:TEMP=$epochOldTemp;$env:TMP=$epochOldTmp;$env:RUNNER_TEMP=$epochOldRunnerTemp}
