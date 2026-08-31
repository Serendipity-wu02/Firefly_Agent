# inspect_gsmtc.ps1 - Windows Global System Media Transport Controls Session Inspector
[CmdletBinding()]
param()

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
Write-Host "=========================================="
Write-Host "GSMTC Session Manager Ready"
Write-Host "Total active media sessions count: $($sessions.Count)"
Write-Host "=========================================="

$current = $manager.GetCurrentSession()
if ($current) {
    Write-Host "[Current Active Session App ID]: $($current.SourceAppUserModelId)"
} else {
    Write-Host "[Current Active Session]: None"
}
Write-Host ""

$index = 0
foreach ($session in $sessions) {
    $index++
    Write-Host "=== Session #$index ==="
    Write-Host "SourceAppUserModelId : $($session.SourceAppUserModelId)"
    
    # 1. Media Properties (Title, Artist, Album, etc.)
    try {
        $mediaOp = $session.TryGetMediaPropertiesAsync()
        $media = Await-AsyncOp $mediaOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        if ($media) {
            Write-Host "Title                : $($media.Title)"
            Write-Host "Artist               : $($media.Artist)"
            Write-Host "AlbumArtist          : $($media.AlbumArtist)"
            Write-Host "AlbumTitle           : $($media.AlbumTitle)"
            Write-Host "TrackNumber          : $($media.TrackNumber)"
            Write-Host "Genres               : $($media.Genres -join ', ')"
            Write-Host "Thumbnail            : $($media.Thumbnail -ne $null)"
        }
    } catch {
        Write-Host "MediaProperties Error: $($_.Exception.Message)"
    }
    
    # 2. Playback Info & Controls
    try {
        $playback = $session.GetPlaybackInfo()
        if ($playback) {
            Write-Host "PlaybackStatus       : $($playback.PlaybackStatus)"
            Write-Host "PlaybackType         : $($playback.PlaybackType)"
            Write-Host "AutoRepeatMode       : $($playback.AutoRepeatMode)"
            Write-Host "IsShuffleActive      : $($playback.IsShuffleActive)"
            
            $ctrl = $playback.Controls
            if ($ctrl) {
                Write-Host "Controls.IsPlayEnabled       : $($ctrl.IsPlayEnabled)"
                Write-Host "Controls.IsPauseEnabled      : $($ctrl.IsPauseEnabled)"
                Write-Host "Controls.IsPlayPauseToggle   : $($ctrl.IsPlayPauseToggleEnabled)"
                Write-Host "Controls.IsNextEnabled       : $($ctrl.IsNextEnabled)"
                Write-Host "Controls.IsPreviousEnabled   : $($ctrl.IsPreviousEnabled)"
                Write-Host "Controls.IsStopEnabled       : $($ctrl.IsStopEnabled)"
            }
        }
    } catch {
        Write-Host "PlaybackInfo Error   : $($_.Exception.Message)"
    }
    
    # 3. Timeline Properties
    try {
        $timeline = $session.GetTimelineProperties()
        if ($timeline) {
            Write-Host "Timeline.Position    : $($timeline.Position.TotalSeconds)s"
            Write-Host "Timeline.StartTime   : $($timeline.StartTime.TotalSeconds)s"
            Write-Host "Timeline.EndTime     : $($timeline.EndTime.TotalSeconds)s"
            Write-Host "Timeline.MinSeekTime : $($timeline.MinSeekTime.TotalSeconds)s"
            Write-Host "Timeline.MaxSeekTime : $($timeline.MaxSeekTime.TotalSeconds)s"
        }
    } catch {
        Write-Host "Timeline Error       : $($_.Exception.Message)"
    }
    Write-Host ""
}
