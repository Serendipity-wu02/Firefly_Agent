param([ValidatePattern('^[a-zA-Z0-9-]+$')][string]$Run='memory-r1')
$ErrorActionPreference='Stop'
$probeRoot='E:\Codex\2026-10-04\task-4\network-modules-native'
$probeExe='E:\Codex\2026-10-04\task-4\audit-r3-r4\node_modules\electron\dist\electron.exe'
$probeTmp=Join-Path $probeRoot "storage-temp-$Run"
$probeData=Join-Path $probeRoot "storage-$Run"
New-Item -ItemType Directory -Path $probeTmp -Force | Out-Null
$probeOldTemp=$env:TEMP;$probeOldTmp=$env:TMP;$probeOldRunnerTemp=$env:RUNNER_TEMP
try {
  $env:TEMP=$probeTmp;$env:TMP=$probeTmp;$env:RUNNER_TEMP=$probeTmp
  node --check (Join-Path $probeRoot 'storage.cjs')
  if($LASTEXITCODE -ne 0){throw 'Probe syntax failed'}
  $probeProcess=Start-Process -FilePath $probeExe -ArgumentList @((Join-Path $probeRoot 'storage.cjs'),"--probe-run=$Run","--user-data-dir=$probeData") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $probeRoot "storage-stdout-$Run.log") -RedirectStandardError (Join-Path $probeRoot "storage-stderr-$Run.log")
  if(-not $probeProcess.WaitForExit(55000)){throw "Owned PID $($probeProcess.Id) exceeded deadline; inspect before cleanup"}
  $probeProcess.Refresh()
  @{run=$Run;pid=$probeProcess.Id;exitCode=$probeProcess.ExitCode;temp=$probeTmp;userData=$probeData}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $probeRoot "storage-launcher-$Run.json")
  Get-Content -LiteralPath (Join-Path $probeRoot "storage-launcher-$Run.json")
  if($probeProcess.ExitCode -ne 0){throw 'Native probe failed; inspect evidence'}
}finally{$env:TEMP=$probeOldTemp;$env:TMP=$probeOldTmp;$env:RUNNER_TEMP=$probeOldRunnerTemp}
