# Kingdom Chronicle

Kingdom Chronicle is a Windows companion for Minecraft and MineColonies. It reads Colony Bridge reports directly from the selected Minecraft instance and brings population, medical care, construction, requests, buildings, research, raid readiness, livestock, food runway, colony stock, and productivity into one local application.

## Refresh colony data

Colony Bridge writes atomic local reports. The desktop app reads those reports without modifying Minecraft or the save. Remote colony uploads are disabled; colony data and comparison history remain on this computer.

For a manual local import, close or save the Minecraft world, then run:

```powershell
npm run sync:colony
```

The importer reads the latest Create Adventures snapshot by default. A different snapshot can be supplied as the first argument:

```powershell
npm run sync:colony -- "C:\path\to\colony.json"
```

The imported development fixture is validated and sanitized. Save paths, owner and citizen UUIDs, exact positions, coordinate-based building IDs, and request UUIDs are excluded.

## Run and verify locally

```powershell
npm run dev
npm test
```

Kingdom Chronicle observes and explains colony data. It never changes Minecraft or the save.

## Windows desktop and updates

The shared `ChronicleDashboard` renders inside a sandboxed Electron window. The trusted main process owns filesystem access and passes only validated schema-2 reports through a narrow preload API.

The former public dashboard is retired. Its address now provides release metadata, verified installer downloads and protected upload endpoints. The desktop app uses the current NSIS/differential update workflow described in desktop/README.md; the older Squirrel endpoints remain for one-time migration.

Verify a real Minecraft instance without writing to it:

```powershell
npm run desktop:check -- "C:\path\to\minecraft\instance"
```

See [desktop/README.md](desktop/README.md) for local desktop development, [docs/WINDOWS_UPDATE_CHANNEL.md](docs/WINDOWS_UPDATE_CHANNEL.md) for the stable release flow, and [docs/WINDOWS_APP_RELEASE_CHECKLIST.md](docs/WINDOWS_APP_RELEASE_CHECKLIST.md) for the security and acceptance matrix.

## Style and layout ownership

`app/globals.css` is the single web style entry point. Its imports preserve the established cascade while separating tokens, base rules, shell, dashboard, components, and responsive behavior. The Electron renderer imports that web entry first and `desktop/src/renderer/shell.css` second, so desktop-only rules remain the final cascade owner.

The desktop window supports a minimum client size of `760 x 640`. Responsive rules must remain usable without horizontal page overflow at that size. The in-game Royal Exchange uses a fixed `316 x 236` layout designed to fit Minecraft's `320 x 240` minimum scaled GUI; changes to web or desktop styles do not alter that server-authoritative screen.
