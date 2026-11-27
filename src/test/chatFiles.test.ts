import { describe, it, expect, vi } from "vitest";
const upload = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ upload, download: async () => ({ data: new Blob(["x"], { type: "application/pdf" }), error: null }) }) } } }));
import { keepChatFiles, openChatFile } from "@/utils/chatFiles";

describe("chat files", () => {
  it("keeps each file under the client and person, never shared", async () => {
    const refs = await keepChatFiles("t1", "u1", [new File(["a"], "SI-53576.pdf", { type: "application/pdf" })]);
    expect(refs["SI-53576.pdf"]).toMatch(/^t1\/u1\/[0-9a-f-]{36}\/SI-53576\.pdf$/);
  });
  it("opens a kept file with its name", async () => {
    const f = await openChatFile("t1/u1/x/SI-53576.pdf", "SI-53576.pdf");
    expect(f?.name).toBe("SI-53576.pdf");
  });
});
