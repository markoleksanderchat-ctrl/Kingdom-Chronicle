# Windows update channel

This document describes the legacy Squirrel channel retained for migration. The current NSIS release command, differential updater, metadata-last publication and recovery procedure are documented in [desktop/README.md](../desktop/README.md).

Kingdom Chronicle uses a user-initiated, verified installer channel. The public colony dashboard is retired; its existing HTTPS address remains online only as the desktop update service.

Stable manifest: `https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-update`

## Release flow

1. Increase the desktop semantic version in desktop/package.json. Launcher version metadata is generated from it.
2. Run the desktop tests, typecheck, source lint, pnpm make, and the packaged-output scan. The make command rebuilds the launcher first.
3. Pin the exact release version, size, SHA-256 digest, summary, and object key in `lib/desktop-release.ts`.
4. Build and deploy the update service.
5. Set `KINGDOM_RELEASE_UPLOAD_TOKEN` only for the release command and run `scripts/Publish-DesktopRelease.ps1`.
6. Verify the manifest, release notes, download headers, size, and SHA-256 digest from the deployed service.
7. Exercise a real version N to N+1 update in the normal Windows user session.

## User experience

- **Check for updates** performs a bounded request to the pinned manifest and never interrupts local colony viewing.
- **Download and install** appears only for a strictly newer semantic version.
- The app confirms before downloading, shows progress, and verifies the complete file.
- **Install and restart** is a separate final confirmation after verification.
- Cancellation, an offline service, malformed metadata, redirects, size mismatches, digest mismatches, and disk errors leave the installed app and local colony reports untouched.

## Security boundary

- Network and installer operations run only in the trusted Electron main process.
- The renderer cannot provide a URL, file path, digest, or executable.
- Manifest, notes, and installer URLs must use the exact allowlisted HTTPS origin and path.
- Redirects are rejected.
- Manifests are bounded to 64 KB and installers to 300 MB.
- The release object must exist at the pinned R2 key and match the declared size before the manifest is published.
- The desktop computes SHA-256 while writing and removes incomplete or mismatched downloads.
- The installer is launched only after the user confirms installation.
- Local Colony Bridge reading remains independent of internet and update state.

## Signing

The size and SHA-256 checks protect against corruption and mismatched uploads. A trusted Windows code-signing certificate is still required before describing the channel as publisher-signed or expecting established SmartScreen reputation.
