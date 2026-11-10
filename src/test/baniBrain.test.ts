import { afterEach, describe, expect, it, vi } from "vitest";
import { askBani, BANI_BACKUP_MODEL, BANI_MODEL, fromResponsesOutput, toResponsesInput, toResponsesTools } from "../../supabase/functions/_shared/baniBrain";

const tool = { type: "function", function: { name: "get_open_items", description: "What needs you", parameters: { type: "object", properties: {} } } };

describe("Bani model layer: conversions", () => {
  it("turns system notes into instructions and keeps the tool round trip", () => {
    const { instructions, input } = toResponsesInput([
      { role: "system", content: "Be brief." },
      { role: "system", content: "Use real numbers." },
      { role: "user", content: "What needs me?" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_open_items", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_1", content: '{"items":[]}' },
    ]);
    expect(instructions).toBe("Be brief.\n\nUse real numbers.");
    expect(input).toEqual([
      { role: "user", content: "What needs me?" },
      { type: "function_call", call_id: "call_1", name: "get_open_items", arguments: "{}" },
      { type: "function_call_output", call_id: "call_1", output: '{"items":[]}' },
    ]);
  });
  it("passes images and PDFs through as input parts", () => {
    const { input } = toResponsesInput([{ role: "user", content: [
      { type: "text", text: "Read this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AA" } },
      { type: "file", file: { filename: "inv.pdf", file_data: "data:application/pdf;base64,BB" } },
    ] }]);
    expect(input).toEqual([{ role: "user", content: [
      { type: "input_text", text: "Read this" },
      { type: "input_image", image_url: "data:image/png;base64,AA" },
      { type: "input_file", filename: "inv.pdf", file_data: "data:application/pdf;base64,BB" },
    ] }]);
  });
  it("converts tools and replies", () => {
    expect(toResponsesTools([tool])[0]).toMatchObject({ type: "function", name: "get_open_items", strict: false });
    expect(fromResponsesOutput({ output: [
      { type: "reasoning", id: "rs_1", summary: [] },
      { type: "function_call", call_id: "call_9", name: "get_open_items", arguments: "{}" },
    ] })).toEqual({ role: "assistant", content: null, tool_calls: [{ id: "call_9", type: "function", function: { name: "get_open_items", arguments: "{}" } }] });
    expect(fromResponsesOutput({ output: [{ type: "message", content: [{ type: "output_text", text: "Four things need you." }] }] }))
      .toEqual({ role: "assistant", content: "Four things need you." });
    expect(fromResponsesOutput({ output: [{ type: "reasoning", summary: [] }] })).toBeNull();
  });
});

describe("Bani model layer: primary, then backup", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const fail = (status: number) => new Response(JSON.stringify({ error: { message: "nope" } }), { status });

  it("uses GPT-6 Astra with reasoning on, tools included", async () => {
    const fetchMock = vi.fn(async () => ok({ output: [{ type: "message", content: [{ type: "output_text", text: "Hi" }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await askBani("k", { messages: [{ role: "user", content: "hello" }], tools: [tool] });
    expect(r).toEqual({ ok: true, model: BANI_MODEL, message: { role: "assistant", content: "Hi" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body));
    expect(url).toMatch(/\/responses$/);
    expect(sent).toMatchObject({ model: BANI_MODEL, reasoning: { effort: "low" }, store: false, tool_choice: "auto" });
    expect(sent.tools[0].name).toBe("get_open_items");
  });
  it("falls back to the previous setup when the primary keeps failing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok({ choices: [{ message: { role: "assistant", content: "Backup answer" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await askBani("k", { messages: [{ role: "user", content: "hello" }] });
    expect(r).toEqual({ ok: true, model: BANI_BACKUP_MODEL, message: { role: "assistant", content: "Backup answer" } });
    expect(String(fetchMock.mock.calls[2][0])).toMatch(/\/chat\/completions$/);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1].body)).model).toBe(BANI_BACKUP_MODEL);
  }, 10_000);
  it("falls back when the primary rejects the request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(400)).mockResolvedValueOnce(ok({ choices: [{ message: { role: "assistant", content: "B" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await askBani("k", { messages: [{ role: "user", content: "x" }] })).toMatchObject({ ok: true, model: BANI_BACKUP_MODEL });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("stops when credits run out instead of trying the backup", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(402));
    vi.stubGlobal("fetch", fetchMock);
    expect(await askBani("k", { messages: [{ role: "user", content: "x" }] })).toMatchObject({ ok: false, status: 402 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
