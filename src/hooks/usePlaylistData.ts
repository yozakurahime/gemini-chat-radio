import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlaylistTrack {
  id: string;
  title: string;
  url: string;
  position: number;
  created_at: string;
}

export function usePlaylist() {
  return useQuery({
    queryKey: ["radio-playlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("radio_playlist")
        .select("*")
        .order("position");
      if (error) throw error;
      return data as PlaylistTrack[];
    },
  });
}

export function useAddTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      // Get max position
      const { data: existing } = await supabase
        .from("radio_playlist")
        .select("position")
        .order("position", { ascending: false })
        .limit(1);
      const nextPos = (existing?.[0]?.position ?? -1) + 1;

      const { data, error } = await supabase
        .from("radio_playlist")
        .insert({ url, title: `Nova música (${url.substring(0, 40)}...)`, position: nextPos })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["radio-playlist"] });
      toast.success("Música adicionada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<PlaylistTrack> & { id: string }) => {
      const { error } = await supabase.from("radio_playlist").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["radio-playlist"] }),
  });
}

export function useRemoveTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("radio_playlist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["radio-playlist"] });
      toast.success("Música removida!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
