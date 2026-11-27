import { supabase } from "@/integrations/supabase/client";

const BUCKET = "chat-files";
const safe = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";

/** Keep files sent to Bani so they open again later. Private to this person and client. Returns name → stored path. */
export async function keepChatFiles(tenantId: string, userId: string, files: File[]): Promise<Record<string, string>> {
  const refs: Record<string, string> = {};
  await Promise.all(files.map(async f => {
    const path = `${tenantId}/${userId}/${crypto.randomUUID()}/${safe(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (!error) refs[f.name] = path;
  }));
  return refs;
}

/** A kept chat file, opened again. Null if it can't be read (not yours, or removed). */
export async function openChatFile(path: string, name: string): Promise<File | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  return error || !data ? null : new File([data], name, { type: data.type });
}
