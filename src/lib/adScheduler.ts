import type { Ad, AdContract, RadioSettings, Advertiser } from "@/hooks/useRadioData";

interface SchedulableAd {
  ad: Ad & { advertiser: Advertiser };
  contract: AdContract;
  dailyExecutions: number;
  priority: number;
}

interface ScheduleSlot {
  scheduled_time: string;
  ad_id: string;
  contract_id: string;
  schedule_date: string;
  execution_status: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;
}

export function generateDailySchedule(
  ads: (Ad & { advertiser: Advertiser })[],
  contracts: AdContract[],
  settings: RadioSettings,
  date: string
): ScheduleSlot[] {
  const today = new Date(date);
  
  // Get active ads with valid contracts
  const schedulable: SchedulableAd[] = [];
  
  for (const ad of ads) {
    if (ad.status !== "active") continue;
    if (!ad.contract_id) continue;
    
    const contract = contracts.find((c) => c.id === ad.contract_id);
    if (!contract) continue;
    if (contract.contract_status !== "active") continue;
    if (contract.payment_status === "overdue") continue;
    
    const startDate = new Date(contract.start_date);
    const endDate = new Date(contract.end_date);
    if (today < startDate || today > endDate) continue;
    
    schedulable.push({
      ad,
      contract,
      dailyExecutions: contract.daily_executions,
      priority: ad.priority,
    });
  }
  
  if (schedulable.length === 0) return [];
  
  // Sort by priority (higher first)
  schedulable.sort((a, b) => b.priority - a.priority);
  
  const opStart = timeToMinutes(settings.operating_hours_start);
  const opEnd = timeToMinutes(settings.operating_hours_end);
  const minInterval = settings.min_interval_minutes;
  const minSameAdvertiser = settings.min_same_advertiser_interval_minutes;
  
  const slots: ScheduleSlot[] = [];
  const advertiserLastSlot: Record<string, number> = {};
  
  // Calculate total slots needed
  const totalSlots = schedulable.reduce((sum, s) => sum + s.dailyExecutions, 0);
  const totalMinutes = opEnd - opStart;
  
  // Distribute slots evenly across operating hours
  const idealInterval = Math.max(minInterval, Math.floor(totalMinutes / totalSlots));
  
  let currentMinute = opStart;
  
  // Round-robin through ads, distributing evenly
  let remaining = schedulable.map((s) => ({ ...s, left: s.dailyExecutions }));
  
  while (remaining.some((r) => r.left > 0) && currentMinute < opEnd) {
    let placed = false;
    
    for (const item of remaining) {
      if (item.left <= 0) continue;
      if (currentMinute >= opEnd) break;
      
      // Check ad's allowed hours
      const adStart = timeToMinutes(item.ad.allowed_hours_start);
      const adEnd = timeToMinutes(item.ad.allowed_hours_end);
      if (currentMinute < adStart || currentMinute > adEnd) continue;
      
      // Check same advertiser interval
      const lastTime = advertiserLastSlot[item.ad.advertiser_id];
      if (lastTime !== undefined && currentMinute - lastTime < minSameAdvertiser) continue;
      
      slots.push({
        scheduled_time: minutesToTime(currentMinute),
        ad_id: item.ad.id,
        contract_id: item.contract.id,
        schedule_date: date,
        execution_status: "pending",
      });
      
      advertiserLastSlot[item.ad.advertiser_id] = currentMinute;
      item.left--;
      currentMinute += minInterval;
      placed = true;
      break;
    }
    
    if (!placed) {
      currentMinute += 1; // advance 1 minute to find a valid slot
    }
  }
  
  return slots.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
}

export function getAlerts(
  contracts: AdContract[],
  ads: (Ad & { advertiser: Advertiser })[],
  scheduleCount: number,
  totalDailyNeeded: number
): { type: "warning" | "error" | "info"; message: string }[] {
  const alerts: { type: "warning" | "error" | "info"; message: string }[] = [];
  const today = new Date();
  const in7Days = new Date();
  in7Days.setDate(today.getDate() + 7);
  
  for (const contract of contracts) {
    const endDate = new Date(contract.end_date);
    
    if (contract.contract_status === "active" && endDate < today) {
      alerts.push({ type: "error", message: `Contrato vencido: ${contract.plan_name}` });
    } else if (contract.contract_status === "active" && endDate <= in7Days) {
      alerts.push({ type: "warning", message: `Contrato vencendo em breve: ${contract.plan_name}` });
    }
    
    if (contract.payment_status === "overdue") {
      alerts.push({ type: "error", message: `Inadimplência: ${contract.plan_name}` });
    }
  }
  
  for (const ad of ads) {
    if (ad.status === "active" && !ad.audio_url) {
      alerts.push({ type: "error", message: `Áudio ausente: ${ad.name}` });
    }
  }
  
  if (scheduleCount < totalDailyNeeded) {
    alerts.push({
      type: "warning",
      message: `Grade insuficiente: ${scheduleCount}/${totalDailyNeeded} execuções agendadas`,
    });
  }
  
  return alerts;
}
