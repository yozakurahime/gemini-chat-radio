// Cron-triggered: a cada minuto verifica se há aulas/expedientes começando em 30, 10 ou 0 min
// Envia mensagem ao Baileys local (apps/server) para disparar WhatsApp ao instrutor.
// Idempotência via tabela class_notifications_log (UNIQUE class_id+employee+date+minutes_before).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_OFFSETS = [30, 10, 0]; // minutes before class start
const TOLERANCE_MIN = 1; // accept ±1 min around the target so cron drift is OK

function nowInSP(): { date: string; weekday: number; minutesOfDay: number } {
  // BRT = UTC-3 (no DST)
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const date = now.toISOString().slice(0, 10);
  const weekday = now.getUTCDay(); // 0=Sun ... 6=Sat (matches class_schedule.day_of_week if it uses 0..6)
  const minutesOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  return { date, weekday, minutesOfDay };
}

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function buildMessage(employeeName: string, className: string, startTime: string, minutesBefore: number): string {
  const hhmm = startTime.slice(0, 5);
  if (minutesBefore === 0) {
    return `🔔 Olá ${employeeName}! Sua aula *${className}* começa AGORA (${hhmm}). Por favor bata o ponto e confirme presença. ✅`;
  }
  if (minutesBefore === 10) {
    return `⏰ Lembrete: ${employeeName}, sua aula *${className}* começa em 10 minutos (${hhmm}). Já se prepare! 💪`;
  }
  return `📅 Olá ${employeeName}! Sua aula *${className}* começa em 30 minutos (${hhmm}). Hora de se deslocar. 🚗`;
}

async function sendWhatsApp(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = Deno.env.get("BAILEYS_LOCAL_URL");
  if (!baseUrl) {
    return { ok: false, error: "BAILEYS_LOCAL_URL not configured" };
  }
  const secret = Deno.env.get("BAILEYS_SHARED_SECRET") || "";
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/admin/whatsapp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-shared-secret": secret } : {}),
      },
      body: JSON.stringify({ phone, message }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { date, weekday, minutesOfDay } = nowInSP();
    console.log(`[notify-class-staff] tick date=${date} weekday=${weekday} minute=${minutesOfDay}`);

    const { data: classes, error } = await supabase
      .from("class_schedule")
      .select("id, class_name, day_of_week, start_time, instructor_id, instructor_name, active, employees:instructor_id(id, name, phone, active)")
      .eq("active", true)
      .eq("day_of_week", weekday);

    if (error) throw error;

    const dispatched: Array<{ class_id: string; minutes_before: number; ok: boolean; error?: string }> = [];

    for (const cls of (classes || []) as any[]) {
      const startMin = timeToMinutes(cls.start_time);
      const employee = cls.employees;
      if (!employee || !employee.active || !employee.phone) continue;

      for (const offset of TARGET_OFFSETS) {
        const target = startMin - offset;
        if (Math.abs(target - minutesOfDay) > TOLERANCE_MIN) continue;

        // Check idempotency
        const { data: existing } = await supabase
          .from("class_notifications_log")
          .select("id")
          .eq("class_id", cls.id)
          .eq("employee_id", employee.id)
          .eq("notification_date", date)
          .eq("minutes_before", offset)
          .maybeSingle();

        if (existing) {
          console.log(`[notify-class-staff] already sent class=${cls.id} offset=${offset}`);
          continue;
        }

        const msg = buildMessage(employee.name, cls.class_name, cls.start_time, offset);
        const result = await sendWhatsApp(employee.phone, msg);

        await supabase.from("class_notifications_log").insert({
          class_id: cls.id,
          employee_id: employee.id,
          notification_date: date,
          minutes_before: offset,
          status: result.ok ? "sent" : "failed",
          error_message: result.error || null,
        });

        dispatched.push({ class_id: cls.id, minutes_before: offset, ok: result.ok, error: result.error });
        console.log(`[notify-class-staff] ${result.ok ? "OK" : "FAIL"} class=${cls.class_name} -> ${employee.name} (-${offset}m) ${result.error || ""}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, date, weekday, minute: minutesOfDay, dispatched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notify-class-staff] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
