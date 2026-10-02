param([Parameter(Mandatory)][string]$Package, [Parameter(Mandatory)][string]$Version, [Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'
if($Version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid bridge version.'}
$root=Split-Path -Parent $PSScriptRoot
$packagePath=[IO.Path]::GetFullPath($Package)
$outputPath=[IO.Path]::GetFullPath($Output)
$build=Join-Path (Split-Path -Parent $outputPath) 'bridge-bootstrap-build'
New-Item -ItemType Directory -Path $build -Force | Out-Null
$stream=[IO.File]::OpenRead($packagePath)
$algorithm=[Security.Cryptography.SHA256]::Create()
try { $hash=[BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
finally { $algorithm.Dispose(); $stream.Dispose() }
$constants=Join-Path $build 'BridgePayload.cs'
[IO.File]::WriteAllText($constants,"using System.Reflection;`n[assembly: AssemblyVersion(`"$Version.0`")]`n[assembly: AssemblyFileVersion(`"$Version.0`")]`ninternal static class BridgePayload { internal const string Version = `"$Version`"; internal const string Sha256 = `"$hash`"; }`n")
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$arguments=@('/nologo','/target:winexe','/optimize+','/platform:anycpu',('/out:'+$outputPath),('/resource:'+$packagePath+',BridgePackage'),('/win32icon:'+(Join-Path $root 'assets\kingdom-chronicle.ico')),('/win32manifest:'+(Join-Path $root 'launcher\app.manifest')),'/reference:System.dll','/reference:System.Core.dll','/reference:System.IO.Compression.dll','/reference:System.Web.Extensions.dll','/reference:System.Windows.Forms.dll',(Join-Path $root 'launcher\LegacyBridgeInstaller.cs'),$constants)
& $csc $arguments
if($LASTEXITCODE -ne 0){throw 'Bridge bootstrap compilation failed.'}
Write-Output ('Built preserving bridge '+$Version+'; package SHA256 '+$hash)
