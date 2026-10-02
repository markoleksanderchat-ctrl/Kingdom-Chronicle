import assert from "node:assert/strict";
import test from "node:test";
import { checkForDesktopUpdate, DESKTOP_UPDATE_MANIFEST_URL } from "../src/update-check";

const manifest = (version: string) => ({
  protocolId: "com.kingdomchronicle.desktop-update",
  schemaVersion: 2,
  channel: "stable",
  latest: {
    version,
    releasedAt: "2026-07-17T22:00:00.000Z",
    summary: "A tested Kingdom Chronicle desktop release.",
    downloadUrl: "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-release",
    releaseNotesUrl: "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-release-notes",
    sizeBytes: 143_000_000,
    sha256: "a".repeat(64),
  },
});

test("update check uses only the pinned stable-channel endpoint", async () => {
  let requestedUrl = "";
  const result = await checkForDesktopUpdate("0.1.2", async (url, init) => {
    requestedUrl = url;
    assert.equal(init.redirect, "error");
    return Response.json(manifest("0.1.2"));
  });
  assert.equal(requestedUrl, DESKTOP_UPDATE_MANIFEST_URL);
  assert.equal(result.status, "up-to-date");
});

test("update check reports a newer pinned stable release", async () => {
  const result = await checkForDesktopUpdate("0.1.2", async () => Response.json(manifest("0.1.3")));
  assert.equal(result.status, "available");
  if (result.status === "available") assert.equal(result.latestVersion, "0.1.3");
});

test("update check rejects unpinned download hosts", async () => {
  const unsafe = manifest("0.1.4");
  unsafe.latest.downloadUrl = "https://example.com/KingdomChronicle.exe";
  const result = await checkForDesktopUpdate("0.1.3", async () => Response.json(unsafe));
  assert.equal(result.status, "error");
});

test("update check rejects malformed and oversized responses", async () => {
  const malformed = await checkForDesktopUpdate("0.1.2", async () => Response.json({ version: "99.0.0" }));
  assert.equal(malformed.status, "error");
  const oversized = await checkForDesktopUpdate("0.1.2", async () => new Response("x".repeat(64_001)));
  assert.equal(oversized.status, "error");
});

test("update check rejects unsafe version numbers and blank summaries", async () => {
  const unsafeVersion = await checkForDesktopUpdate("0.1.5", async () => Response.json(manifest("9007199254740992.1.0")));
  assert.equal(unsafeVersion.status, "error");
  const blankSummary = manifest("0.1.6");
  blankSummary.latest.summary = "   ";
  const blank = await checkForDesktopUpdate("0.1.5", async () => Response.json(blankSummary));
  assert.equal(blank.status, "error");
});

test("update timeout covers a stalled response body", async () => {
  const result = await checkForDesktopUpdate("0.1.5", async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
    },
  })), new Date(), 5);
  assert.equal(result.status, "error");
  if (result.status === "error") assert.match(result.message, /timed out/i);
});
