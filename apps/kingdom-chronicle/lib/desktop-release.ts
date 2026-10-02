export const DESKTOP_RELEASE = Object.freeze({
  version: "0.3.2",
  releasedAt: "2026-10-01T13:08:30.6208117Z",
  summary: "Fixed the navigation menu opening jitter while preserving its animation timing, appearance, and layout.",
  fileName: "Kingdom Chronicle-0.3.2 Setup.exe",
  objectKey: "desktop/stable/Kingdom Chronicle-0.3.2 Setup.exe",
  sizeBytes: 118778368,
  sha256: "558772b698cb970fe03bc5aa485dfb8a9aa7a60f04ef15e54a8e2853bc3bfc5c",
});

export const DESKTOP_UPDATE_PROTOCOL_ID = "com.kingdomchronicle.desktop-update";
export const DESKTOP_UPDATE_SCHEMA_VERSION = 2;

export function releaseDownloadUrl(request: Request) {
  return new URL("/api/desktop-release", request.url).toString();
}

export function releaseNotesUrl(request: Request) {
  return new URL("/api/desktop-release-notes", request.url).toString();
}
