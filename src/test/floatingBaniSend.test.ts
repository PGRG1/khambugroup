// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Execute the actual send initialization so an incorrectly attached else regresses this test.
const source = readFileSync('src/components/assistant/FloatingBani.tsx', 'utf8');
const start = source.indexOf('    if (!turn?.hidden) setMessages', source.indexOf('  const send = async'));
const end = source.indexOf('    if (attached.length) {\n      setLastFiles', start);
if (start < 0 || end < 0) throw new Error('Cannot locate send message initialization');
type Message = { role: string; content: string; files?: string[] };
async function initialize(fresh: boolean, hidden: boolean, hasFile = false) {
  let messages: Message[] = [{ role: 'assistant', content: 'Earlier conversation' }];
  let uploads = 0;
  const setMessages = (update: Message[] | ((prev: Message[]) => Message[])) => {
    messages = typeof update === 'function' ? update(messages) : update;
  };
  const run = new Function('turn', 'fresh', 'setMessages', 'typed', 'sentNames', 'attached', 'tenantId', 'user', 'keepChatFiles', source.slice(start, end));
  run({ hidden }, fresh, setMessages, 'What needs attention?', hasFile ? ['bill.pdf'] : [], hasFile ? [{ file: {} }] : [], 'qa', { id: 'qa' }, async () => { uploads++; return {}; });
  await Promise.resolve();
  return { messages, uploads };
}
describe('Floating Bani send initialization', () => {
  it('keeps a fresh Home question without an attachment alongside the answer', async () => {
    const { messages, uploads } = await initialize(true, false);
    messages.push({ role: 'assistant', content: 'Your answer' });
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('What needs attention?');
    expect(uploads).toBe(0);
  });
  it('keeps earlier conversation on a follow-up without attachments', async () => {
    expect((await initialize(false, false)).messages.map(m => m.role)).toEqual(['assistant', 'user']);
  });
  it('stores attachments without erasing the fresh question', async () => {
    const result = await initialize(true, false, true);
    expect(result.messages.map(m => m.role)).toEqual(['user']);
    expect(result.uploads).toBe(1);
  });
  it('clears a hidden fresh turn without uploading files', async () => {
    const result = await initialize(true, true, true);
    expect(result.messages).toEqual([]);
    expect(result.uploads).toBe(0);
  });
});