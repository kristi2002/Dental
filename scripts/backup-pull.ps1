<#
.SYNOPSIS
    Pulls the practice's offsite backup down to a local disk.

.DESCRIPTION
    The third copy, and the only one the clinic physically holds.

    The server in Germany pushes to Backblaze. This script, on a machine in the
    clinic, pulls back down from it — and the direction is the whole point. The
    server never touches this disk and holds no credential that could reach it,
    so a server that is compromised, ransomwared or simply wrong cannot reach
    through and destroy the local copy as well. That is why this is a scheduled
    task here rather than an rsync there.

    The key this script uses must be READ-ONLY. It exists to download; nothing
    about its job requires the ability to delete a single byte, and a read-only
    key on a reception PC is worth far more than the convenience of a
    full-access one.

    Repeat runs are cheap: `--overwrite if-changed` compares before writing, so
    a nightly pull re-downloads only what actually changed rather than the whole
    practice.

.PARAMETER Destination
    Where to write the copy. An external drive is better than an internal one,
    and a drive that is rotated and taken off the premises is better again —
    that is the copy that survives a fire, a theft, or a compromised cloud
    account. See docs/RESTORE.md.

.PARAMETER Install
    Registers this script as a daily scheduled task instead of running it.

.EXAMPLE
    .\backup-pull.ps1 -Destination D:\DentalBackup

.EXAMPLE
    .\backup-pull.ps1 -Destination D:\DentalBackup -Install

.NOTES
    Needs restic on PATH:  winget install restic.restic

    And three values, set once for this user — never checked into the
    repository, and never the server's own keys:

      setx RESTIC_REPOSITORY  "s3:s3.eu-central-003.backblazeb2.com/dentorganizer-backup"
      setx RESTIC_PASSWORD    "<the same passphrase the server uses>"
      setx AWS_ACCESS_KEY_ID  "<the READ-ONLY B2 key id>"
      setx AWS_SECRET_ACCESS_KEY "<the READ-ONLY B2 application key>"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,

    [string]$BackupHost = 'dentorganizer',

    [switch]$Install
)

$ErrorActionPreference = 'Stop'

function Write-Log {
    param([string]$Message)
    Write-Output ("[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $Message)
}

# --- Installing the scheduled task ------------------------------------------

if ($Install) {
    $scriptPath = $MyInvocation.MyCommand.Path
    $taskName = 'DentOrganizer backup pull'

    # 04:30, an hour and a half after the server's overnight run, so the
    # snapshot it pulls is the one that was just taken rather than yesterday's.
    $action = New-ScheduledTaskAction `
        -Execute 'powershell.exe' `
        -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -Destination "{1}"' -f $scriptPath, $Destination)

    $trigger = New-ScheduledTaskTrigger -Daily -At 4:30am

    # StartWhenAvailable matters more than it looks: a reception PC is switched
    # off at night as often as not, and without it a missed 04:30 is simply a
    # day with no local copy rather than a pull that happens at 09:00 instead.
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -DontStopOnIdleEnd `
        -ExecutionTimeLimit (New-TimeSpan -Hours 6)

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Description 'Downloads the clinic''s offsite backup to a local disk. See docs/RESTORE.md.' `
        -Force | Out-Null

    Write-Log "Registered '$taskName' — daily at 04:30, writing to $Destination."
    Write-Log "Run it once now to check it works:  Start-ScheduledTask -TaskName '$taskName'"
    return
}

# --- Preconditions ----------------------------------------------------------

if (-not (Get-Command restic -ErrorAction SilentlyContinue)) {
    throw 'restic is not on PATH. Install it with:  winget install restic.restic'
}

foreach ($name in @('RESTIC_REPOSITORY', 'RESTIC_PASSWORD', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY')) {
    if (-not [Environment]::GetEnvironmentVariable($name)) {
        throw "$name is not set. See the notes at the top of this script."
    }
}

if (-not (Test-Path $Destination)) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
}

# A drive that is not plugged in must be an error, not a silent success. Without
# this check an unplugged external disk would have the copy written to a folder
# on C: with the same name, and everybody would keep believing the drive in the
# safe was current.
$root = [System.IO.Path]::GetPathRoot((Resolve-Path $Destination))
if (-not (Test-Path $root)) {
    throw "$root is not available — is the backup drive plugged in?"
}

# --- Pull -------------------------------------------------------------------

Write-Log "Repository: $env:RESTIC_REPOSITORY"
Write-Log 'Looking for the newest snapshot'

$snapshotsJson = restic snapshots --host $BackupHost --latest 1 --json
if ($LASTEXITCODE -ne 0) {
    throw 'Could not reach the repository. Check the network and the credentials.'
}

$snapshot = ($snapshotsJson | ConvertFrom-Json) | Select-Object -First 1
if ($null -eq $snapshot) {
    throw "The repository holds no snapshot for host '$BackupHost'."
}

$takenAt = [datetime]$snapshot.time
$ageHours = [math]::Round(((Get-Date) - $takenAt).TotalHours, 1)
Write-Log ("Snapshot {0}, taken {1:yyyy-MM-dd HH:mm} ({2}h ago)" -f $snapshot.short_id, $takenAt, $ageHours)

# The check that catches a server which stopped backing up weeks ago. Without
# it this script would keep succeeding, keep reporting a healthy local copy, and
# keep copying the same stale snapshot down every night for ever.
if ($ageHours -gt 48) {
    Write-Warning "The newest snapshot is $ageHours hours old. The server may have stopped backing up — check the Staff page."
}

Write-Log "Downloading to $Destination"
restic restore $snapshot.short_id --target $Destination --overwrite if-changed
if ($LASTEXITCODE -ne 0) {
    throw 'restic restore failed. The local copy has NOT been updated.'
}

# --- What landed ------------------------------------------------------------

$files = Get-ChildItem -Path $Destination -Recurse -File -ErrorAction SilentlyContinue
$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
$dumps = $files | Where-Object { $_.Extension -eq '.dump' } | Sort-Object Name

Write-Log ("Local copy: {0} files, {1:N1} GB" -f $files.Count, ($totalBytes / 1GB))
if ($dumps.Count -gt 0) {
    Write-Log ("Newest database dump: {0}" -f $dumps[-1].Name)
} else {
    # The patient files without the database is half a practice, and the half
    # that cannot be read on its own.
    Write-Warning 'No .dump file in the local copy — the records are missing, only the files came down.'
}

# A machine-readable breadcrumb beside the copy, so the next person to look at
# this drive can tell a current backup from one that stopped in March without
# having to reconstruct it from timestamps.
$summary = [ordered]@{
    pulledAt       = (Get-Date).ToString('o')
    repository     = $env:RESTIC_REPOSITORY
    snapshotId     = $snapshot.short_id
    snapshotTaken  = $takenAt.ToString('o')
    snapshotAgeHrs = $ageHours
    fileCount      = $files.Count
    totalBytes     = $totalBytes
    newestDump     = if ($dumps.Count -gt 0) { $dumps[-1].Name } else { $null }
}
$summary | ConvertTo-Json | Out-File -FilePath (Join-Path $Destination 'last-pull.json') -Encoding utf8

Write-Log 'Done.'
