# qqmusic_gsmtc.ps1 - Windows GSMTC Bridge for QQ Music
[CmdletBinding()]
param(
    [ValidateSet("get-state", "play", "pause", "toggle", "next", "prev")]
    [string]$Action = "get-state"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Stop'

try {
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
        @{
            ok = $true
            found = $false
            error = "QQ_MUSIC_SESSION_NOT_FOUND"
        } | ConvertTo-Json -Compress
        exit 0
    }

    switch ($Action) {
        "play" {
            $op = $qqSession.TryPlayAsync()
            $res = Await-AsyncOp $op ([bool])
            @{ ok = [bool]$res; action = "play" } | ConvertTo-Json -Compress
            exit 0
        }
        "pause" {
            $op = $qqSession.TryPauseAsync()
            $res = Await-AsyncOp $op ([bool])
            @{ ok = [bool]$res; action = "pause" } | ConvertTo-Json -Compress
            exit 0
        }
        "toggle" {
            $op = $qqSession.TryTogglePlayPauseAsync()
            $res = Await-AsyncOp $op ([bool])
            @{ ok = [bool]$res; action = "toggle" } | ConvertTo-Json -Compress
            exit 0
        }
        "next" {
            $op = $qqSession.TrySkipNextAsync()
            $res = Await-AsyncOp $op ([bool])
            @{ ok = [bool]$res; action = "next" } | ConvertTo-Json -Compress
            exit 0
        }
        "prev" {
            $op = $qqSession.TrySkipPreviousAsync()
            $res = Await-AsyncOp $op ([bool])
            @{ ok = [bool]$res; action = "prev" } | ConvertTo-Json -Compress
            exit 0
        }
        "get-state" {
            $mediaOp = $qqSession.TryGetMediaPropertiesAsync()
            $media = Await-AsyncOp $mediaOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            $playback = $qqSession.GetPlaybackInfo()
            $timeline = $qqSession.GetTimelineProperties()

            $res = @{
                ok = $true
                found = $true
                appId = [string]$qqSession.SourceAppUserModelId
                title = if ($media) { [string]$media.Title } else { "" }
                artist = if ($media) { [string]$media.Artist } else { "" }
                albumTitle = if ($media) { [string]$media.AlbumTitle } else { "" }
                hasThumbnail = if ($media) { [bool]($media.Thumbnail -ne $null) } else { $false }
                playbackStatus = if ($playback) { [string]$playback.PlaybackStatus } else { "Closed" }
                position = if ($timeline) { [double]$timeline.Position.TotalSeconds } else { 0.0 }
                duration = if ($timeline) { [double]$timeline.EndTime.TotalSeconds } else { 0.0 }
                canPlay = if ($playback -and $playback.Controls) { [bool]$playback.Controls.IsPlayEnabled } else { $false }
                canPause = if ($playback -and $playback.Controls) { [bool]$playback.Controls.IsPauseEnabled } else { $false }
                canNext = if ($playback -and $playback.Controls) { [bool]$playback.Controls.IsNextEnabled } else { $false }
                canPrev = if ($playback -and $playback.Controls) { [bool]$playback.Controls.IsPreviousEnabled } else { $false }
            }
            $res | ConvertTo-Json -Compress
            exit 0
        }
    }
} catch {
    @{
        ok = $false
        found = $false
        error = [string]$_.Exception.Message
    } | ConvertTo-Json -Compress
    exit 0
}
