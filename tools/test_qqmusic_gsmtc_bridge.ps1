# test_qqmusic_gsmtc_bridge.ps1 - QQ Music Windows GSMTC Bridge verification
[CmdletBinding()]
param(
    [ValidateSet("read", "pause", "play", "toggle", "next", "prev")]
    [string]$Action = "read"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await-AsyncOp($asyncOp, $type) {
    $method = $asTaskGeneric.MakeGenericMethod($type)
    $task = $method.Invoke($null, @($asyncOp))
    $task.Wait()
    return $task.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$managerOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$manager = Await-AsyncOp $managerOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$sessions = $manager.GetSessions()
$qqSession = $sessions | Where-Object { $_.SourceAppUserModelId -match 'QQMusic' } | Select-Object -First 1

if (-not $qqSession) {
    Write-Host "RESULT: QQ_MUSIC_NOT_FOUND"
    Write-Host "Active sessions count: $($sessions.Count)"
    foreach ($s in $sessions) {
        Write-Host " - $($s.SourceAppUserModelId)"
    }
    exit 0
}

Write-Host "=========================================="
Write-Host "QQ Music Session Found!"
Write-Host "SourceAppUserModelId : $($qqSession.SourceAppUserModelId)"
Write-Host "=========================================="

# 1. Read Media Info
$mediaOp = $qqSession.TryGetMediaPropertiesAsync()
$media = Await-AsyncOp $mediaOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
if ($media) {
    Write-Host "Title        : $($media.Title)"
    Write-Host "Artist       : $($media.Artist)"
    Write-Host "AlbumArtist  : $($media.AlbumArtist)"
    Write-Host "AlbumTitle   : $($media.AlbumTitle)"
    Write-Host "TrackNumber  : $($media.TrackNumber)"
    Write-Host "Genres       : $($media.Genres -join ', ')"
    Write-Host "HasThumbnail : $($media.Thumbnail -ne $null)"
}

# 2. Read Playback Info
$playback = $qqSession.GetPlaybackInfo()
if ($playback) {
    Write-Host "PlaybackStatus : $($playback.PlaybackStatus)"
    Write-Host "PlaybackType   : $($playback.PlaybackType)"
    $ctrl = $playback.Controls
    if ($ctrl) {
        Write-Host "Controls -> Play:$($ctrl.IsPlayEnabled), Pause:$($ctrl.IsPauseEnabled), PlayPauseToggle:$($ctrl.IsPlayPauseToggleEnabled), Next:$($ctrl.IsNextEnabled), Prev:$($ctrl.IsPreviousEnabled), Stop:$($ctrl.IsStopEnabled)"
    }
}

# 3. Read Timeline
$timeline = $qqSession.GetTimelineProperties()
if ($timeline) {
    Write-Host "Timeline -> Position: $([math]::Round($timeline.Position.TotalSeconds, 2))s, EndTime: $([math]::Round($timeline.EndTime.TotalSeconds, 2))s"
}

# 4. Perform Action if requested
Write-Host "------------------------------------------"
Write-Host "Requested Action: $Action"

switch ($Action) {
    "pause" {
        $op = $qqSession.TryPauseAsync()
        $success = Await-AsyncOp $op ([bool])
        Write-Host "TryPauseAsync result: $success"
    }
    "play" {
        $op = $qqSession.TryPlayAsync()
        $success = Await-AsyncOp $op ([bool])
        Write-Host "TryPlayAsync result: $success"
    }
    "toggle" {
        $op = $qqSession.TryTogglePlayPauseAsync()
        $success = Await-AsyncOp $op ([bool])
        Write-Host "TryTogglePlayPauseAsync result: $success"
    }
    "next" {
        $op = $qqSession.TrySkipNextAsync()
        $success = Await-AsyncOp $op ([bool])
        Write-Host "TrySkipNextAsync result: $success"
    }
    "prev" {
        $op = $qqSession.TrySkipPreviousAsync()
        $success = Await-AsyncOp $op ([bool])
        Write-Host "TrySkipPreviousAsync result: $success"
    }
    "read" {
        Write-Host "Read-only inspection completed."
    }
}
