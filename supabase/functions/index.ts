import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // Meta verification
  if (mode === "subscribe" && token === "my_verify_token_123") {
    return new Response(challenge, { status: 200 });
  }

  const body = await req.json().catch(() => ({}));

  console.log("Webhook received:", body);

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});