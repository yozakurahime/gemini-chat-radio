import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
        const { qr_code, session_name = "default" } = data;
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
        const { phone_number, contact_name, content, media_url, latitude, longitude } = data;

        // Check if this is a ponto command
        const pontoKeywords = ["ponto", "entrada", "saída", "saida"];
        const lowerContent = (content || "").toLowerCase().trim();
        const isPontoCommand = pontoKeywords.some((k) => lowerContent.includes(k));

        if (isPontoCommand && latitude !== undefined && longitude !== undefined) {
          // Handle ponto registration
          const { data: employee } = await supabase
            .from("employees")
            .select("id, name, active")
            .eq("phone", phone_number)
            .eq("active", true)
            .maybeSingle();

          if (!employee) {
            return new Response(
              JSON.stringify({ success: true, ponto: false, reason: "employee_not_found" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Get academy settings for geofencing
          const { data: settings } = await supabase
            .from("academy_settings")
            .select("*")
            .limit(1)
            .single();

          const distance = settings
            ? haversineDistance(latitude, longitude, settings.lat, settings.lng)
            : 0;
          const withinRadius = settings ? distance <= settings.radius_meters : true;

          // Determine entry or exit
          const today = new Date().toISOString().split("T")[0];
          const { data: todayRecords } = await supabase
            .from("ponto_records")
            .select("type")
            .eq("employee_id", employee.id)
            .eq("date", today)
            .order("time", { ascending: false })
            .limit(1);

          const lastType = todayRecords?.[0]?.type;
          const newType = lastType === "entrada" ? "saida" : "entrada";

          const now = new Date();
          const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

          await supabase.from("ponto_records").insert({
            employee_id: employee.id,
            type: newType,
            date: today,
            time: timeStr,
            lat: latitude,
            lng: longitude,
            within_radius: withinRadius,
            source: "whatsapp",
          });

          // Also store as a conversation message
          let { data: conversation } = await supabase
            .from("whatsapp_conversations")
            .select("id")
            .eq("phone_number", phone_number)
            .maybeSingle();

          if (conversation) {
            await supabase.from("whatsapp_messages").insert({
              conversation_id: conversation.id,
              content: `📍 Ponto registrado: ${newType === "entrada" ? "ENTRADA" : "SAÍDA"} às ${timeStr}${withinRadius ? " ✅" : " ⚠️ Fora do raio"}`,
              sender: "system",
              is_ai_response: false,
            });
          }

          return new Response(
            JSON.stringify({
              success: true,
              ponto: true,
              type: newType,
              within_radius: withinRadius,
              distance_meters: Math.round(distance),
              employee_name: employee.name,
              reply_message: `✅ Ponto registrado!\n\n👤 ${employee.name}\n📋 ${newType === "entrada" ? "Entrada" : "Saída"}\n🕐 ${timeStr}\n📍 ${withinRadius ? "Dentro do raio ✅" : `Fora do raio ⚠️ (${Math.round(distance)}m)`}`,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Regular message handling
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
              unread_count: 1,
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
