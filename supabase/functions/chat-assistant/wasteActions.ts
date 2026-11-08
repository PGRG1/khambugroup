// Waste logging through a Bani confirmation card. Proposal validates venue, item
// and quantity server-side; Confirm inserts one waste entry as the signed-in user (RLS).
export const WASTE_REASONS = ["Spoilage", "Expiry", "Breakage", "Quality", "Over-prep", "Other"];

export const memoryTool = {
  type: "function",
  function: {
    name: "save_memory_note",
    description: "Remember one lasting fact, habit or preference the user told you about their business, so future chats already know it. One short sentence. Use venue only when the fact is about one venue.",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "One short sentence, 3-240 characters." },
        venue: { type: "string", description: "Venue name exactly as stored, only if the fact is about one venue." },
      },
      required: ["note"],
    },
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function proposeWaste(args: any, admin: any, tenantId: string) {
  const venueName = typeof args.venue === "string" ? args.venue.trim() : "";
  const item = typeof args.item === "string" ? args.item.trim().slice(0, 200) : "";
  const quantity = Number(args.quantity);
  if (!venueName || !item || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000)
    return { ok: false, error: "log_waste needs a venue, an item and a quantity above zero. Ask only for what is missing." };
  const { data: venues } = await admin.from("venues").select("name").eq("tenant_id", tenantId).eq("is_active", true);
  const venue = (venues ?? []).find((v: any) => v.name.toLowerCase() === venueName.toLowerCase());
  if (!venue) return { ok: false, error: `No venue called ${venueName}.`, venues: (venues ?? []).map((v: any) => v.name) };
  const reason = WASTE_REASONS.find((r) => r.toLowerCase() === String(args.reason ?? "").trim().toLowerCase()) ?? "Other";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
  const date = typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date) && args.date <= today ? args.date : today;
  const { data: products } = await admin.from("product_master")
    .select("id,internal_sku,internal_product_name,stock_uom,unit,cost_per_stock_unit,unit_cost,status")
    .eq("tenant_id", tenantId).ilike("internal_product_name", `%${item.replace(/[%_]/g, "")}%`).limit(8);
  const wanted = norm(item);
  const list = ((products ?? []) as any[]).filter((p) => p.status !== "inactive");
  const product = list.find((p) => norm(p.internal_product_name ?? "") === wanted) ?? (list.length === 1 ? list[0] : null);
  if (!product && list.length > 1)
    return { ok: false, needs_choice: true, candidates: list.map((p) => p.internal_product_name), note: "Several items match. Offer these names as suggest_replies chips and propose again with the chosen one." };
  const uom = (typeof args.uom === "string" && args.uom.trim()) || product?.stock_uom || product?.unit || null;
  const unitCost = Number(product?.cost_per_stock_unit ?? product?.unit_cost ?? 0) || 0;
  const payload = {
    venue: venue.name, entry_date: date, reason, quantity, uom,
    product_master_id: product?.id ?? null, sku: product?.internal_sku ?? null,
    description: product?.internal_product_name ?? item, unit_cost: unitCost,
    notes: typeof args.note === "string" ? args.note.slice(0, 300) : null,
  };
  const title = `Log waste: ${quantity}${uom ? ` ${uom}` : ""} ${payload.description} · ${venue.name}`.slice(0, 200);
  const detail = `${reason} on ${date}${unitCost ? ` · about HK$ ${(quantity * unitCost).toFixed(2)} at latest cost` : " · no cost on file"}${product ? "" : " · not linked to a stock item"}`;
  return { ok: true, payload, title, detail };
}

export async function confirmWaste(p: any, userClient: any, tenantId: string, userId: string) {
  const { error } = await userClient.from("inventory_movements_waste").insert({
    tenant_id: tenantId, created_by: userId, entry_type: "waste",
    venue: p.venue, entry_date: p.entry_date, reason: p.reason, quantity: p.quantity, uom: p.uom,
    product_master_id: p.product_master_id, sku: p.sku, description: p.description, unit_cost: p.unit_cost, notes: p.notes,
  });
  if (error) return { status: 403, body: { error: "You don't have permission to log waste here, or saving failed." } };
  return { status: 200, body: { ok: true, message: `Logged — ${p.quantity}${p.uom ? ` ${p.uom}` : ""} ${p.description} as waste at ${p.venue}.` } };
}
