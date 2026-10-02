# Kingdom Chronicle Desktop App

This Electron app reads Colony Bridge's atomic JSON output directly from a selected CurseForge instance. The renderer is sandboxed and receives only validated colony data through the preload API. The app never opens or modifies the Minecraft save.

## Companion interface and item art

The default navigation rail keeps every page accessible by icon, with tooltips and an expandable label panel. Every page uses one view, with complete inventories and rosters, priority summaries, and expandable reference information. Connection labels use the report trigger and five-minute freshness boundary, rather than claiming a saved report is live.

All desktop resource rows use `components/dashboard/minecraft-item-icon.tsx`. Its registry-ID loader reads bounded model/PNG entries from the selected instance's installed mod JARs and local Minecraft version JAR; it never extracts archives, modifies them, or makes asset network requests. Generated/handheld layers and basic cube models retain real transparent textures and crisp scaling. Unknown, animated, complex and built-in/entity models use a clean placeholder. Active resource-pack overrides and Minecraft's special renderers are not reproduced.

The native Java Trader resolves item art through Minecraft's renderer and cannot share a React component. The desktop component uses the same canonical registry/model/texture vocabulary, and is shared by Ledger, requests, food, building previews and builder requests. Minecraft/mod assets are read locally rather than redistributed with this app. Builder requests are associated with the assigned citizen; they are not an authoritative bill of materials.

## Run

```powershell
pnpm start
```

## Verify

```powershell
pnpm test
pnpm typecheck
```

The app automatically discovers a single compatible instance under the normal CurseForge Instances folder. If discovery is ambiguous or unavailable, choose the instance folder from the first-run screen.

## Updates and releases

The primary Windows release command is:

```powershell
npm run release
npm run release -- --patch
```

The first command builds the version already in `package.json`. `--patch`, `--minor`, `--major` and `--version x.y.z` explicitly change that single version source; ordinary builds never bump it. Releases are built locally by default. `pnpm make`, Forge's package command, the C# updater and `Publish-DesktopRelease.ps1` belong to the legacy Squirrel workflow and must not be used for normal releases.

The command checks locked dependencies, both type checks, lint and tests, compiles main/preload/renderer once, packages ASAR, generates an x64 per-user NSIS installer and blockmap, and validates checksums. `release/<version>/release-report.json` records measured stages and actual artifact hashes; `release.log` contains detailed validation output. Signing is supported through Electron Builder's `CSC_LINK` and `CSC_KEY_PASSWORD`. No certificate is currently configured; current releases are unsigned. Keep certificate files and credentials outside source control.

Only after explicit production authorization:

```powershell
npm run release -- --resume release/0.3.9 --publish
```

Set `KINGDOM_RELEASE_UPLOAD_TOKEN` in the publishing process only, matching the host's `RELEASE_UPLOAD_TOKEN` server secret. The existing host remains `https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site`; its new routes and existing `RELEASES` R2 binding are deployed. The generic feed is `/api/desktop-updates/stable/latest.yml`. NSIS **0.3.9** and legacy compatibility bridge **0.3.5** are published. The command above resumes that immutable release; for a future release, build a new version first and substitute its directory. Publisher credentials are not stored permanently on this PC.

Clean installs and manual recovery use `/api/desktop-updates/stable/0.3.9/KingdomChronicle-0.3.9-Setup.exe`. The old `/api/desktop-release` endpoint deliberately serves the compatibility bridge and is not the full NSIS recovery installer.

Uploads use resumable multipart sessions, immutable version namespaces and remote SHA512 byte verification. The stable pointer is committed last with an R2 conditional write. `--resume <directory> --publish` retries failed network stages without rebuilding successful artifacts, including an unknown outcome after metadata commit. Never reuse a published version for different bytes. Keep previous installers and blockmaps available on the host; differential downloads need them. Only installed-client tests can measure a real differential download size.

The app checks quietly after startup and every six hours, downloads in the background and verifies through `electron-updater`. It never installs on ordinary exit. **Restart and update** flushes state, writes a restart journal and calls the supported NSIS quit/install API with automatic relaunch. The new renderer and runtime must start and the expected version must match before success is recorded. Errors, buttons and progress share one authoritative main-process state. A failed differential check falls back to the full installer and resumes visible download progress. Manual checking remains available, including before a Minecraft instance is selected.

Stable identity is `com.squirrel.KingdomChronicle.KingdomChronicle`; normal NSIS installations use `%LOCALAPPDATA%\Programs\KingdomChronicle\KingdomChronicle.exe`. Settings and reports use `%APPDATA%\Kingdom Chronicle`. Supported user data remains outside the replaceable installation directory. Diagnostics are in `logs/updater.log`, `updates/restart.json` and `updates/last-success.json` under that data directory. A missing relaunch leaves the restart journal for diagnosis on the next launch.

The installer grants Windows restricted application processes read/execute access only inside its installation directory, retaining existing permission rules. This keeps Chromium subprocesses working when inherited AppContainer entries otherwise block startup. It checks the permission command before launching and fails with an installer error if that step fails. It does not grant write access or change parent/profile permissions. The failure was reproduced on 0.3.6 and fixed by the 0.3.7 installer with the inherited rule still present.

## One-time Squirrel migration

The existing custom installer would overwrite an NSIS executable with its C# launcher. Therefore legacy clients first receive a compatibility bridge that already uses the new updater. The published versions are bridge **0.3.5**, then the latest NSIS release (**0.3.9**). The bridge's Electron executable is named `KingdomChronicleRuntime.exe`; the special `electron.exe` basename makes Electron treat it as an unpackaged development build and disables installed updates. `npm run release -- --migration` prepares a new pair using two explicit patch increments; ordinary future NSIS releases do not need another bridge.

The superseded 0.3.3 bridge has that development-build detection bug. Clients already on it should use the verified full NSIS installer once. Published release bytes are retained unchanged.

The bridge installer verifies the registered legacy installation and its embedded package, then adds only the new `app-<version>` folder. It preserves the existing installation root and does not run Squirrel Setup's clean-install path, which deletes legacy `UserData` and unknown files before the application can migrate them. A conflicting bridge folder fails safely; an identical verified folder supports retry. The old updater retains its normal launcher repair and relaunch step.

The bridge and new app preserve a verified complete backup of legacy `UserData`, copy missing settings/report/preferences into the canonical Roaming profile before Chromium opens it, and retain conflicting originals. Existing valid Roaming data takes priority. After the new NSIS app passes health checks, its migration helper repairs only positively identified legacy links/registration, then removes verified obsolete app folders, matching old launchers and Squirrel packages. Unknown folders and development/workspace builds remain reported. No taskbar unpin operation is used; target and icon are repaired together, Explorer is notified, shortcut backups are retained, and a changed AppUserModelID restores the previous link. Duplicate legacy Start Menu links are removed only when the canonical link has the correct target and the same identity. Custom installation paths defer automatic legacy registration cleanup.

Windows Sandbox passed legacy 0.3.2 to bridge 0.3.5, then the real HTTPS background update to NSIS 0.3.6. Restart and update automatically relaunched the expected version; reports and settings survived. Fresh Start Menu and repaired taskbar-pin launches passed, the icon/group remained correct, the uninstall registration reported 0.3.6, and unknown test files were retained. Six additional NSIS Lab upgrades and seven injected network/corruption recovery cases passed. The 0.3.7 installer also passed the reproduced inherited-permission startup regression with its saved report/settings and marker intact. Live-PC results are recorded in the rollout report rather than inferred from these disposable tests.

The 0.3.8 shortcut-backup check uses .NET SHA256 directly, so a launcher that supplies another PowerShell runtime's module path cannot disable hash verification. Its regression test runs Windows PowerShell without the hash module and rejects a changed backup.

## Recovery

Publish a corrected higher version for a bad release; automatic downgrades are disabled. If the app cannot open, use the verified full NSIS installer linked above to replace its stable installation. Keep `%APPDATA%\Kingdom Chronicle`, legacy `UserData` and migration backups; these hold reports/settings and must not be deleted to repair binaries. Preserve `logs/updater.log` and `updates/restart.json` for a failed relaunch. A failed publication can be retried from its original release directory without rebuilding or changing its version.

## Isolated update lab

```powershell
node scripts/init-update-lab.mjs
npm run release -- --lab --version 0.3.100
node scripts/update-lab-server.mjs
```

Lab builds use a separate executable, identity, cache, localhost feed and fixed workspace data path. Build versions 0.3.100 through 0.3.104 with distinct `KINGDOM_LAB_CSS_MARKER` values for a tiny CSS-only code change. Install the Lab baseline into a workspace directory, download 0.3.101, then run `node scripts/run-update-lab.mjs <absolute-installed-KingdomChronicleLab.exe>`. The driver checks four automatic upgrades, a fresh Start Menu launch after each, preserved data, no version-folder accumulation, offline/malformed/missing releases, corruption, full fallback, interrupted connection and close/reopen recovery. Never publish Lab artifacts; the publisher rejects their identity and names.
