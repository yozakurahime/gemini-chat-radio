import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json().catch(() => ({}));
    const action = body.action || "auto_close";

    if (action === "auto_close") {
      // Get academy settings
      const { data: settings } = await supabase
        .from("academy_settings")
        .select("*")
        .limit(1)
        .single();

      if (!settings || !settings.auto_close_enabled) {
        return new Response(JSON.stringify({ message: "Auto-close disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const today = new Date().toISOString().split("T")[0];

      // Find employees who have an open "entrada" without "saida" today
      const { data: openEntries } = await supabase
        .from("ponto_records")
        .select("employee_id, time")
        .eq("date", today)
        .eq("type", "entrada")
        .order("time", { ascending: false });

      if (!openEntries || openEntries.length === 0) {
        return new Response(JSON.stringify({ message: "No open entries", closed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get unique employees with entries
      const employeeIds = [...new Set(openEntries.map((e) => e.employee_id))];
      let closedCount = 0;

      for (const empId of employeeIds) {
        // Check if there's already a saida after the last entrada
        const { data: lastRecords } = await supabase
          .from("ponto_records")
          .select("type")
          .eq("employee_id", empId)
          .eq("date", today)
          .order("time", { ascending: false })
          .limit(1);

        if (lastRecords?.[0]?.type === "entrada") {
          // Auto-close with operating_end time
          await supabase.from("ponto_records").insert({
            employee_id: empId,
            type: "saida",
            date: today,
            time: settings.operating_end,
            within_radius: true,
            source: "system",
            auto_closed: true,
          });
          closedCount++;
        }
      }

      return new Response(JSON.stringify({ success: true, closed: closedCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_schedule_reminder") {
      // Get tomorrow's day of week
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayOfWeek = tomorrow.getDay();

      // Get classes for tomorrow
      const { data: classes } = await supabase
        .from("class_schedule")
        .select("*")
        .eq("day_of_week", dayOfWeek)
        .eq("active", true)
        .order("start_time");

      if (!classes || classes.length === 0) {
        return new Response(JSON.stringify({ message: "No classes tomorrow" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get instructors that have classes
      const instructorIds = classes.filter((c) => c.instructor_id).map((c) => c.instructor_id);
      const { data: instructors } = await supabase
        .from("employees")
        .select("id, name, phone")
        .in("id", instructorIds)
        .eq("active", true);

      const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const messages: { phone: string; text: string }[] = [];

      for (const instructor of instructors || []) {
        const myClasses = classes.filter((c) => c.instructor_id === instructor.id);
        const classesText = myClasses
          .map((c) => `  • ${c.class_name}: ${c.start_time.slice(0, 5)} - ${c.end_time.slice(0, 5)}`)
          .join("\n");

        messages.push({
          phone: instructor.phone,
          text: `📋 Lembrete de horários para amanhã (${DAYS[dayOfWeek]}):\n\n${classesText}\n\n✅ Não se esqueça de registrar seu ponto!`,
        });
      }

      return new Response(
        JSON.stringify({ success: true, messages, count: messages.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Ponto tasks error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
