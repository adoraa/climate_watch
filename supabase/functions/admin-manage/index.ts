import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Service role client — for all DB/auth admin operations
  const serviceClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Anon client with user's token — for verifying who is calling
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    console.error("Auth verification failed:", authError?.message);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Verify admin
  const { data: org } = await serviceClient
    .from("organizations")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!org?.is_admin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { action, payload } = await req.json();

  if (action === "create_org") {
    const { data: newUser, error: createErr } = await serviceClient.auth.admin.createUser({
      email: payload.email, password: payload.password, email_confirm: true
    });
    if (createErr) return respond(400, { error: createErr.message }, corsHeaders);
    const { error: insertErr } = await serviceClient.from("organizations").insert({
      id: newUser.user.id, username: payload.username, name: payload.name,
      region: payload.region, station_id: payload.station_id,
      coordinates: payload.coordinates, is_admin: false
    });
    if (insertErr) return respond(400, { error: insertErr.message }, corsHeaders);
    return respond(200, { success: true, id: newUser.user.id }, corsHeaders);
  }

  if (action === "list_orgs") {
    const { data, error } = await serviceClient
      .from("organizations")
      .select("*, weather_entries(count)")
      .eq("is_admin", false)
      .order("created_at", { ascending: false });
    if (error) return respond(400, { error: error.message }, corsHeaders);
    return respond(200, { orgs: data }, corsHeaders);
  }

  if (action === "list_entries") {
    const { data, error } = await serviceClient
      .from("weather_entries").select("*")
      .eq("org_id", payload.org_id).order("date", { ascending: false });
    if (error) return respond(400, { error: error.message }, corsHeaders);
    return respond(200, { entries: data }, corsHeaders);
  }

  if (action === "update_org") {
    const { error } = await serviceClient.from("organizations").update({
      name: payload.name, username: payload.username, region: payload.region,
      station_id: payload.station_id, coordinates: payload.coordinates
    }).eq("id", payload.id);
    if (error) return respond(400, { error: error.message }, corsHeaders);
    return respond(200, { success: true }, corsHeaders);
  }

  if (action === "delete_org") {
    await serviceClient.from("weather_entries").delete().eq("org_id", payload.id);
    await serviceClient.from("organizations").delete().eq("id", payload.id);
    const { error } = await serviceClient.auth.admin.deleteUser(payload.id);
    if (error) return respond(400, { error: error.message }, corsHeaders);
    return respond(200, { success: true }, corsHeaders);
  }

  if (action === "delete_entry") {
    const { error } = await serviceClient.from("weather_entries").delete().eq("id", payload.id);
    if (error) return respond(400, { error: error.message }, corsHeaders);
    return respond(200, { success: true }, corsHeaders);
  }

  if (action === "reset_password") {
    const { error } = await serviceClient.auth.admin.updateUserById(payload.id, {
      password: payload.new_password
    });
    if (error) return respond(400, { error: error.message }, corsHeaders);
    return respond(200, { success: true }, corsHeaders);
  }

  return respond(400, { error: "Unknown action" }, corsHeaders);
});

function respond(status: number, body: object, headers: object) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...headers, "Content-Type": "application/json" }
  });
}