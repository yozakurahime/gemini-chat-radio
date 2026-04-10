import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PontoRecord {
  id: string;
  employee_id: string;
  type: string;
  date: string;
  time: string;
  lat: number | null;
  lng: number | null;
  within_radius: boolean;
  source: string;
  auto_closed: boolean;
  created_at: string;
}

export interface AcademySettings {
  id: string;
  academy_name: string;
  lat: number;
  lng: number;
  radius_meters: number;
  operating_start: string;
  operating_end: string;
  auto_close_enabled: boolean;
}

export interface ClassScheduleItem {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  class_name: string;
  instructor_id: string | null;
  instructor_name: string | null;
  max_capacity: number | null;
  active: boolean;
}

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });
}

export function useEmployeeMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async (emp: { name: string; phone: string; role: string }) => {
      const { data, error } = await supabase.from("employees").insert(emp).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Funcionário cadastrado"); },
    onError: () => toast.error("Erro ao cadastrar funcionário"),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...rest }: { id: string; name: string; phone: string; role: string }) => {
      const { error } = await supabase.from("employees").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Funcionário atualizado"); },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("employees").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Funcionário removido"); },
    onError: () => toast.error("Erro ao remover"),
  });

  return { create, update, toggleActive, remove };
}

export function usePontoRecords(filters?: { employeeId?: string; date?: string }) {
  return useQuery({
    queryKey: ["ponto_records", filters],
    queryFn: async () => {
      let q = supabase.from("ponto_records").select("*").order("date", { ascending: false }).order("time", { ascending: false });
      if (filters?.employeeId) q = q.eq("employee_id", filters.employeeId);
      if (filters?.date) q = q.eq("date", filters.date);
      const { data, error } = await q;
      if (error) throw error;
      return data as PontoRecord[];
    },
  });
}

export function useAcademySettings() {
  return useQuery({
    queryKey: ["academy_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academy_settings").select("*").limit(1).single();
      if (error) throw error;
      return data as AcademySettings;
    },
  });
}

export function useUpdateAcademySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<AcademySettings> & { id: string }) => {
      const { id, ...rest } = settings;
      const { error } = await supabase.from("academy_settings").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["academy_settings"] }); toast.success("Configurações salvas"); },
    onError: () => toast.error("Erro ao salvar configurações"),
  });
}

export function useClassSchedule() {
  return useQuery({
    queryKey: ["class_schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedule")
        .select("*")
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data as ClassScheduleItem[];
    },
  });
}

export function useClassScheduleMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async (item: Omit<ClassScheduleItem, "id" | "active">) => {
      const { data, error } = await supabase.from("class_schedule").insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class_schedule"] }); toast.success("Aula cadastrada"); },
    onError: () => toast.error("Erro ao cadastrar aula"),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<ClassScheduleItem> & { id: string }) => {
      const { error } = await supabase.from("class_schedule").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class_schedule"] }); toast.success("Aula atualizada"); },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_schedule").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class_schedule"] }); toast.success("Aula removida"); },
    onError: () => toast.error("Erro ao remover"),
  });

  return { create, update, remove };
}
