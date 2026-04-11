import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  AD_PLAY_COMMAND_EVENT,
  type AdCampaign,
  type AdPlayRequest,
  usePanelData,
} from "@/hooks/use-panel-data";

type QueueItem = {
  file: string;
  name: string;
  campaignId: number | null;
  source: "manual" | "auto";
  mode?: string;
  priority?: number;
};

function normalizeQueueItem(input: AdPlayRequest | string): QueueItem | null {
  if (typeof input === "string") {
    const file = String(input || "").trim();
    if (!file) return null;
    return {
      file,
      name: file.replace(/\.mp3$/i, ""),
      campaignId: null,
      source: "manual",
    };
  }

  const file = String(input?.file || "").trim();
  if (!file) return null;
  return {
    file,
    name: String(input?.name || file.replace(/\.mp3$/i, "")).trim(),
    campaignId: Number.isFinite(Number(input?.campaignId)) ? Number(input?.campaignId) : null,
    source: input?.source === "auto" ? "auto" : "manual",
    mode: input?.mode,
    priority: Number.isFinite(Number(input?.priority)) ? Number(input?.priority) : undefined,
  };
}

function campaignToQueueItem(campaign: AdCampaign | null | undefined): QueueItem | null {
  if (!campaign?.file) return null;
  return {
    file: campaign.file,
    name: campaign.name || campaign.file.replace(/\.mp3$/i, ""),
    campaignId: Number(campaign.id),
    source: "auto",
    mode: campaign.mode,
    priority: Number(campaign.priority || 0),
  };
}

export default function GlobalAdsController() {
  const {
    user,
    radio,
    adPlayback,
    refreshAdCampaigns,
    refreshAdHistory,
    refreshNextAdState,
    emitAdsEvent,
    trackAdCampaignRun,
    updateAdPlaybackState,
  } = usePanelData();

  const isAdmin = user?.role === "admin";
  const queueRef = useRef<QueueItem[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentItemRef = useRef<QueueItem | null>(null);
  const settlePlaybackRef = useRef<((status: "played" | "error" | "skipped", reason?: string, meta?: Record<string, any>) => Promise<void>) | null>(null);
  const lastAutoKeyRef = useRef("");
  const previousLastAdTimeRef = useRef(0);
  const radioRef = useRef(radio);
  const isAdminRef = useRef(isAdmin);

  useEffect(() => {
    radioRef.current = radio;
  }, [radio]);

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  const syncQueueCount = useCallback(() => {
    updateAdPlaybackState({ queuedCount: queueRef.current.length });
  }, [updateAdPlaybackState]);

  const resetPlaybackState = useCallback((status: "played" | "error" | "skipped", reason = "") => {
    updateAdPlaybackState({
      isPlaying: false,
      currentFile: "",
      currentName: "",
      currentCampaignId: null,
      source: "",
      queuedCount: queueRef.current.length,
      lastStatus: status,
      lastError: reason,
      lastEventAt: Date.now(),
    });
  }, [updateAdPlaybackState]);

  const refreshAdRuntime = useCallback(async () => {
    await Promise.allSettled([
      refreshAdCampaigns(),
      refreshAdHistory(),
      refreshNextAdState(),
    ]);
  }, [refreshAdCampaigns, refreshAdHistory, refreshNextAdState]);

  const startPlayback = useCallback(async (item: QueueItem) => {
    if (!isAdminRef.current || currentItemRef.current || !radioRef.current.isPlaying) {
      return false;
    }

    currentItemRef.current = item;
    previousLastAdTimeRef.current = Number(radioRef.current.lastAdTime || 0);
    updateAdPlaybackState({
      isPlaying: true,
      currentFile: item.file,
      currentName: item.name,
      currentCampaignId: item.campaignId,
      source: item.source,
      lastStatus: "playing",
      lastError: "",
      lastEventAt: Date.now(),
      queuedCount: queueRef.current.length,
    });

    emitAdsEvent("ads.play.start", {
      file: item.file,
      campaignId: item.campaignId,
      source: item.source,
      previousLastAdTime: previousLastAdTimeRef.current,
      mode: item.mode,
      priority: item.priority,
    });

    const audio = new Audio(`/ads/${encodeURIComponent(item.file)}`);
    audio.preload = "auto";
    audioRef.current = audio;

    let settled = false;
    const settle = async (
      status: "played" | "error" | "skipped",
      reason = "",
      meta: Record<string, any> = {},
    ) => {
      if (settled) return;
      settled = true;

      const current = currentItemRef.current;
      currentItemRef.current = null;
      settlePlaybackRef.current = null;

      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      audio.src = "";
      audioRef.current = null;

      if (current?.campaignId) {
        await trackAdCampaignRun({
          id: current.campaignId,
          status,
          file: current.file,
          reason,
          meta,
        });
      }

      if (status === "played") {
        emitAdsEvent("ads.play.end", {
          file: current?.file,
          campaignId: current?.campaignId,
          source: current?.source,
          ...meta,
        });
      } else {
        lastAutoKeyRef.current = "";
        emitAdsEvent("ads.play.rollback", {
          file: current?.file,
          campaignId: current?.campaignId,
          reason,
          restoreLastAdTime: previousLastAdTimeRef.current,
          ...meta,
        });
      }

      await refreshAdRuntime();
      resetPlaybackState(status, reason);

      if (!radioRef.current.isPlaying) {
        if (queueRef.current.length) {
          queueRef.current = [];
          syncQueueCount();
        }
        return;
      }

      const next = queueRef.current.shift();
      syncQueueCount();
      if (next) void startPlayback(next);
    };

    settlePlaybackRef.current = settle;
    audio.addEventListener("ended", () => { void settle("played"); }, { once: true });
    audio.addEventListener("error", () => { void settle("error", "audio_error"); }, { once: true });

    try {
      await audio.play();
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "playback_failed";
      await settle("error", reason);
      return false;
    }
  }, [emitAdsEvent, refreshAdRuntime, resetPlaybackState, syncQueueCount, trackAdCampaignRun, updateAdPlaybackState]);

  const enqueuePlayback = useCallback((input: AdPlayRequest | string) => {
    const item = normalizeQueueItem(input);
    if (!item || !isAdminRef.current) return false;

    const current = currentItemRef.current;
    const alreadyQueued = queueRef.current.some((queued) => (
      queued.file === item.file &&
      queued.campaignId === item.campaignId &&
      queued.source === item.source
    ));
    if (current && current.file === item.file && current.campaignId === item.campaignId && current.source === item.source) {
      return false;
    }
    if (alreadyQueued) return false;

    if (current) {
      queueRef.current.push(item);
      syncQueueCount();
      return true;
    }

    if (!radioRef.current.isPlaying) return false;

    void startPlayback(item);
    return true;
  }, [startPlayback, syncQueueCount]);

  useEffect(() => {
    if (!isAdmin) return;

    const onPlayCommand = (event: Event) => {
      const detail = (event as CustomEvent<AdPlayRequest | string>).detail;
      const accepted = enqueuePlayback(detail);
      if (!accepted && typeof detail !== "string" && detail?.source !== "auto" && adPlayback.isPlaying) {
        toast.info("Esse anuncio ja esta em execucao");
      }
    };

    window.addEventListener(AD_PLAY_COMMAND_EVENT, onPlayCommand);
    return () => window.removeEventListener(AD_PLAY_COMMAND_EVENT, onPlayCommand);
  }, [adPlayback.isPlaying, enqueuePlayback, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !radio.isPlaying) return;

    let cancelled = false;
    const checkNextAd = async () => {
      if (cancelled || currentItemRef.current || queueRef.current.length) return;
      const next = await refreshNextAdState();
      if (cancelled || !radioRef.current.isPlaying) return;
      const dueCampaign = next?.campaign || null;
      const queueItem = campaignToQueueItem(dueCampaign);
      if (!queueItem) return;

      const dueAt = Number(dueCampaign?.runtime?.next_due_at || next?.next_due_at || 0);
      const autoKey = `${queueItem.campaignId || queueItem.file}:${dueAt}`;
      if (lastAutoKeyRef.current === autoKey) return;
      const accepted = enqueuePlayback(queueItem);
      if (accepted) lastAutoKeyRef.current = autoKey;
    };

    void checkNextAd();
    const timer = window.setInterval(() => { void checkNextAd(); }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enqueuePlayback, isAdmin, radio.isPlaying, refreshNextAdState]);

  useEffect(() => {
    if (radio.isPlaying) return;
    lastAutoKeyRef.current = "";
    queueRef.current = [];
    syncQueueCount();
    if (settlePlaybackRef.current) {
      void settlePlaybackRef.current("skipped", "radio_paused");
    }
  }, [radio.isPlaying, syncQueueCount]);

  useEffect(() => {
    if (!isAdmin) {
      queueRef.current = [];
      syncQueueCount();
      return;
    }
    if (currentItemRef.current) return;
    if (!radio.isPlaying) return;
    const next = queueRef.current.shift();
    syncQueueCount();
    if (next) void startPlayback(next);
  }, [isAdmin, radio.isPlaying, startPlayback, syncQueueCount]);
  return null;
}
