import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/** Shown to a signed-in user who belongs to no business. Renders no data. */
export function NoBusinessScreen({ email }: { email?: string | null }) {
  const [invited, setInvited] = useState(false);
  const setupHref = `mailto:hello@usebani.com?subject=${encodeURIComponent("Set up my business on Bani")}&body=${encodeURIComponent(`Please set up a business for ${email ?? "me"}.`)}`;
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="card-glass max-w-md w-full rounded-2xl p-8 text-center space-y-5">
        <h1 className="font-display text-2xl text-foreground">You're not part of a business on Bani yet</h1>
        <p className="text-sm text-muted-foreground">Signed in as {email}. Choose what fits you.</p>
        <div className="flex flex-col gap-3">
          <Button asChild><a href={setupHref}>Set up my business</a></Button>
          <Button variant="outline" onClick={() => setInvited(true)}>I was invited</Button>
        </div>
        {invited && (
          <p className="text-sm text-muted-foreground" role="status">
            Ask the owner of your business to resend the invite to {email}. Once they add you, sign in again.
          </p>
        )}
        <button className="text-xs text-muted-foreground underline" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </main>
  );
}
