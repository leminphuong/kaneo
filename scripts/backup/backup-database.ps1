<#
.SYNOPSIS
    Takes a compressed backup of the Kaneo PostgreSQL database and prunes old ones.

.DESCRIPTION
    Reads DATABASE_URL from the repository's root .env so the connection details
    live in exactly one place. Writes a pg_dump custom-format archive (-Fc), which
    is already compressed and can be restored selectively with pg_restore.

    Every run appends to backup.log next to the archives, and a failing pg_dump
    makes the script exit non-zero so a scheduler reports the run as failed
    instead of silently producing nothing.

.PARAMETER BackupDir
    Where archives and the log are written. Created if missing.

.PARAMETER RetentionDays
    Archives older than this are deleted after a successful backup. Pruning only
    runs when the new backup succeeded, so a broken run never deletes the last
    good copy.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\backup\backup-database.ps1

.EXAMPLE
    Restore into a fresh database:
      createdb -U postgres kaneo_restore
      pg_restore -U postgres -d kaneo_restore --clean --if-exists <archive>
#>
[CmdletBinding()]
param(
    [string] $BackupDir = "$env:USERPROFILE\kaneo-backups",
    [int]    $RetentionDays = 14,
    [string] $PgBin = "C:\Program Files\PostgreSQL\18\bin"
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string] $Message, [string] $Level = "INFO")
    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Write-Output $line
    if ($script:LogFile) { Add-Content -Path $script:LogFile -Value $line -Encoding utf8 }
}

# Resolve the repo root from this script's location so the task can run from anywhere.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path $envFile)) {
    throw "No .env at $envFile - cannot resolve DATABASE_URL."
}

$databaseUrl = $null
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
        $databaseUrl = $Matches[1].Trim('"').Trim("'")
    }
}

if (-not $databaseUrl) {
    throw "DATABASE_URL is not set in $envFile."
}

$uri = [System.Uri] $databaseUrl
$dbName = $uri.AbsolutePath.TrimStart('/')
$dbUser = [System.Uri]::UnescapeDataString($uri.UserInfo.Split(':')[0])
$dbPass = if ($uri.UserInfo.Contains(':')) {
    [System.Uri]::UnescapeDataString($uri.UserInfo.Split(':', 2)[1])
} else { "" }
$dbHost = $uri.Host
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}
$script:LogFile = Join-Path $BackupDir "backup.log"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $BackupDir "kaneo-$stamp.dump"
$pgDump = Join-Path $PgBin "pg_dump.exe"

if (-not (Test-Path $pgDump)) {
    Write-Log "pg_dump not found at $pgDump" "ERROR"
    exit 1
}

Write-Log "Backing up $dbName from ${dbHost}:${dbPort} to $target"

$env:PGPASSWORD = $dbPass
try {
    # -Fc: custom format, compressed and restorable with pg_restore.
    & $pgDump --host=$dbHost --port=$dbPort --username=$dbUser --dbname=$dbName `
        --format=custom --no-owner --no-privileges --file=$target
    $dumpExit = $LASTEXITCODE
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

if ($dumpExit -ne 0 -or -not (Test-Path $target)) {
    Write-Log "pg_dump failed with exit code $dumpExit" "ERROR"
    if (Test-Path $target) { Remove-Item $target -Force }
    exit 1
}

$sizeKb = [math]::Round((Get-Item $target).Length / 1KB, 1)
if ($sizeKb -le 0) {
    Write-Log "Backup file is empty - treating as failure" "ERROR"
    Remove-Item $target -Force
    exit 1
}

Write-Log "Backup succeeded ($sizeKb KB)"

$cutoff = (Get-Date).AddDays(-$RetentionDays)
$stale = Get-ChildItem -Path $BackupDir -Filter "kaneo-*.dump" |
    Where-Object { $_.LastWriteTime -lt $cutoff }

foreach ($file in $stale) {
    Remove-Item $file.FullName -Force
    Write-Log "Pruned $($file.Name) (older than $RetentionDays days)"
}

$kept = (Get-ChildItem -Path $BackupDir -Filter "kaneo-*.dump" | Measure-Object).Count
Write-Log "Done. $kept archive(s) in $BackupDir"
exit 0
