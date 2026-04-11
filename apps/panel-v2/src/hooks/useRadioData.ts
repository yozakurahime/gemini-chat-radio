import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, jsonHeaders } from "@/lib/panel-api";

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
  segment?: BusinessSegment | null;
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
  campaign_id: string | null;
  name: string;
  file: string;
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
  contract?: AdContract | null;
}

export interface AdScheduleEntry {
  id: string;
  schedule_date: string;
  scheduled_time: string;
  ad_id: string | null;
  contract_id: string | null;
  campaign_id: string | null;
  execution_status: string;
  ad?: Ad | null;
}

export interface AdExecutionLog {
  id: string;
  ad_id: string | null;
  contract_id: string | null;
  advertiser_id: string | null;
  campaign_id: string | null;
  scheduled_time: string | null;
  played_at: string;
  actual_duration_seconds: number | null;
  status: string;
  error_message: string | null;
  ad?: Pick<Ad, "id" | "name" | "advertiser_id"> | null;
  advertiser?: Pick<Advertiser, "id" | "company_name"> | null;
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

type MutateOptions = { success?: string; invalidate?: string[] };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  return res.json();
}

function useApiMutation<TInput, TOutput>(
  run: (input: TInput) => Promise<TOutput>,
  options?: MutateOptions,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      if (options?.invalidate?.length) {
        options.invalidate.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      }
      if (options?.success) toast.success(options.success);
    },
    onError: (error: Error) => toast.error(error.message || "Falha na operação"),
  });
}

export function useSegments() {
  return useQuery({
    queryKey: ["segments"],
    queryFn: async () => (await fetchJson<{ segments: BusinessSegment[] }>("/admin/radio/commercial/segments")).segments || [],
  });
}

export function useAdvertisers() {
  return useQuery({
    queryKey: ["advertisers"],
    queryFn: async () => (await fetchJson<{ advertisers: Advertiser[] }>("/admin/radio/commercial/advertisers")).advertisers || [],
  });
}

export function useCreateAdvertiser() {
  return useApiMutation<Omit<Advertiser, "id" | "created_at" | "segment">, unknown>(
    async (input) => {
      await apiFetch("/admin/radio/commercial/advertisers", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(input),
      });
      return {};
    },
    { success: "Anunciante cadastrado!", invalidate: ["advertisers"] },
  );
}

export function useUpdateAdvertiser() {
  return useApiMutation<Partial<Advertiser> & { id: string }, unknown>(
    async ({ id, ...input }) => {
      await apiFetch(`/admin/radio/commercial/advertisers/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(input),
      });
      return {};
    },
    { success: "Anunciante atualizado!", invalidate: ["advertisers", "contracts", "ads"] },
  );
}

export function useDeleteAdvertiser() {
  return useApiMutation<string, unknown>(
    async (id) => {
      await apiFetch(`/admin/radio/commercial/advertisers/${encodeURIComponent(id)}`, { method: "DELETE" });
      return {};
    },
    { success: "Anunciante removido!", invalidate: ["advertisers", "contracts", "ads"] },
  );
}

export function useContracts() {
  return useQuery({
    queryKey: ["contracts"],
    queryFn: async () => (await fetchJson<{ contracts: AdContract[] }>("/admin/radio/commercial/contracts")).contracts || [],
  });
}

export function useCreateContract() {
  return useApiMutation<Omit<AdContract, "id" | "created_at" | "advertiser">, unknown>(
    async (input) => {
      await apiFetch("/admin/radio/commercial/contracts", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(input),
      });
      return {};
    },
    { success: "Contrato criado!", invalidate: ["contracts", "ads"] },
  );
}

export function useUpdateContract() {
  return useApiMutation<Partial<AdContract> & { id: string }, unknown>(
    async ({ id, ...input }) => {
      await apiFetch(`/admin/radio/commercial/contracts/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(input),
      });
      return {};
    },
    { success: "Contrato atualizado!", invalidate: ["contracts", "ads", "ad-schedule"] },
  );
}

export function useAds() {
  return useQuery({
    queryKey: ["ads"],
    queryFn: async () => (await fetchJson<{ ads: Ad[] }>("/admin/radio/commercial/ads")).ads || [],
  });
}

export function useCreateAd() {
  return useApiMutation<Omit<Ad, "id" | "created_at" | "advertiser" | "contract" | "audio_url">, unknown>(
    async (input) => {
      await apiFetch("/admin/radio/commercial/ads", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(input),
      });
      return {};
    },
    { success: "Anúncio criado!", invalidate: ["ads", "ad-schedule"] },
  );
}

export function useUpdateAd() {
  return useApiMutation<Partial<Ad> & { id: string }, unknown>(
    async ({ id, ...input }) => {
      await apiFetch(`/admin/radio/commercial/ads/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(input),
      });
      return {};
    },
    { success: "Anúncio atualizado!", invalidate: ["ads", "ad-schedule"] },
  );
}

export function useDeleteAd() {
  return useApiMutation<string, unknown>(
    async (id) => {
      await apiFetch(`/admin/radio/commercial/ads/${encodeURIComponent(id)}`, { method: "DELETE" });
      return {};
    },
    { success: "Anúncio removido!", invalidate: ["ads", "ad-schedule"] },
  );
}

export function useAdLibraryFiles() {
  return useQuery({
    queryKey: ["ad-library-files"],
    queryFn: async () => {
      const list = await fetchJson<string[]>("/api/ads");
      return (Array.isArray(list) ? list : []).map((file) => ({
        file,
        label: String(file || "").replace(/\.mp3$/i, ""),
      }));
    },
  });
}

export function useUploadAdLibraryFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      await apiFetch("/api/upload-ad", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success("Áudio enviado!");
      qc.invalidateQueries({ queryKey: ["ad-library-files"] });
    },
    onError: (error: Error) => toast.error(error.message || "Falha ao enviar áudio"),
  });
}

export function useAdSchedule(date?: string) {
  const target = date || new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["ad-schedule", target],
    queryFn: async () => (await fetchJson<{ schedule: AdScheduleEntry[] }>(`/admin/radio/commercial/schedule?date=${encodeURIComponent(target)}`)).schedule || [],
  });
}

export function useGenerateSchedule() {
  return useApiMutation<{ date: string }, unknown>(
    async ({ date }) => {
      await apiFetch("/admin/radio/commercial/schedule/generate", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ date }),
      });
      return {};
    },
    { success: "Grade gerada!", invalidate: ["ad-schedule", "ad-logs"] },
  );
}

export function useAdLogs(date?: string) {
  const target = date || new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["ad-logs", target],
    queryFn: async () => (await fetchJson<{ logs: AdExecutionLog[] }>(`/admin/radio/commercial/logs?date=${encodeURIComponent(target)}`)).logs || [],
  });
}

export function useAdLogsPeriod(from: string, to: string) {
  return useQuery({
    queryKey: ["ad-logs-period", from, to],
    queryFn: async () => (await fetchJson<{ logs: AdExecutionLog[] }>(`/admin/radio/commercial/logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1000`)).logs || [],
  });
}

export function useRadioSettings() {
  return useQuery({
    queryKey: ["radio-settings-commercial"],
    queryFn: async () => (await fetchJson<{ settings: RadioSettings }>("/admin/radio/commercial/settings")).settings,
  });
}

export function useUpdateRadioSettings() {
  return useApiMutation<Partial<RadioSettings> & { id: string }, unknown>(
    async ({ id: _id, ...input }) => {
      await apiFetch("/admin/radio/commercial/settings", {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(input),
      });
      return {};
    },
    { success: "Configurações salvas!", invalidate: ["radio-settings-commercial"] },
  );
}
