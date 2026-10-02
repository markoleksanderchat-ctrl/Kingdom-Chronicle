import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("shortcut backup verification works without PowerShell's hash module", { skip: process.platform !== "win32" }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chronicle-shortcut-hash-"));
  try {
    const original = path.join(directory, "original.lnk");
    const backup = path.join(directory, "backup.lnk");
    const payload = Buffer.from("Chronicle shortcut backup regression\0\xff", "latin1");
    writeFileSync(original, payload);
    writeFileSync(backup, payload);
    const script = path.resolve("scripts/Finalize-LegacyMigration.ps1");
    // Extract only the real hashing function, without running installation cleanup.
    const source = `
$ErrorActionPreference = 'Stop'
$env:PSModulePath = $env:CHRONICLE_HASH_MODULE_PATH
$PSModuleAutoLoadingPreference = 'None'
Remove-Module Microsoft.PowerShell.Utility -ErrorAction SilentlyContinue
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($env:CHRONICLE_HASH_SCRIPT, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Invalid migration script' }
$function = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-ShortcutSha256' }, $true)
if (!$function) { throw 'Hash helper missing' }
. ([scriptblock]::Create($function.Extent.Text))
if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) { throw 'Regression environment still has Get-FileHash' }
$original = Get-ShortcutSha256 $env:CHRONICLE_HASH_ORIGINAL
if ($original -ne (Get-ShortcutSha256 $env:CHRONICLE_HASH_BACKUP)) { throw 'Identical backup rejected' }
[IO.File]::AppendAllText($env:CHRONICLE_HASH_BACKUP, 'changed')
if ($original -eq (Get-ShortcutSha256 $env:CHRONICLE_HASH_BACKUP)) { throw 'Changed backup accepted' }
[Console]::WriteLine($original)
`;
    const result = spawnSync(path.join(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64")], {
        encoding: "utf8", windowsHide: true, timeout: 15_000,
        env: { ...process.env, CHRONICLE_HASH_MODULE_PATH: directory, CHRONICLE_HASH_SCRIPT: script, CHRONICLE_HASH_ORIGINAL: original, CHRONICLE_HASH_BACKUP: backup },
      });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.equal(result.stdout.trim(), createHash("sha256").update(payload).digest("hex").toUpperCase());
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
