import { useState, useEffect } from "react";
import { getVenueSeatingConfig, setVenueSeatingConfig } from "@/constants/venueSeating";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Armchair } from "lucide-react";

interface VenueSeatingEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venues: string[];
  onSave: () => void;
}

const VenueSeatingEditor = ({ open, onOpenChange, venues, onSave }: VenueSeatingEditorProps) => {
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const current = getVenueSeatingConfig();
      const mapped: Record<string, string> = {};
      venues.filter(v => v !== "All Venues" && v !== "Events").forEach(v => {
        mapped[v] = current[v]?.toString() || "";
      });
      setConfig(mapped);
    }
  }, [open, venues]);

  const handleSave = () => {
    const numericConfig: Record<string, number> = {};
    Object.entries(config).forEach(([venue, val]) => {
      const num = parseInt(val);
      if (num > 0) numericConfig[venue] = num;
    });
    setVenueSeatingConfig(numericConfig);
    toast({ title: "Seating updated" });
    onSave();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Armchair className="h-4 w-4" />
            Venue Seating
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {Object.entries(config).map(([venue, val]) => (
            <div key={venue} className="flex items-center gap-3">
              <Label className="w-24 text-sm">{venue}</Label>
              <Input
                type="number"
                min={0}
                value={val}
                onChange={(e) => setConfig(prev => ({ ...prev, [venue]: e.target.value }))}
                placeholder="Seats"
                className="w-24 h-8 text-sm"
              />
            </div>
          ))}
          <button
            onClick={handleSave}
            className="w-full px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VenueSeatingEditor;
