// Bani's one model layer. Every Bani chat and file turn goes through here.
// Primary: GPT-6 Astra on the Responses API with reasoning on (the same model the
// finance team, finance review, People and accounting functions already use).
// Backup: the setup Bani ran on until now (gpt-5.6-terra, Chat Completions, reasoning off),
// known to work with tools, used only when the primary fails.
// Callers keep the Chat Completions shape: they get back { role, content, tool_calls }.
// Pure helpers (no Deno imports) so the conversions are unit-tested in vitest.

export const BANI_MODEL = "openai/gpt-6-astra";
export const BANI_BACKUP_MODEL = "openai/gpt-5.6-terra";
export const BANI_REASONING = "low";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

type ChatTool = { type: string; function: { name: string; description?: string; parameters?: unknown } };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage = { role: string; content?: unknown; tool_calls?: ToolCall[]; tool_call_id?: string };
export type ModelReply = { ok: true; model: string; message: ChatMessage } | { ok: false; status: number; text: string };

/** Chat Completions tools to Responses tools. */
export function toResponsesTools(tools: ChatTool[] = []) {
  return tools.map((t) => ({ type: "function", name: t.function.name, description: t.function.description ?? "", parameters: t.function.parameters ?? { type: "object", properties: {} }, strict: false }));
}

/** Chat content parts (text, image_url, file) to Responses input parts. */
function toInputParts(content: unknown) {
  if (!Array.isArray(content)) return String(content ?? "");
  return content.map((p: any) => {
    if (p?.type === "image_url") return { type: "input_image", image_url: typeof p.image_url === "string" ? p.image_url : p.image_url?.url };
    if (p?.type === "file") return { type: "input_file", filename: p.file?.filename, file_data: p.file?.file_data };
    return { type: "input_text", text: String(p?.text ?? "") };
  });
}

/** Chat messages to Responses `instructions` + `input`. System notes become the instructions, in order. */
export function toResponsesInput(messages: ChatMessage[]) {
  const instructions: string[] = [];
  const input: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") { instructions.push(String(m.content ?? "")); continue; }
    if (m.role === "tool") { input.push({ type: "function_call_output", call_id: m.tool_call_id, output: String(m.content ?? "") }); continue; }
    if (m.role === "assistant") {
      if (typeof m.content === "string" && m.content.trim()) input.push({ role: "assistant", content: m.content });
      for (const tc of m.tool_calls ?? []) input.push({ type: "function_call", call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments || "{}" });
      continue;
    }
    input.push({ role: "user", content: toInputParts(m.content) });
  }
  return { instructions: instructions.join("\n\n"), input };
}

/** Responses output to one Chat Completions assistant message. Reasoning is not replayed (stateless, no stored items). */
export function fromResponsesOutput(data: any): ChatMessage | null {
  const out: any[] = Array.isArray(data?.output) ? data.output : [];
  if (!out.length) return null;
  const text = out.filter((o) => o?.type === "message").flatMap((o) => o.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text ?? "").join("");
  const calls: ToolCall[] = out.filter((o) => o?.type === "function_call").map((o) => ({ id: o.call_id, type: "function", function: { name: o.name, arguments: o.arguments || "{}" } }));
  if (!text && !calls.length) return null;
  return { role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (s: number) => s === 429 || (s >= 500 && s <= 599);

/** Ask Bani's model. Primary with retries, then the backup; same message shape either way. */
export async function askBani(key: string, req: { messages: ChatMessage[]; tools?: ChatTool[]; signal?: AbortSignal }): Promise<ModelReply> {
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" };
  const tools = req.tools?.length ? req.tools : undefined;
  let last: ModelReply = { ok: false, status: 0, text: "" };
  const { instructions, input } = toResponsesInput(req.messages);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${GATEWAY}/responses`, {
        method: "POST", headers, signal: req.signal,
        body: JSON.stringify({ model: BANI_MODEL, instructions, input, store: false, reasoning: { effort: BANI_REASONING }, ...(tools ? { tools: toResponsesTools(tools), tool_choice: "auto" } : {}) }),
      });
      if (r.ok) {
        const message = fromResponsesOutput(await r.json().catch(() => null));
        if (message) return { ok: true, model: BANI_MODEL, message };
        last = { ok: false, status: 502, text: "Empty reply from the primary model" };
        break;
      }
      last = { ok: false, status: r.status, text: await r.text().catch(() => "") };
      console.warn("Bani primary model failed", r.status, last.text.slice(0, 300));
      if (r.status === 402 || !retryable(r.status)) break;
      if (attempt === 0) await sleep(Number(r.headers.get("Retry-After")) * 1000 || 700);
    } catch (e) {
      if (req.signal?.aborted) throw e;
      last = { ok: false, status: 502, text: e instanceof Error ? e.message : "Network error" };
    }
  }
  if (last.ok === false && last.status === 402) return last; // out of credits: the backup would fail too
  try {
    const r = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST", headers, signal: req.signal,
      body: JSON.stringify({ model: BANI_BACKUP_MODEL, messages: req.messages, reasoning_effort: "none", ...(tools ? { tools, tool_choice: "auto" } : {}) }),
    });
    if (!r.ok) return { ok: false, status: r.status, text: await r.text().catch(() => "") };
    const message = (await r.json().catch(() => null))?.choices?.[0]?.message;
    return message ? { ok: true, model: BANI_BACKUP_MODEL, message } : { ok: false, status: 502, text: "Empty reply from the backup model" };
  } catch (e) {
    if (req.signal?.aborted) throw e;
    return last.ok === false && last.status ? last : { ok: false, status: 502, text: e instanceof Error ? e.message : "Network error" };
  }
}
