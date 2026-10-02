# Repository rules

- Preserve protocol `com.colonybridge.snapshot`, schema `2`, layout `1`, filesystem transport, and `readOnly: true`.
- Minecraft may read the public Royal Exchange feed but must never write gameplay or market state back.
- Keep the Bridge and Chronicle independently buildable.
- Do not install, publish, replace the live mod JAR, or touch Minecraft saves from repository tooling.
- Keep file moves separate from behavior changes and run the relevant verification scope after each change.

