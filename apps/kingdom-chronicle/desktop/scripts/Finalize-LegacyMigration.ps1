param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$ExpectedVersion)
$ErrorActionPreference = 'Stop'
# Get-FileHash may be unavailable when another PowerShell runtime supplied PSModulePath.
function Get-ShortcutSha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}
$resolved = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\KingdomChronicle')).TrimEnd('\')
if ($resolved -ine $expectedRoot) { throw 'Unknown install root: legacy cleanup deferred.' }
$exe = Join-Path $resolved 'KingdomChronicle.exe'
$productVersion = [version](Get-Item -LiteralPath $exe).VersionInfo.ProductVersion
$normalizedVersion = "$($productVersion.Major).$($productVersion.Minor).$($productVersion.Build)"
if (!(Test-Path -LiteralPath (Join-Path $resolved 'Uninstall KingdomChronicle.exe')) -or
    $normalizedVersion -ne $ExpectedVersion) { throw 'New NSIS installation has not been verified.' }
$legacyKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\KingdomChronicle'
$legacy = Get-ItemProperty -LiteralPath $legacyKey -ErrorAction SilentlyContinue
$legacyRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'KingdomChronicle')).TrimEnd('\')
$updater = Join-Path $legacyRoot 'Update.exe'
$legacyRegistrationVerified = $legacy -and $legacy.DisplayName -eq 'Kingdom Chronicle' -and $legacy.InstallLocation -ieq $legacyRoot -and
    $legacy.UninstallString -ieq ('"' + $updater + '" --uninstall')
if ($legacyRegistrationVerified) {
    Remove-Item -LiteralPath $legacyKey
    if (Test-Path -LiteralPath $updater) { Remove-Item -LiteralPath $updater }
    Write-Output 'Removed positively identified Squirrel uninstall registration and Update.exe.'
}
$shell = New-Object -ComObject WScript.Shell
$shellProperties = New-Object -ComObject Shell.Application
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ChronicleShortcutNotify {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern void SHChangeNotify(uint eventId, uint flags, string path, IntPtr unused);
}
'@
$currentStartMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Kingdom Chronicle.lnk'
$links = @(
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Marko\Kingdom Chronicle.lnk'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Kingdom Chronicle.lnk')
)
foreach ($file in $links) {
    if (!(Test-Path -LiteralPath $file)) { continue }
    $link = $shell.CreateShortcut($file)
    $target = $link.TargetPath
    if ([IO.Path]::GetFileName($target) -ine 'KingdomChronicle.exe') { continue }
    $oldPackage = Join-Path (Split-Path -Parent $target) 'resources\app\package.json'
    $owned = $target -ieq $exe -or ($legacyRegistrationVerified -and $target -ieq (Join-Path $legacyRoot 'KingdomChronicle.exe'))
    if (!$owned -and (Test-Path -LiteralPath $oldPackage)) {
        try { $owned = (Get-Content -LiteralPath $oldPackage -Raw | ConvertFrom-Json).name -eq 'kingdom-chronicle-desktop' } catch { $owned = $false }
    }
    if ($owned) {
        $propertyFolder = $shellProperties.Namespace((Split-Path -Parent $file))
        $oldIdentity = $propertyFolder.ParseName([IO.Path]::GetFileName($file)).ExtendedProperty('System.AppUserModel.ID')
        $backupRoot = Join-Path $env:APPDATA 'Kingdom Chronicle\updates\legacy-shortcuts'
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        $backup = Join-Path $backupRoot ((Get-ShortcutSha256 $file) + '.lnk')
        Copy-Item -LiteralPath $file -Destination $backup
        if ((Get-ShortcutSha256 $file) -ne (Get-ShortcutSha256 $backup)) { throw 'Shortcut backup failed.' }
        try {
            $link.TargetPath = $exe
            $link.WorkingDirectory = $resolved
            $link.IconLocation = $exe + ',0'
            $link.Save()
            $newIdentity = $propertyFolder.ParseName([IO.Path]::GetFileName($file)).ExtendedProperty('System.AppUserModel.ID')
            if ($oldIdentity -ne $newIdentity) { throw 'Windows changed shortcut identity; repair deferred.' }
            [ChronicleShortcutNotify]::SHChangeNotify(0x2000, 0x2005, $file, [IntPtr]::Zero)
            Write-Output "Retargeted verified Chronicle shortcut: $file"
            if ($file -ieq $links[0] -and (Test-Path -LiteralPath $currentStartMenu)) {
                $currentLink = $shell.CreateShortcut($currentStartMenu)
                $currentFolder = $shellProperties.Namespace((Split-Path -Parent $currentStartMenu))
                $currentIdentity = $currentFolder.ParseName([IO.Path]::GetFileName($currentStartMenu)).ExtendedProperty('System.AppUserModel.ID')
                if ($currentLink.TargetPath -ieq $exe -and $currentIdentity -eq 'com.squirrel.KingdomChronicle.KingdomChronicle' -and $oldIdentity -eq $currentIdentity) {
                    Remove-Item -LiteralPath $file
                    [ChronicleShortcutNotify]::SHChangeNotify(0x4, 0x2005, $file, [IntPtr]::Zero)
                    Write-Output 'Removed backed-up duplicate legacy Start Menu shortcut; current NSIS shortcut verified.'
                }
            }
        } catch {
            Copy-Item -LiteralPath $backup -Destination $file -Force
            throw
        }
    } else { Write-Output "Unknown shortcut retained: $file" }
}
