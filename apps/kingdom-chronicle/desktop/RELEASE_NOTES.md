# Kingdom Chronicle release notes

## 0.3.9 - Small Updates copy polish

- Labels the current version as "Installed version" in Updates for clearer confirmation after restarting.

## 0.3.8 - Published shortcut migration correction

- Keeps shortcut backup hash verification working when launched from another PowerShell runtime.
- Uses .NET SHA256 without depending on PowerShell module discovery; verifies identical backups and rejects changed backups in Windows PowerShell regression coverage.
- Retains the 0.3.7 installer startup fix and stable installation path.

## 0.3.7 - Published Windows startup fix

- Grants Windows restricted processes read/execute access only within the installation folder, allowing startup when inherited AppContainer permissions otherwise block Electron subprocesses.
- Checks that permission setup succeeded before launching the app; reports and settings remain outside the installation folder.
- Preserves the existing update host, application identity and interface.
- Verified against the same startup crash in Windows Sandbox while retaining the inherited permission rule; saved reports/settings and a preservation marker survived.

## 0.3.6 - Published Windows update system

- Publishes the per-user NSIS installer, verified blockmap and HTTPS feed; installed clients download in the background and use Restart and update for automatic relaunch.
- Uses preserving compatibility bridge 0.3.5 for legacy installations. Its runtime name correctly identifies the app as packaged.
- Migrates preferences before Chromium starts; keeps existing Roaming data and verified legacy backups.
- Repairs taskbar target and icon together, preserves application identity and removes only verified duplicate Start Menu links and obsolete application files.
- Passed real HTTPS bridge-to-NSIS installation and fresh Start Menu/taskbar launches in Windows Sandbox, plus six NSIS Lab upgrades. Reports, settings and Detailed mode survived.
- Releases remain unsigned. The live-PC restricted-process startup failure found during this rollout is addressed by 0.3.7.

## 0.3.4 - Superseded Windows update release

- Uses per-user NSIS installation and verified differential downloads through Electron Updater.
- Downloads updates in the background and installs only after choosing Restart and update.
- Keeps progress, errors and actions consistent, with checks available before an instance is selected.
- Verifies the expected version and report/settings health after automatic relaunch.
- Included compatibility bridge 0.3.3; its runtime naming prevented subsequent installed update checks. Use the current full NSIS installer for recovery from that bridge.
- Preserves the existing install folder during the compatibility hop so legacy settings, reports, preferences and unknown files survive migration.

## 0.3.2 - October 1, 2026

- Fixes the navigation menu's brief vertical shift during opening by preventing temporary text wrapping and horizontal scrollbar reflow.
- Keeps the existing animation timing, expanded and collapsed layout, appearance, and vertical scrolling.
- Preserves local read-only syncing and user-controlled verified updates.

## 0.3.1 - October 1, 2026

- Renders local block model shapes and first frames of animated textures, with previews for beds, banners, chests, and shields.
- Resolves 385 of 390 stored item types in the checked report; five custom material or colony-pattern variants still require appearance data.
- Fixes construction removal levels, saturation wording, empty states, duplicated labels, and spacing.
- Improves modal keyboard focus, page scroll reset, refresh feedback, and report diagnostics.
- Preserves read-only colony syncing and user-controlled verified updates.

## 0.3.0 - September 30, 2026

- Refreshes the desktop with a compact Minecraft-inspired layout and accessible icon navigation.
- Adds locally resolved item sprites, searchable inventory rows, and clearer colony, construction, building, and citizen views.
- Preserves Detailed records, local read-only syncing, settings, and user-controlled verified updates.
- Uses placeholders when an installed item model cannot be rendered reliably.

## 0.2.9 - August 3, 2026

- Completes the behind-the-scenes reliability reorganization while keeping the same colony dashboard and local read-only workflow.
- Strengthens large-colony performance checks, recovery tests, packaging, and release verification.
- Preserves all settings, cached reports, protocol compatibility, and user-controlled updates.

## 0.2.8 - July 26, 2026

- Removes retired hosted-data polling and stale scaffolding.
- Keeps desktop colony syncing local and unchanged.
- Updates the web foundation without removing dashboard features.

## 0.2.7 - July 26, 2026

- Refines wording throughout the colony overview for faster reading during play.
- Replaces technical and awkward labels with clear, colony-focused language.
- Improves spacing, hierarchy, status consistency, and compact-screen readability.

## 0.2.6 - July 25, 2026

- Reconciles every MineColonies Knight and Ranger final blow against its recorded creature detail.
- Labels MineColonies raiders separately from vanilla monsters and other hostile targets.
- Preserves unmatched historical totals as unclassified instead of guessing a creature or category.
- Clarifies that player and other-citizen kills are excluded, while animal-worker butchering remains separate.

## 0.2.5 - July 25, 2026

- Adds a backdated MineColonies combat record to Realm for guard and ranger kills.
- Separates colony raiders, other hostile mobs, peaceful or other targets, and legacy unclassified kills.
- Shows animal-worker production slaughter separately from defensive kills.
- Keeps the detailed per-creature lifetime breakdown available in Detailed view.

## 0.2.4 - July 24, 2026

- Repairs the durable launcher, Start Menu shortcuts, and Desktop shortcut from the native launcher in the real Windows user context.
- Removes restricted Electron lifecycle writes that created stranded `.new` launcher files.
- Shows livestock only for staffed animal huts, grouped by hut location, worker count, and animal type.

## 0.2.3 - July 23, 2026

- Reopens Kingdom Chronicle automatically after a verified update finishes installing.
- Uses a durable update host so the restart survives the old app process closing.
- Clarifies that livestock totals include animals observed on loaded claimed land, with MineColonies assignments shown separately.
- Preserves the strict read-only Minecraft boundary and explicitly user-initiated verified updates.

## 0.2.2 - July 23, 2026

- Eliminates clipped or flickering menu text while the navigation drawer opens.
- Keeps the drawer structure mounted but inaccessible while closed, improving animation stability and assistive-technology behavior.
- Refines typography, contrast, spacing, loading punctuation, and compact-window readability throughout the desktop shell.
- Replaces the native bright menu scrollbar with a restrained themed treatment.
- Adds regression coverage for staged drawer text and compact navigation styling.
- Preserves the strict read-only Minecraft boundary and explicitly user-initiated verified updates.

## 0.2.1 - July 22, 2026

- Moves every colony destination and utility surface into one expandable top-left navigation menu.
- Replaces abbreviated Settings, Updates, and About controls with full labels and clear icons.
- Keeps the compact rail out of the way until the menu is opened, with backdrop, Escape-key, and selection dismissal.
- Repairs the durable Windows launcher and uninstall metadata after delayed Squirrel housekeeping.
- Preserves the strict read-only Minecraft boundary and explicitly user-initiated verified updates.

## 0.2.0 - July 21, 2026

- Rebuilds the desktop around a persistent application sidebar and a focused command bar.
- Gives Overview, Projects, Citizens, Buildings, Realm, and Records a clear product-level hierarchy.
- Moves reading depth, instance management, updates, version details, and privacy information into dedicated native-style surfaces.
- Adds polished startup, connection, unavailable-data, compact-window, focus, and reduced-motion states.
- Preserves the existing dashboard intelligence, local Bridge performance work, and strict read-only Minecraft boundary.
- Keeps update checks and verified installation explicitly user initiated.

## 0.1.8 - July 18, 2026

- Refreshes the desktop shortly after Colony Bridge replaces a local report, while retaining a slower fallback check.
- Debounces local filesystem activity and reuses freshly delivered state to avoid redundant report reads.
- Keeps large colony-stock searches responsive while filtering the full Detailed ledger.
- Replaces the stacked desktop status bars with one compact application toolbar.
- Gives the selected instance, Bridge state, report time, update action, and refresh action a clearer hierarchy.
- Refines desktop navigation, reading-depth controls, spacing, typography, loading states, and narrow-window behavior.
- Preserves the strict read-only Minecraft boundary and the existing verified, user-initiated update channel.

## 0.1.7 - July 18, 2026

- Replaces the opaque raid score breakdown with a transparent staffing-based readiness model.
- Uses a planning baseline of one available guard per five citizens, raised to at least the current estimated raid size.
- Prevents Hospitals and a favorable raid history from making a thin guard roster appear fully ready.
- Separates colony-wide guard coverage from the current guard-to-raider estimate.
- Shows guard availability, staffed defensive posts, recovery support, estimate confidence, and concrete staffing actions.
- States clearly that equipment, guard levels, tower layout, terrain, and combat odds are not available from the current snapshot.

## 0.1.6 - July 18, 2026

- Prevents an older or same-time report from the previous Minecraft instance remaining on screen after an instance change.
- Strengthens the schema-2 validation boundary for citizens, buildings, requests, construction, research, statistics, food, stock, and optional report sections.
- Keeps a valid colony available when another colony report in the same instance is malformed.
- Uses bounded reads for Bridge reports, settings, and cached data, and makes cache replacement recoverable.
- Keeps a valid live report visible when local cache or settings persistence fails.
- Shows all stock and statistics records in Detailed mode instead of silently stopping at 100 items.
- Replaces hard-coded colony, timezone, internal-version, closed-world, unknown-capacity, weather, raid, and local-receipt copy with report-derived wording.
- Improves updater timeout, semantic-version, cancellation, concurrency, symlink, and renderer-error handling.
- Adds stricter permission denial, safer fallback error rendering, clean lint coverage, and expanded regression tests.

## 0.1.5 - July 18, 2026

- Publishes the first release delivered through Kingdom Chronicle's verified in-app updater.
- Completes the 0.1.4 to 0.1.5 update-path validation release.
- Keeps update failures isolated from local Colony Bridge data.

## 0.1.4 - July 18, 2026

- Adds a complete download-and-install update workflow behind the existing Check for updates button.
- Accepts installers only from the pinned Kingdom Chronicle stable service.
- Verifies the declared size and SHA-256 digest before an installer can run.
- Shows download progress and asks before installation.
- Keeps local colony data available if the update service or download fails.

## 0.1.3 - July 17, 2026

- Correctly recognizes MineColonies Knights, Rangers, and Druids as guards.
- Recovers correct guard totals from detailed citizen records when an older Bridge summary reports zero.
- Bases raid readiness on actual defensive citizens instead of fabricating or losing guards from a mismatched summary.
- Replaces the misleading staffed-building percentage with a plain active-workplace count.
- Separates residents and linked couriers from actual workplace workers in building details.
- Adds regression coverage for legacy snapshots, injured guards, mismatched summaries, and building associations.

## 0.1.2 - July 17, 2026

- Adds a visible **Check for updates** button to the local connection bar.
- Checks only the pinned Kingdom Chronicle stable channel over HTTPS.
- Validates the update protocol, schema, semantic version, response size, and release links in the trusted main process.
- Rejects redirects, malformed responses, oversized responses, and non-HTTPS release links.
- Reports up-to-date, update-available, timeout, and service-error states without affecting local colony reports.
- Does not download or install anything automatically.

Update checks come from `https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-update`. A future release will connect the same trusted main-process boundary to signed Squirrel packages after signing and staged recovery tests are complete.

## 0.1.1 - July 17, 2026

This is the first deliberately versioned update from the installed 0.1.0 prototype.

### Reliability and safety

- Prevents two copies of Kingdom Chronicle from running at once.
- Validates cached reports before displaying them.
- Prevents a cached report from one Minecraft instance being shown for another.
- Retries Bridge files that change during a read and preserves the last complete report on failure.
- Rejects oversized, escaped, and symlinked Bridge inputs more consistently.
- Serializes overlapping refreshes and keeps invalid instance choices from discarding the current report.

### Experience

- Shows the installed app version in the local connection bar.
- Adds clearer refresh progress and failure explanations.
- Shows the report update time alongside the selected instance.
- Improves keyboard focus, reduced-motion behavior, and narrow-window layouts.
- Fixes mis-encoded loading text.

### Packaging

- Adds a production-only network policy that blocks renderer connections.
- Removes generated build output and TypeScript build metadata from source tracking.
- Expands desktop regression coverage from five to nine tests.

Automatic updating is not enabled in 0.1.1. The real-user 0.1.0 to 0.1.1 install, launch, single-instance, close, and relaunch path was verified on July 17, 2026. Settings and the last-known-good cache survived, the Start Menu shortcut targets the real root launcher, and Windows registered the 0.1.1 uninstaller correctly.
