# Kingdom Chronicle

Read-only Windows companion for Minecraft and MineColonies. Kingdom Chronicle reads local Colony Bridge reports, displays colony activity and resources, and keeps reports/settings outside its stable installation folder.

The application, shared dashboard and HTTPS update-host source are in [`apps/kingdom-chronicle`](apps/kingdom-chronicle). The snapshot contracts and example fixtures are in [`contracts/snapshot/v2`](contracts/snapshot/v2). The Minecraft mod is maintained separately.

## Develop on Windows

Use Node.js 22.13 or newer and pnpm. Install the two locked dependency sets:

```powershell
cd apps/kingdom-chronicle
npm ci
cd desktop
pnpm install --frozen-lockfile
pnpm start
```

## Verify

```powershell
# From apps/kingdom-chronicle
npm run typecheck
npm run lint
npm test
cd desktop
pnpm typecheck
pnpm test
```

## Build a Windows installer

```powershell
# From apps/kingdom-chronicle/desktop
npm run release
```

The release pipeline validates, tests, builds and packages an x64 NSIS installer plus blockmap and update metadata. Building does not publish or change the version. An explicit `--patch`, `--minor`, `--major` or `--version` changes the version. See [`desktop/README.md`](apps/kingdom-chronicle/desktop/README.md) for publishing, recovery and isolated update tests.

Existing installations continue using the established HTTPS update host and differential downloads. Pushing source to GitHub does not deploy the host, publish installers or install the Minecraft mod. No GitHub Actions publishing workflow is enabled.

## Data and credentials

The checked-in dashboard data is an Example Colony test fixture. Live colony reports, save data, credentials, dependencies and generated installers are excluded. Item sprites are read from the user's local Minecraft/mod assets; those game assets are not included in this repository. Do not commit locally imported reports.

Publishing requires process-local `KINGDOM_RELEASE_UPLOAD_TOKEN`, matching the update host's server secret. Optional signing uses `CSC_LINK` and `CSC_KEY_PASSWORD`. Keep credentials and signing certificates outside Git.
