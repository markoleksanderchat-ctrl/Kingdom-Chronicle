# Field ownership

- Bridge models own serialized field names and nullability.
- MineColonies collectors own observed colony values and scoped issues.
- Export code owns `generatedAt`, `trigger`, `fingerprint`, storage layout, and retention.
- Chronicle validates and presents snapshots but does not rewrite producer data.
- Owner UUIDs, citizen positions, and machine paths are sensitive and must not appear in committed fixtures.

`field-classification.json` is the machine-checked policy. The contract checker walks every property in `schema.json` and classifies it as required or optional, nullable or non-nullable, additive-context or closed-context, and bounded or unbounded. Policy rules additionally mark sensitive and locally derived paths. A newly added schema property fails the coverage floor or policy checks until it participates in this classification pass.

Bounds protect file size, arrays, strings, and dynamic maps without narrowing valid additive fields. Runtime file limits remain 1,000,000 bytes for snapshots, 64,000 bytes for bridge-info, and 64 entries in `latestFiles`.
