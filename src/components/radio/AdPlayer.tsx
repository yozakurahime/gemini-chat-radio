import { useState, useEffect, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Megaphone, Volume2 } from "lucide-react";
import { useAdSchedule, useUpdateScheduleEntry, useCreateLog } from "@/hooks/useRadioData";
import type { AdScheduleEntry, Ad, Advertiser } from "@/hooks/useRadioData";

interface Props {
  isPlaying: boolean;
  musicVolume: number;
  onDucking: (ducked: boolean) => void;
  duckingLevel: number;
}

export default function AdPlayer({ isPlaying, musicVolume, onDucking, duckingLevel }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const { data: schedule = [] } = useAdSchedule(today);
  const updateEntry = useUpdateScheduleEntry();
  const createLog = useCreateLog();
  
  const [currentAd, setCurrentAd] = useState<(AdScheduleEntry & { ad: Ad & { advertiser: Advertiser } }) | null>(null);
  const [adProgress, setAdProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const playedIdsRef = useRef<Set<string>>(new Set());

  const playAd = useCallback(async (entry: AdScheduleEntry & { ad: Ad & { advertiser: Advertiser } }) => {
    if (!entry.ad?.audio_url) {
      // No audio file - log failure
      await updateEntry.mutateAsync({ id: entry.id, execution_status: "failed" });
      await createLog.mutateAsync({
        ad_id: entry.ad_id,
        contract_id: entry.contract_id,
        advertiser_id: entry.ad?.advertiser_id,
        scheduled_time: entry.scheduled_time,
        played_at: new Date().toISOString(),
        status: "failed",
        error_message: "Arquivo de áudio ausente",
        actual_duration_seconds: null,
      });
      playedIdsRef.current.add(entry.id);
      return;
    }

    setCurrentAd(entry);
    onDucking(true);

    try {
      const audio = new Audio(entry.ad.audio_url);
      audio.volume = Number(entry.ad.volume) || 1;
      audioRef.current = audio;
      
      const startTime = Date.now();

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setAdProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      audio.onended = async () => {
        const duration = (Date.now() - startTime) / 1000;
        await updateEntry.mutateAsync({ id: entry.id, execution_status: "played" });
        await createLog.mutateAsync({
          ad_id: entry.ad_id,
          contract_id: entry.contract_id,
          advertiser_id: entry.ad?.advertiser_id,
          scheduled_time: entry.scheduled_time,
          played_at: new Date().toISOString(),
          status: "success",
          actual_duration_seconds: Math.round(duration * 100) / 100,
          error_message: null,
        });
        setCurrentAd(null);
        setAdProgress(0);
        onDucking(false);
        playedIdsRef.current.add(entry.id);
      };

      audio.onerror = async () => {
        await updateEntry.mutateAsync({ id: entry.id, execution_status: "failed" });
        await createLog.mutateAsync({
          ad_id: entry.ad_id,
          contract_id: entry.contract_id,
          advertiser_id: entry.ad?.advertiser_id,
          scheduled_time: entry.scheduled_time,
          played_at: new Date().toISOString(),
          status: "failed",
          error_message: "Erro ao reproduzir áudio",
          actual_duration_seconds: null,
        });
        setCurrentAd(null);
        setAdProgress(0);
        onDucking(false);
        playedIdsRef.current.add(entry.id);
      };

      await audio.play();
    } catch (e: any) {
      setCurrentAd(null);
      onDucking(false);
      playedIdsRef.current.add(entry.id);
    }
  }, [onDucking, updateEntry, createLog]);

  // Check schedule every 10 seconds
  useEffect(() => {
    if (!isPlaying) return;

    const check = () => {
      if (currentAd) return; // already playing an ad
      
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      
      const pendingAd = schedule.find(
        (s) =>
          s.execution_status === "pending" &&
          !playedIdsRef.current.has(s.id) &&
          s.scheduled_time?.substring(0, 5) <= currentTime
      );
      
      if (pendingAd) {
        playAd(pendingAd as any);
      }
    };

    check();
    checkIntervalRef.current = setInterval(check, 10000);
    
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [isPlaying, schedule, currentAd, playAd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!currentAd) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50 border border-accent">
      <Megaphone className="h-5 w-5 text-primary animate-pulse shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="default" className="text-[10px]">ANÚNCIO</Badge>
          <span className="text-sm font-medium truncate">{currentAd.ad?.name}</span>
          <span className="text-xs text-muted-foreground">— {currentAd.ad?.advertiser?.company_name}</span>
        </div>
        <Progress value={adProgress} className="h-1.5" />
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Volume2 className="h-3 w-3" />
        <span>{Math.round(Number(currentAd.ad?.volume || 1) * 100)}%</span>
      </div>
    </div>
  );
}
