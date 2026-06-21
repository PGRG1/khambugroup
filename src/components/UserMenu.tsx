import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Monitor, LogOut, User as UserIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TenantSwitcher } from "@/components/TenantSwitcher";

export const UserMenu = () => {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  if (!user) return null;
  const initials = (user.email || "?").slice(0, 2).toUpperCase();

  const Item = ({ value, label, Icon }: { value: "light" | "dark" | "system"; label: string; Icon: typeof Sun }) => (
    <button
      type="button"
      onClick={() => setTheme(value)}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        theme === value && "text-primary"
      )}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {theme === value && <Check className="h-3.5 w-3.5" />}
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          aria-label="User menu"
        >
          {initials}
        </button>
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
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <div className="px-1 pb-1 space-y-0.5">
          <Item value="light" label="Light" Icon={Sun} />
          <Item value="dark" label="Dark" Icon={Moon} />
          <Item value="system" label="System" Icon={Monitor} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} className="text-sm">
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
