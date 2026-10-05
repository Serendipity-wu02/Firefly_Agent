param(
  [Parameter(Mandatory=$true)][ValidateSet('n3','n10')][string]$Matrix,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$Run,
  [string]$Mode='none',
  [string]$QaRoot='E:\Codex\2026-10-04\task-4\browser-native-gaps-qa',
  [string]$QaBuilt='E:\Codex\2026-10-04\task-4\audit-r3-r4\dist\main\main'
)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()
$taskRoot=[System.IO.Path]::GetFullPath('E:\Codex\2026-10-04\task-4')
foreach ($target in @($QaRoot,$QaBuilt)) {
  $resolved=[System.IO.Path]::GetFullPath($target)
  if (-not $resolved.StartsWith($taskRoot+'\',[System.StringComparison]::OrdinalIgnoreCase)) { throw 'QA target outside owned workspace' }
}
$qaProfile=Join-Path $QaRoot "profile-$Run"
$qaTmp=Join-Path $QaRoot "temp-$Run"
if (Test-Path -LiteralPath $qaProfile) { throw 'Fresh profile required; use a new Run identifier' }
New-Item -ItemType Directory -Path $qaProfile,$qaTmp -Force | Out-Null
$savedEnv=@{TEMP=$env:TEMP;TMP=$env:TMP;RUNNER_TEMP=$env:RUNNER_TEMP;ELECTRON_RUN_AS_NODE=$env:ELECTRON_RUN_AS_NODE}
try {
  $env:TEMP=$qaTmp; $env:TMP=$qaTmp; $env:RUNNER_TEMP=$qaTmp
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $script=Join-Path $PSScriptRoot "$Matrix.cjs"
  node --check $script
  if ($LASTEXITCODE -ne 0) { throw 'Native fixture syntax failed' }
  $qaExe='E:\Codex\2026-10-04\task-4\audit-r3-r4\node_modules\electron\dist\electron.exe'
  $qaProcess=Start-Process -FilePath $qaExe -ArgumentList @($script,"--qa-run=$Run","--qa-root=$QaRoot","--qa-built=$QaBuilt","--qa-mode=$Mode",'--firefly-profile=smoke',"--firefly-isolation-root=$qaProfile","--user-data-dir=$qaProfile\Firefly-smoke") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $QaRoot "stdout-$Run.log") -RedirectStandardError (Join-Path $QaRoot "stderr-$Run.log")
  if (-not $qaProcess.WaitForExit(55000)) {
    @{matrix=$Matrix;run=$Run;mode=$Mode;pid=$qaProcess.Id;exitCode=$null;launcherTimedOut=$true;profile=$qaProfile;temp=$qaTmp} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $QaRoot "launcher-$Run.json") -Encoding utf8
    throw "Owned PID $($qaProcess.Id) exceeded deadline; inspect before stopping"
  }
  $qaProcess.Refresh()
  $receipt=@{matrix=$Matrix;run=$Run;mode=$Mode;pid=$qaProcess.Id;exitCode=$qaProcess.ExitCode;profile=$qaProfile;temp=$qaTmp}
  $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $QaRoot "launcher-$Run.json") -Encoding utf8
  $evidence=Get-Content -LiteralPath (Join-Path $QaRoot "evidence-$Run.json") -Raw | ConvertFrom-Json
  $receipt | ConvertTo-Json
  if ($qaProcess.ExitCode -ne 0 -or $evidence.errors.Count -ne 0) { throw 'Native matrix failed; preserve exact evidence' }
  if ($Matrix -eq 'n10') {
    foreach ($kind in @('will-quit','quit','final-action','reentry-same-promise')) {
      if (@($evidence.events | Where-Object kind -eq $kind).Count -ne 1) { throw "Missing/duplicate native event: $kind" }
    }
    if (@($evidence.events | Where-Object kind -eq 'before-quit').Count -ne 3) { throw 'Native before-quit/reentry count mismatch' }
  }
  "Native cases: $($evidence.cases.Count); errors: $($evidence.errors.Count)"
} finally {
  foreach ($key in $savedEnv.Keys) { [System.Environment]::SetEnvironmentVariable($key,$savedEnv[$key],'Process') }
}
