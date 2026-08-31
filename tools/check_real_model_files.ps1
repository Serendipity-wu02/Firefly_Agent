# check_real_model_files.ps1
[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'

$searchTargets = @(
    (Join-Path (Get-Location) "assets\firefly"),
    (Join-Path (Get-Location) "models"),
    "E:\Google-Antigravity\working",
    "C:\Users\w1558\Downloads",
    "D:\"
)

Write-Host "=========================================="
Write-Host "Searching for Firefly GPT-SoVITS Model Files & Environment:"
Write-Host "=========================================="

$found = @()

foreach ($target in $searchTargets) {
    if (Test-Path $target) {
        Write-Host "Scanning: $target ..."
        $items = Get-ChildItem -Path $target -Recurse -Depth 4 -Include "*firefly*.ckpt", "*firefly*.pth", "*firefly*.tar*", "*firefly*.zip", "api_v2.py", "webui.py" -ErrorAction SilentlyContinue
        foreach ($it in $items) {
            $found += [PSCustomObject]@{
                Name = $it.Name
                FullName = $it.FullName
                LengthMB = [math]::Round($it.Length / 1MB, 2)
                LastWriteTime = $it.LastWriteTime
            }
        }
    }
}

Write-Host ""
Write-Host "=========================================="
if ($found.Count -eq 0) {
    Write-Host "RESULT: NO_MODEL_FILES_FOUND"
    Write-Host "Total real model files found: 0"
} else {
    Write-Host "RESULT: FOUND $($found.Count) FILE(S):"
    $found | Format-Table -AutoSize
}
Write-Host "=========================================="
