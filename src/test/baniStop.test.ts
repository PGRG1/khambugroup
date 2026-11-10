import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/components/assistant/FloatingBani.tsx", "utf8");

describe("Bani can be stopped while it works", () => {
  it("swaps the send button for Stop while busy", () => {
    expect(src).toMatch(/\{busy\s*\? <Button[^>]*aria-label="Stop"[^>]*onClick=\{stopReply\}/);
  });
  it("Stop cancels the request in flight and frees the composer", () => {
    expect(src).toMatch(/const stopReply = \(\) => \{ abort\.current\?\.abort\(\); abort\.current = null; setBusy\(false\); \};/);
  });
});
