import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

/**
 * Old per-feature Bank Recon "Rules" tab is retired.
 * All learned rules now live in the unified AI Learned Rules admin page.
 */
export function RulesTab() {
  return (
    <Card className="card-glass">
      <CardContent className="p-8 text-center space-y-3">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-semibold">Bank Recon rules moved</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Rules are now managed centrally under <span className="font-medium">Admin → AI Learned Rules</span>.
          Every accepted &amp; taught classification automatically becomes a tenant-scoped rule there.
        </p>
        <Button asChild>
          <Link to="/admin/ai-rules" className="inline-flex items-center gap-2">
            Open AI Learned Rules <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
