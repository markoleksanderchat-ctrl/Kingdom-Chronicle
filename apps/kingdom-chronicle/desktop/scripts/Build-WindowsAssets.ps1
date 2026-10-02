param(
    [switch]$RegenerateIcon,
    [string]$AssetOutputDirectory,
    [switch]$SkipLauncher,
    [string]$VersionOverride,
    [string]$LauncherOutputDirectory
)

$ErrorActionPreference = 'Stop'

$desktopRoot = Split-Path -Parent $PSScriptRoot
$assetsDirectory = if ($AssetOutputDirectory) { $AssetOutputDirectory } else { Join-Path $desktopRoot 'assets' }
$launcherDirectory = Join-Path $desktopRoot 'launcher'
$launcherBuildDirectory = if ($LauncherOutputDirectory) { $LauncherOutputDirectory } else { Join-Path $launcherDirectory 'build' }
$packagePath = Join-Path $desktopRoot 'package.json'
$iconPath = Join-Path $assetsDirectory 'kingdom-chronicle.ico'
$pngPath = Join-Path $assetsDirectory 'kingdom-chronicle.png'
$sourcePngPath = Join-Path $desktopRoot 'assets/kingdom-chronicle.png'
$versionInfoPath = Join-Path $launcherBuildDirectory 'VersionInfo.cs'

New-Item -ItemType Directory -Force -Path $assetsDirectory, $launcherBuildDirectory | Out-Null

if ($SkipLauncher -and -not $RegenerateIcon) {
    throw 'SkipLauncher is only supported while regenerating assets for verification.'
}

$version = (Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version
if ($VersionOverride) { $version = $VersionOverride }
if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw 'Desktop package version must use major.minor.patch format.'
}
[System.IO.File]::WriteAllText($versionInfoPath, @"
using System.Reflection;
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
[assembly: AssemblyInformationalVersion("$version")]
"@)

if ($RegenerateIcon -or -not (Test-Path -LiteralPath $iconPath) -or -not (Test-Path -LiteralPath $pngPath)) {
    if (-not (Test-Path -LiteralPath $sourcePngPath)) {
        throw "Canonical PNG asset is missing: $sourcePngPath"
    }
    if ([System.IO.Path]::GetFullPath($pngPath) -ne [System.IO.Path]::GetFullPath($sourcePngPath)) {
        Copy-Item -LiteralPath $sourcePngPath -Destination $pngPath -Force
    }

    $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
    $iconStream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter $iconStream
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]1)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$pngBytes.Length)
    $writer.Write([UInt32]22)
    $writer.Write($pngBytes)
    $writer.Flush()
    [System.IO.File]::WriteAllBytes($iconPath, $iconStream.ToArray())
    $writer.Dispose()
    $iconStream.Dispose()
}

if ($SkipLauncher) {
    return
}

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) {
    throw 'The Windows C# compiler was not found.'
}

$compilerArguments = @(
    '/nologo',
    '/target:winexe',
    '/optimize+',
    '/platform:anycpu',
    "/win32icon:$iconPath",
    "/win32manifest:$(Join-Path $launcherDirectory 'app.manifest')",
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Windows.Forms.dll',
    "/out:$(Join-Path $launcherBuildDirectory 'KingdomChronicle.exe')",
    (Join-Path $launcherDirectory 'KingdomChronicle.cs'),
    $versionInfoPath
)
& $csc $compilerArguments
if ($LASTEXITCODE -ne 0) {
    throw "Launcher compilation failed with exit code $LASTEXITCODE."
}
