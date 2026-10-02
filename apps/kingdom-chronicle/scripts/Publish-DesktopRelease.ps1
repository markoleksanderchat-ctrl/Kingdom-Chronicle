param(
  [string]$FilePath,
  [string]$ServiceRoot = "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseSource = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "lib\desktop-release.ts")

$version = [regex]::Match($releaseSource, 'version:\s*"([0-9]+\.[0-9]+\.[0-9]+)"').Groups[1].Value
$expectedSize = [long][regex]::Match($releaseSource, 'sizeBytes:\s*([0-9]+)').Groups[1].Value
$expectedHash = [regex]::Match($releaseSource, 'sha256:\s*"([a-f0-9]{64})"').Groups[1].Value
if (-not $version -or $expectedSize -le 0 -or -not $expectedHash) { throw "The pinned desktop release metadata is incomplete." }

if (-not $FilePath) {
  $FilePath = Join-Path $projectRoot "desktop\out\make\squirrel.windows\x64\Kingdom Chronicle-$version Setup.exe"
}
$resolvedFile = (Resolve-Path -LiteralPath $FilePath).Path
$file = Get-Item -LiteralPath $resolvedFile
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedFile).Hash.ToLowerInvariant()
if ($file.Length -ne $expectedSize) { throw "Installer size does not match the pinned release metadata." }
if ($actualHash -ne $expectedHash) { throw "Installer SHA-256 does not match the pinned release metadata." }

$token = $env:KINGDOM_RELEASE_UPLOAD_TOKEN
if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) { throw "KINGDOM_RELEASE_UPLOAD_TOKEN is not set." }

$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)
try {
  $metadata = @{ version = $version; sizeBytes = $expectedSize; sha256 = $expectedHash } | ConvertTo-Json -Compress
  $startContent = [System.Net.Http.StringContent]::new($metadata, [Text.Encoding]::UTF8, "application/json")
  $startResponse = $client.PostAsync("$ServiceRoot/api/desktop-release-upload?action=start", $startContent).GetAwaiter().GetResult()
  $startBody = $startResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $startResponse.IsSuccessStatusCode) { throw "Release upload could not start: $startBody" }
  $uploadId = ($startBody | ConvertFrom-Json).uploadId
  if (-not $uploadId) { throw "The release service did not return an upload identifier." }

  $parts = [System.Collections.Generic.List[object]]::new()
  $partSize = 20 * 1024 * 1024
  $buffer = [byte[]]::new($partSize)
  $stream = [System.IO.File]::OpenRead($resolvedFile)
  try {
    $partNumber = 1
    while (($bytesRead = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $bytes = if ($bytesRead -eq $buffer.Length) { $buffer } else { $buffer[0..($bytesRead - 1)] }
      $content = [System.Net.Http.ByteArrayContent]::new($bytes)
      $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/octet-stream")
      $partUrl = "$ServiceRoot/api/desktop-release-upload?uploadId=$([uri]::EscapeDataString($uploadId))&partNumber=$partNumber"
      $partResponse = $client.PutAsync($partUrl, $content).GetAwaiter().GetResult()
      $partBody = $partResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      $content.Dispose()
      if (-not $partResponse.IsSuccessStatusCode) { throw "Release part $partNumber failed: $partBody" }
      $part = $partBody | ConvertFrom-Json
      $parts.Add(@{ partNumber = [int]$part.partNumber; etag = [string]$part.etag })
      Write-Host "Uploaded part $partNumber of $([math]::Ceiling($expectedSize / $partSize))."
      $partNumber++
    }
  } finally { $stream.Dispose() }

  $completeBody = @{ parts = $parts } | ConvertTo-Json -Depth 4 -Compress
  $completeContent = [System.Net.Http.StringContent]::new($completeBody, [Text.Encoding]::UTF8, "application/json")
  $completeUrl = "$ServiceRoot/api/desktop-release-upload?action=complete&uploadId=$([uri]::EscapeDataString($uploadId))"
  $completeResponse = $client.PostAsync($completeUrl, $completeContent).GetAwaiter().GetResult()
  $completeText = $completeResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $completeResponse.IsSuccessStatusCode) { throw "Release upload could not complete: $completeText" }
  Write-Host "Kingdom Chronicle $version was uploaded and verified by size."
} catch {
  if ($uploadId) {
    try { $client.DeleteAsync("$ServiceRoot/api/desktop-release-upload?uploadId=$([uri]::EscapeDataString($uploadId))").GetAwaiter().GetResult() | Out-Null } catch { }
  }
  throw
} finally {
  $client.Dispose()
}
