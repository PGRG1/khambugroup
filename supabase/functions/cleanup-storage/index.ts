import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Use service role for admin operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bucket = "invoice-files";

    // Get all referenced file_urls from invoices
    const { data: invoices } = await adminClient
      .from("invoices")
      .select("file_url")
      .not("file_url", "is", null);

    const referencedFiles = new Set(
      (invoices || []).map((inv: any) => inv.file_url).filter(Boolean)
    );

    // List all files in the bucket (handle pagination)
    const allFiles: string[] = [];
    const folders: string[] = [];

    // First list top-level folders
    const { data: topLevel } = await adminClient.storage.from(bucket).list("", { limit: 1000 });
    if (topLevel) {
      for (const item of topLevel) {
        if (item.id === null) {
          // It's a folder
          folders.push(item.name);
        } else {
          allFiles.push(item.name);
        }
      }
    }

    // List files inside each folder
    for (const folder of folders) {
      const { data: folderFiles } = await adminClient.storage
        .from(bucket)
        .list(folder, { limit: 1000 });
      if (folderFiles) {
        for (const f of folderFiles) {
          if (f.id !== null) {
            allFiles.push(`${folder}/${f.name}`);
          }
        }
      }
    }

    // Find orphaned files
    const orphaned = allFiles.filter((path) => !referencedFiles.has(path));

    if (orphaned.length === 0) {
      return new Response(
        JSON.stringify({ deleted: 0, message: "No orphaned files found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete orphaned files in batches of 100
    let totalDeleted = 0;
    for (let i = 0; i < orphaned.length; i += 100) {
      const batch = orphaned.slice(i, i + 100);
      const { error } = await adminClient.storage.from(bucket).remove(batch);
      if (!error) totalDeleted += batch.length;
    }

    return new Response(
      JSON.stringify({
        deleted: totalDeleted,
        kept: allFiles.length - totalDeleted,
        referenced: referencedFiles.size,
        orphanedPaths: orphaned,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
