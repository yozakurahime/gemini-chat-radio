import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Ad {
  id: string;
  advertiser_id: string;
  contract_id: string | null;
  status: string;
  priority: number;
  allowed_hours_start: string | null;
  allowed_hours_end: string | null;
}

interface Contract {
  id: string;
  contract_status: string;
  payment_status: string;
  start_date: string;
  end_date: string;
  daily_executions: number;
}

interface Settings {
  operating_hours_start: string;
  operating_hours_end: string;
  min_interval_minutes: number;
  min_same_advertiser_interval_minutes: number;
}

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
};

function buildSchedule(ads: Ad[], contracts: Contract[], settings: Settings, date: string) {
  const today = new Date(date);
  const items: { ad: Ad; contract: Contract; left: number }[] = [];

  for (const ad of ads) {
    if (ad.status !== "active" || !ad.contract_id) continue;
    const c = contracts.find((x) => x.id === ad.contract_id);
    if (!c || c.contract_status !== "active" || c.payment_status === "overdue") continue;
    if (today < new Date(c.start_date) || today > new Date(c.end_date)) continue;
    items.push({ ad, contract: c, left: c.daily_executions });
  }

  if (!items.length) return [];
  items.sort((a, b) => b.ad.priority - a.ad.priority);

  const opStart = timeToMinutes(settings.operating_hours_start);
  const opEnd = timeToMinutes(settings.operating_hours_end);
  const minInt = settings.min_interval_minutes;
  const minSame = settings.min_same_advertiser_interval_minutes;

  const slots: Array<{ scheduled_time: string; ad_id: string; contract_id: string; schedule_date: string; execution_status: string }> = [];
  const advLast: Record<string, number> = {};
  let cur = opStart;

  while (items.some((i) => i.left > 0) && cur < opEnd) {
    let placed = false;
    for (const it of items) {
      if (it.left <= 0 || cur >= opEnd) continue;
      const aS = timeToMinutes(it.ad.allowed_hours_start || "06:00");
      const aE = timeToMinutes(it.ad.allowed_hours_end || "23:00");
      if (cur < aS || cur > aE) continue;
      const last = advLast[it.ad.advertiser_id];
      if (last !== undefined && cur - last < minSame) continue;

      slots.push({
        scheduled_time: minutesToTime(cur),
        ad_id: it.ad.id,
        contract_id: it.contract.id,
        schedule_date: date,
        execution_status: "pending",
      });
      advLast[it.ad.advertiser_id] = cur;
      it.left--;
      cur += minInt;
      placed = true;
      break;
    }
    if (!placed) cur += 1;
  }

  return slots;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Allow override via body { date: "YYYY-MM-DD" }, default = today (server TZ UTC → use São Paulo)
    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body?.date;
    } catch {
      targetDate = "";
    }
    if (!targetDate) {
      const now = new Date();
      // Brazil/SP is UTC-3 (no DST). Cron runs at 03:05 UTC = 00:05 BRT.
      const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      targetDate = sp.toISOString().slice(0, 10);
    }

    console.log(`[generate-daily-schedule] target date: ${targetDate}`);

    const [{ data: ads }, { data: contracts }, { data: settingsRows }] = await Promise.all([
      supabase.from("ads").select("*"),
      supabase.from("ad_contracts").select("*"),
      supabase.from("radio_settings").select("*").limit(1),
    ]);

    const settings = settingsRows?.[0];
    if (!settings) {
      return new Response(JSON.stringify({ error: "radio_settings missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clear existing pending entries for the date so re-runs are idempotent
    await supabase.from("ad_schedule").delete().eq("schedule_date", targetDate).eq("execution_status", "pending");

    const slots = buildSchedule((ads || []) as Ad[], (contracts || []) as Contract[], settings as Settings, targetDate);

    if (slots.length) {
      const { error: insErr } = await supabase.from("ad_schedule").insert(slots);
      if (insErr) throw insErr;
    }

    console.log(`[generate-daily-schedule] inserted ${slots.length} slots for ${targetDate}`);

    return new Response(
      JSON.stringify({ ok: true, date: targetDate, inserted: slots.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-daily-schedule] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
