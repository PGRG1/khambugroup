import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon } from "lucide-react";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useState } from "react";

/** "Notifications on this phone" switch row, shared by UserMenu and the sidebar account menu. */
export const PushNotificationsRow = () => {
  const push = usePushSubscription();
  const [error,setError] = useState('');
  return <>
    <div className="flex items-center justify-between gap-3 px-2 py-2 text-sm"><span>Notifications on this phone</span><Switch aria-label="Notifications on this phone" checked={push.status==='subscribed'} disabled={push.busy||push.status==='unsupported'||push.status==='denied'} onCheckedChange={on=>{setError('');void (on?push.subscribe():push.unsubscribe()).catch(()=>setError('Could not change phone notifications.'));}} /></div>
    {error&&<p role="alert" className="px-2 text-xs text-destructive">{error}</p>}
  </>;
};

export const UserMenu = () => {
  const { user, signOut } = useAuth();

  if (!user) return null;
  const initials = (user.email || "?").slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost"
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          aria-label="User menu"
        >
          {initials}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Workspace
        </DropdownMenuLabel>
        <TenantSwitcher />
        <DropdownMenuSeparator />
        <PushNotificationsRow />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} className="text-sm">
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
