import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POSITIONS, type UserPosition } from "@/utils/permissions";
import { toast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/hooks/useActiveTenant";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** Explicit tenant override. Falls back to the caller's active tenant. */
  tenantId?: string;
}

export function CreateUserDialog({ open, onOpenChange, onCreated, tenantId }: Props) {
  const { tenantId: activeTenantId } = useActiveTenant();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState<UserPosition>("viewer");
  const [loading, setLoading] = useState(false);

  const targetTenantId = tenantId || activeTenantId || undefined;

  const handleCreate = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("create-user", {
        body: { email, displayName, position, tenant_id: targetTenantId },
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: "User created", description: `${email} has been created. A password reset email will be sent.` });
      setEmail("");
      setDisplayName("");
      setPosition("viewer");
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Position</label>
            <Select value={position} onValueChange={v => setPosition(v as UserPosition)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POSITIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={loading || !email} className="w-full">
            {loading ? "Creating..." : "Create User & Send Reset Email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
