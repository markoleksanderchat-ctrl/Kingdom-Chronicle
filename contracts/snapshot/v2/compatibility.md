# Snapshot schema 2 compatibility

The producer protocol is `com.colonybridge.snapshot`, transported through local files with output layout `1` and `readOnly: true`.

Existing fields retain names, meanings, nullability, ordering guarantees where visible, and fingerprint behavior. Consumers accept additive unknown fields. A breaking removal, rename, type narrowing, or semantic change requires a new schema version.

Canonical validation uses `schema.json`. Required properties are those emitted by the current Java records; the five optional top-level sections (`livestock`, `recentStatistics`, `defenseStatistics`, `foodSupply`, and `stockLedger`) remain optional so existing schema-2 reports stay readable. Objects allow additive unknown properties.

Normalized equivalence removes only the top-level `/generatedAt`, `/trigger`, `/bridgeVersion`, and `/fingerprint` values. It does not ignore same-named nested fields, array ordering, nullability, or any domain value. Fingerprints are recomputed after serialization and are compared separately by Bridge tests.

Fixtures contain synthetic identities and paths. `normal`, `minimal`, `degraded`, `shutdown`, `large-citizen`, `large-stock`, and `maximum-bounded` characterize current consumer behavior; they are not fabricated historical observations.
