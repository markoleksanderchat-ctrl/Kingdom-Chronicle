# Windows App Acceptance and Release Checklist

This checklist is ready to use when desktop implementation begins. A working window is not considered finished until the prototype gates pass.

## Prototype gates

- [ ] App starts without Minecraft or internet access.
- [ ] Renderer has no Node.js integration and no generic Electron/IPC access.
- [ ] Known Create Adventures instance is discovered or selected in one first-run flow.
- [ ] Current schema-2 snapshot renders through the shared `ChronicleDashboard` component.
- [ ] Game-open refresh appears without restarting the app.
- [ ] Game-closed state keeps the last complete report and labels its age honestly.
- [ ] Malformed, partial, oversized, escaped, symlinked, wrong-protocol, wrong-schema, wrong-layout, non-filesystem, and non-read-only inputs are rejected.
- [ ] Rejected input never replaces the last-known-good report.
- [ ] Multiple colonies and multiple instances are selectable without data mixing.
- [ ] Clear local cache removes only files under the app's own user-data cache.
- [ ] Search, tabs, Simple/Detailed mode, keyboard navigation, reduced motion, and narrow-window layouts still work.
- [ ] Journal text, routes, storage, and placeholders remain absent.

## Normal-use matrix

| Scenario | Expected result |
| --- | --- |
| First launch, game closed | Instance can be selected; latest complete report loads if present. |
| First launch, no Bridge output | Plain-language waiting state; no crash or fabricated colony. |
| Minecraft exports while app is open | Debounced refresh loads the next complete snapshot. |
| Snapshot changes during read | Retry, then old report remains until a complete new file validates. |
| Minecraft closes | Disconnect snapshot appears, or prior report remains with exact timestamp. |
| Instance folder moves | Cache remains readable; app asks to choose the instance again. |
| Bridge schema becomes newer | App update message; old cache remains available and clearly labeled. |
| Internet disconnected | All local viewing and refresh behavior continues normally. |
| Hosted service unavailable | No effect on local mode. |
| App reopened after Windows restart | Chosen instance and last valid report recover normally. |

## Packaging gates

- [ ] Forge make produces a Squirrel Setup executable on Windows.
- [ ] Clean per-user install succeeds without administrator access.
- [ ] Start Menu shortcut and App User Model ID are correct.
- [ ] Installer/update lifecycle starts only one app window.
- [ ] Uninstall removes binaries and shortcuts; cache handling is stated clearly.
- [ ] Packaged renderer contains no development URL, remote code, source map with private paths, or remote debugging switch.
- [ ] Application icon, product name, version, publisher, description, and legal metadata are final.
- [ ] Dependency audit and Electron security warnings are clean.

## Signed release gates

- [ ] Windows code-signing certificate and secret-storage method are chosen.
- [ ] Setup executable and packaged application are signed and signature-verified.
- [ ] SmartScreen behavior is tested on a clean Windows user profile.
- [ ] Update channel is tested from version N to N+1 with rollback/recovery documented.
- [ ] Release notes state the supported Bridge protocol, schema, and output layout.
- [ ] SHA-256 hashes are published for release artifacts.

Automatic updates remain out of the first personal prototype. Add them only after signed installer behavior is stable.

## Automated verification record

July 17, 2026 hardening pass:

- Desktop TypeScript and source lint completed with no diagnostics.
- Desktop tests: 8 passed, 0 failed, and 1 symlink test was skipped because this Windows session cannot create symlinks.
- Shared dashboard build completed and all 13 rendered/contract tests passed.
- The live Create Adventures Bridge 0.15.0 contract and latest Jameson II snapshot passed the read-only readiness check.
- Forge produced the Windows package, Setup executable, NuGet package, and `RELEASES` manifest.
- Packaged output contained the production `connect-src 'none'` policy, with no localhost/WebSocket development endpoint, source map, source-map marker, or remote-debugging switch found.
- Cache validation now rejects malformed content and prevents a report from one Minecraft instance being shown for another.
- Live reads reject oversized files and retry files that change during a read before preserving the last-known-good report.
- Single-instance locking is implemented; the real-user launch lifecycle is recorded below.

## 0.1.1 real-user update record

Verified July 17, 2026:

- The 0.1.1 Setup executable was launched from File Explorer under Marko's normal Windows user session.
- Squirrel replaced `app-0.1.0` with `app-0.1.1` under the real `C:\Users\marko\AppData\Local\KingdomChronicle` install root.
- The app displayed the `v0.1.1` badge and loaded the real Jameson II report from the saved Create Adventures selection.
- `UserData\settings.json` and `UserData\cache\last-good.json` remained present.
- The Start Menu shortcut targets the real root `KingdomChronicle.exe`.
- The real HKCU uninstall entry reports Kingdom Chronicle version 0.1.1 and points to `Update.exe --uninstall`.
- A second launch kept exactly one app window.
- Closing and relaunching produced one responsive 0.1.1 window owned by the real installed Electron process.
- Uninstall cleanup itself remains untested because this verified installation was intentionally retained.
