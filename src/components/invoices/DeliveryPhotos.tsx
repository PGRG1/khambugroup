import { useEffect, useState } from "react";
import { loadDeliveryPhotos } from "@/utils/deliveryPhotos";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });

/** Invoice detail: the optional photos of what arrived, read-only. Shows nothing when there are none. */
export function DeliveryPhotos({ tenantId, invoiceId }: { tenantId: string | null | undefined; invoiceId: string }) {
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof loadDeliveryPhotos>>>([]);
  useEffect(() => {
    let active = true;
    setPhotos([]);
    if (tenantId) void loadDeliveryPhotos(tenantId, invoiceId).then(p => { if (active) setPhotos(p); });
    return () => { active = false; };
  }, [tenantId, invoiceId]);
  if (!photos.length) return null;
  const first = photos[0];
  return <div className="space-y-2">
    <p className="whitespace-nowrap text-[12px] text-muted-foreground">Delivery photos · taken {when(first.taken_at)}{first.taken_by_name ? ` by ${first.taken_by_name}` : ""}</p>
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open delivery photo ${i + 1}`}>
        <img src={p.url} alt={`Delivery photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
      </a>)}
    </div>
  </div>;
}
