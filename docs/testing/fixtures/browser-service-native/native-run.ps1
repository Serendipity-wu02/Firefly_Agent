param([ValidatePattern('^r[0-9]+$')][string]$Run='r1')
$ErrorActionPreference='Stop'
$qaRoot='E:\Codex\2026-10-04\task-4\browser-service-native-qa'
$qaProfile=Join-Path $qaRoot "profile-$Run"
$qaTmp=Join-Path $qaRoot "temp-$Run"
New-Item -ItemType Directory -Path $qaProfile,$qaTmp -Force | Out-Null
$env:TEMP=$qaTmp; $env:TMP=$qaTmp; $env:RUNNER_TEMP=$qaTmp
node --check (Join-Path $qaRoot 'probe.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Native QA syntax failed' }
$qaExe='E:\Codex\2026-10-04\task-4\audit-r3-r4\node_modules\electron\dist\electron.exe'
$qaProcess=Start-Process -FilePath $qaExe -ArgumentList @((Join-Path $qaRoot 'probe.cjs'),"--qa-run=$Run",'--firefly-profile=smoke',"--firefly-isolation-root=$qaProfile","--user-data-dir=$qaProfile\Firefly-smoke") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $qaRoot "stdout-$Run.log") -RedirectStandardError (Join-Path $qaRoot "stderr-$Run.log")
if (-not $qaProcess.WaitForExit(55000)) { throw "Owned native QA PID $($qaProcess.Id) exceeded deadline; inspect before cleanup" }
$qaProcess.Refresh()
@{run=$Run;pid=$qaProcess.Id;exitCode=$qaProcess.ExitCode;profile=$qaProfile;temp=$qaTmp}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qaRoot "launcher-$Run.json")
Get-Content -LiteralPath (Join-Path $qaRoot "launcher-$Run.json")
if ($qaProcess.ExitCode -ne 0) { throw 'Native QA failed; inspect exact evidence' }
