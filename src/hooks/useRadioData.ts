import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Types
export interface BusinessSegment {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface Advertiser {
  id: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  segment_id: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  segment?: BusinessSegment;
}

export interface AdContract {
  id: string;
  advertiser_id: string;
  plan_name: string;
  value_cents: number;
  start_date: string;
  end_date: string;
  daily_executions: number;
  ad_duration_seconds: number;
  contract_status: string;
  payment_status: string;
  segment_exclusive: boolean;
  notes: string | null;
  created_at: string;
  advertiser?: Advertiser;
}

export interface Ad {
  id: string;
  advertiser_id: string;
  contract_id: string | null;
  name: string;
  audio_url: string | null;
  duration_seconds: number;
  volume: number;
  status: string;
  approved_at: string | null;
  priority: number;
  allowed_hours_start: string;
  allowed_hours_end: string;
  created_at: string;
  advertiser?: Advertiser;
  contract?: AdContract;
}

export interface AdScheduleEntry {
  id: string;
  schedule_date: string;
  scheduled_time: string;
  ad_id: string;
  contract_id: string | null;
  execution_status: string;
  ad?: Ad;
}

export interface AdExecutionLog {
  id: string;
  ad_id: string | null;
  contract_id: string | null;
  advertiser_id: string | null;
  scheduled_time: string | null;
  played_at: string;
  actual_duration_seconds: number | null;
  status: string;
  error_message: string | null;
  ad?: Ad;
  advertiser?: Advertiser;
}

export interface RadioSettings {
  id: string;
  min_interval_minutes: number;
  min_same_advertiser_interval_minutes: number;
  operating_hours_start: string;
  operating_hours_end: string;
  prime_hours_start: string | null;
  prime_hours_end: string | null;
}

// Segments
export function useSegments() {
  return useQuery({
    queryKey: ["segments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_segments")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as BusinessSegment[];
    },
  });
}

// Advertisers
export function useAdvertisers() {
  return useQuery({
    queryKey: ["advertisers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisers")
        .select("*, segment:business_segments(*)")
        .order("company_name");
      if (error) throw error;
      return data as (Advertiser & { segment: BusinessSegment | null })[];
    },
  });
}

export function useCreateAdvertiser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Advertiser, "id" | "created_at" | "segment">) => {
      const { data, error } = await supabase.from("advertisers").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["advertisers"] }); toast.success("Anunciante cadastrado!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateAdvertiser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, segment, ...input }: Partial<Advertiser> & { id: string }) => {
      const { error } = await supabase.from("advertisers").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["advertisers"] }); toast.success("Anunciante atualizado!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAdvertiser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("advertisers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["advertisers"] }); toast.success("Anunciante removido!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Contracts
export function useContracts() {
  return useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_contracts")
        .select("*, advertiser:advertisers(*, segment:business_segments(*))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (AdContract & { advertiser: Advertiser & { segment: BusinessSegment | null } })[];
    },
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<AdContract, "id" | "created_at" | "advertiser">) => {
      const { data, error } = await supabase.from("ad_contracts").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast.success("Contrato criado!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, advertiser, ...input }: Partial<AdContract> & { id: string }) => {
      const { error } = await supabase.from("ad_contracts").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast.success("Contrato atualizado!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Ads
export function useAds() {
  return useQuery({
    queryKey: ["ads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads")
        .select("*, advertiser:advertisers(*), contract:ad_contracts(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (Ad & { advertiser: Advertiser; contract: AdContract | null })[];
    },
  });
}

export function useCreateAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Ad, "id" | "created_at" | "advertiser" | "contract">) => {
      const { data, error } = await supabase.from("ads").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ads"] }); toast.success("Anúncio criado!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, advertiser, contract, ...input }: Partial<Ad> & { id: string }) => {
      const { error } = await supabase.from("ads").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ads"] }); toast.success("Anúncio atualizado!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ads"] }); toast.success("Anúncio removido!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Schedule
export function useAdSchedule(date?: string) {
  const today = date || new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["ad-schedule", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_schedule")
        .select("*, ad:ads(*, advertiser:advertisers(*))")
        .eq("schedule_date", today)
        .order("scheduled_time");
      if (error) throw error;
      return data as (AdScheduleEntry & { ad: Ad & { advertiser: Advertiser } })[];
    },
  });
}

export function useCreateScheduleEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: Omit<AdScheduleEntry, "id" | "ad">[]) => {
      const { error } = await supabase.from("ad_schedule").insert(entries);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ad-schedule"] }); toast.success("Grade gerada!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateScheduleEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ad, ...input }: Partial<AdScheduleEntry> & { id: string }) => {
      const { error } = await supabase.from("ad_schedule").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ad-schedule"] }); },
  });
}

// Logs
export function useAdLogs(date?: string) {
  const today = date || new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["ad-logs", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_execution_logs")
        .select("*, ad:ads(*), advertiser:advertisers(*)")
        .gte("played_at", `${today}T00:00:00`)
        .lte("played_at", `${today}T23:59:59`)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return data as AdExecutionLog[];
    },
  });
}

export function useCreateLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<AdExecutionLog, "id" | "ad" | "advertiser">) => {
      const { error } = await supabase.from("ad_execution_logs").insert(input).select().single();
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ad-logs"] }); },
  });
}

// Settings
export function useRadioSettings() {
  return useQuery({
    queryKey: ["radio-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("radio_settings").select("*").limit(1).single();
      if (error) throw error;
      return data as RadioSettings;
    },
  });
}

export function useUpdateRadioSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<RadioSettings> & { id: string }) => {
      const { error } = await supabase.from("radio_settings").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["radio-settings"] }); toast.success("Configurações salvas!"); },
    onError: (e: Error) => toast.error(e.message),
  });
}
