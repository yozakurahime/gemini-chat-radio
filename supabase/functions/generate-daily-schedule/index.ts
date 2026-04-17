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
  is_house_ad: boolean;
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

type Slot = { scheduled_time: string; ad_id: string; contract_id: string | null; schedule_date: string; execution_status: string };

function buildSchedule(ads: Ad[], contracts: Contract[], settings: Settings, date: string): Slot[] {
  const today = new Date(date);

  // Paid ads (need active contract within date range)
  const paid: { ad: Ad; contract: Contract; left: number }[] = [];
  for (const ad of ads) {
    if (ad.status !== "active" || ad.is_house_ad || !ad.contract_id) continue;
    const c = contracts.find((x) => x.id === ad.contract_id);
    if (!c || c.contract_status !== "active" || c.payment_status === "overdue") continue;
    if (today < new Date(c.start_date) || today > new Date(c.end_date)) continue;
    paid.push({ ad, contract: c, left: c.daily_executions });
  }
  paid.sort((a, b) => b.ad.priority - a.ad.priority);

  // House ads (active, marked is_house_ad, no contract required)
  const houseAds = ads.filter((a) => a.status === "active" && a.is_house_ad);

  const opStart = timeToMinutes(settings.operating_hours_start);
  const opEnd = timeToMinutes(settings.operating_hours_end);
  const minInt = settings.min_interval_minutes;
  const minSame = settings.min_same_advertiser_interval_minutes;

  const slots: Slot[] = [];
  const advLast: Record<string, number> = {};
  const houseAdLast: Record<string, number> = {};
  let cur = opStart;
  let houseRotation = 0;

  const tryPlacePaid = (cur: number): Slot | null => {
    for (const it of paid) {
      if (it.left <= 0) continue;
      const aS = timeToMinutes(it.ad.allowed_hours_start || "06:00");
      const aE = timeToMinutes(it.ad.allowed_hours_end || "23:00");
      if (cur < aS || cur > aE) continue;
      const last = advLast[it.ad.advertiser_id];
      if (last !== undefined && cur - last < minSame) continue;
      it.left--;
      advLast[it.ad.advertiser_id] = cur;
      return {
        scheduled_time: minutesToTime(cur),
        ad_id: it.ad.id,
        contract_id: it.contract.id,
        schedule_date: date,
        execution_status: "pending",
      };
    }
    return null;
  };

  const tryPlaceHouse = (cur: number): Slot | null => {
    if (!houseAds.length) return null;
    // round-robin starting from rotation index
    for (let i = 0; i < houseAds.length; i++) {
      const idx = (houseRotation + i) % houseAds.length;
      const ad = houseAds[idx];
      const aS = timeToMinutes(ad.allowed_hours_start || "06:00");
      const aE = timeToMinutes(ad.allowed_hours_end || "23:00");
      if (cur < aS || cur > aE) continue;
      const last = houseAdLast[ad.id];
      // avoid repeating same house ad within minSame window
      if (last !== undefined && cur - last < minSame) continue;
      houseAdLast[ad.id] = cur;
      houseRotation = idx + 1;
      return {
        scheduled_time: minutesToTime(cur),
        ad_id: ad.id,
        contract_id: null,
        schedule_date: date,
        execution_status: "pending",
      };
    }
    return null;
  };

  // 1) Place all paid ads first, evenly through the day at minInt cadence
  while (paid.some((p) => p.left > 0) && cur < opEnd) {
    const slot = tryPlacePaid(cur);
    if (slot) {
      slots.push(slot);
      cur += minInt;
    } else {
      cur += 1;
    }
  }

  // 2) Fill remaining gaps with house ads at minInt cadence across full operating window
  if (houseAds.length) {
    // Walk through operating hours minute-by-minute on the cadence
    cur = opStart;
    while (cur < opEnd) {
      const taken = slots.some((s) => Math.abs(timeToMinutes(s.scheduled_time.slice(0, 5)) - cur) < minInt);
      if (!taken) {
        const slot = tryPlaceHouse(cur);
        if (slot) slots.push(slot);
      }
      cur += minInt;
    }
  }

  return slots.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let targetDate: string;
    try {
      const body = await req.json();
      targetDate = body?.date;
    } catch {
      targetDate = "";
    }
    if (!targetDate) {
      const now = new Date();
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

    await supabase.from("ad_schedule").delete().eq("schedule_date", targetDate).eq("execution_status", "pending");

    const slots = buildSchedule((ads || []) as Ad[], (contracts || []) as Contract[], settings as Settings, targetDate);
    const houseCount = slots.filter((s) => !s.contract_id).length;

    if (slots.length) {
      const { error: insErr } = await supabase.from("ad_schedule").insert(slots);
      if (insErr) throw insErr;
    }

    console.log(`[generate-daily-schedule] inserted ${slots.length} slots (${houseCount} house) for ${targetDate}`);

    return new Response(
      JSON.stringify({ ok: true, date: targetDate, inserted: slots.length, house_ads: houseCount, paid_ads: slots.length - houseCount }),
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
