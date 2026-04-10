import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { event, data } = body;

    // Verify webhook secret
    const webhookSecret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET");
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (event) {
      case "qr": {
        // QR code received from Baileys
        const { qr_code, session_name = "default" } = data;

        // Upsert session with QR code
        const { data: existing } = await supabase
          .from("whatsapp_sessions")
          .select("id")
          .eq("session_name", session_name)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("whatsapp_sessions")
            .update({ qr_code, status: "qr_ready" })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("whatsapp_sessions")
            .insert({ session_name, qr_code, status: "qr_ready" });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "connected": {
        // WhatsApp connected successfully
        const { session_name = "default", phone_number } = data;

        await supabase
          .from("whatsapp_sessions")
          .update({
            status: "connected",
            phone_number,
            qr_code: null,
            connected_at: new Date().toISOString(),
          })
          .eq("session_name", session_name);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnected": {
        const { session_name = "default" } = data;

        await supabase
          .from("whatsapp_sessions")
          .update({ status: "disconnected", qr_code: null, phone_number: null })
          .eq("session_name", session_name);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "message": {
        // New message received from WhatsApp
        const { phone_number, contact_name, content, media_url } = data;

        // Find or create conversation
        let { data: conversation } = await supabase
          .from("whatsapp_conversations")
          .select("id")
          .eq("phone_number", phone_number)
          .maybeSingle();

        if (!conversation) {
          const { data: newConv } = await supabase
            .from("whatsapp_conversations")
            .insert({
              phone_number,
              contact_name: contact_name || phone_number,
              last_message: content,
              last_message_at: new Date().toISOString(),
              unread_count: 1,
            })
            .select("id")
            .single();
          conversation = newConv;
        } else {
          await supabase
            .from("whatsapp_conversations")
            .update({
              contact_name: contact_name || undefined,
              last_message: content,
              last_message_at: new Date().toISOString(),
              unread_count: supabase.rpc ? 1 : 1, // increment handled below
            })
            .eq("id", conversation.id);
        }

        if (conversation) {
          await supabase.from("whatsapp_messages").insert({
            conversation_id: conversation.id,
            content,
            sender: "customer",
            media_url: media_url || null,
            is_ai_response: false,
          });
        }

        return new Response(JSON.stringify({ success: true, conversation_id: conversation?.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown event" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
