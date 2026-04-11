import { useEffect, useMemo, useRef, useState } from "react";
import { usePanelData } from "@/hooks/use-panel-data";

const RADIO_COMMAND_EVENT = "himefit-radio-command";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    __himefitYouTubeApiPromise?: Promise<any>;
  }
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.__himefitYouTubeApiPromise) return window.__himefitYouTubeApiPromise;

  window.__himefitYouTubeApiPromise = new Promise((resolve) => {
    let settled = false;
    const previousReady = window.onYouTubeIframeAPIReady;
    const finish = () => {
      if (settled) return;
      if (!window.YT?.Player) return;
      settled = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(fallbackTimer);
      resolve(window.YT);
    };

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      finish();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScript = document.getElementsByTagName("script")[0];
      firstScript?.parentNode?.insertBefore(tag, firstScript);
    }

    const pollTimer = window.setInterval(finish, 250);
    const fallbackTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollTimer);
      resolve(window.YT);
    }, 15000);

    finish();
  });

  return window.__himefitYouTubeApiPromise;
}

function extractYouTubeVideoId(track: any) {
  const isVideoId = (value: unknown) => /^[a-zA-Z0-9_-]{11}$/.test(String(value || "").trim());
  const direct = String(track?.videoId || track?.youtubeId || "").trim();
  if (isVideoId(direct)) return direct;

  const candidates = [
    track?.url,
    track?.webpage_url,
    track?.originalUrl,
    track?.sourceUrl,
  ].map((value) => String(value || "").trim()).filter(Boolean);

  for (const candidate of candidates) {
    if (isVideoId(candidate)) return candidate;
    try {
      const url = new URL(candidate);
      const byV = url.searchParams.get("v");
      if (byV && isVideoId(byV)) return byV;
      const pathParts = url.pathname.split("/").filter(Boolean);
      const knownPart = pathParts.find((part, index) => (
        ["embed", "shorts", "live"].includes(pathParts[index - 1]) && isVideoId(part)
      ));
      if (knownPart) return knownPart;
      if (url.hostname.includes("youtu.be") && pathParts[0] && isVideoId(pathParts[0])) {
        return pathParts[0];
      }
    } catch {
      const match = candidate.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
      if (match?.[1]) return match[1];
    }
  }

  return "";
}

function isValidVideoId(value: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(value || "").trim());
}

export default function GlobalYouTubeRadio() {
  const { radio, playlist, skipTrack, adPlayback } = usePanelData();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const lastVideoIdRef = useRef("");
  const shouldPlayRef = useRef(false);
  const videoIdRef = useRef("");
  const [ready, setReady] = useState(false);

  const currentTrack = radio.currentTrack || playlist[0] || null;
  const videoId = useMemo(() => extractYouTubeVideoId(currentTrack), [currentTrack]);
  const effectiveVolume = useMemo(() => {
    const musicVolume = Math.max(0, Math.min(100, Number(radio.musicVolume || 0)));
    if (!adPlayback.isPlaying) return musicVolume;
    const duckRatio = Math.max(0, Math.min(100, Number(radio.adVolume || 0))) / 100;
    return Math.round(musicVolume * duckRatio);
  }, [adPlayback.isPlaying, radio.adVolume, radio.musicVolume]);

  useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current || playerRef.current || !isValidVideoId(videoId)) return;
      if (!YT?.Player) return;

      playerRef.current = new YT.Player(hostRef.current, {
        width: 200,
        height: 200,
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            event.target.setVolume(effectiveVolume);
            setReady(true);
          },
          onStateChange: (event: any) => {
            if (window.YT && event.data === window.YT.PlayerState.ENDED) {
              skipTrack();
            }
          },
          onError: () => {
            if (shouldPlayRef.current) skipTrack();
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveVolume, skipTrack, videoId]);

  useEffect(() => {
    shouldPlayRef.current = !!radio.isPlaying;
  }, [radio.isPlaying]);

  useEffect(() => {
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; track?: any }>).detail || {};
      const player = playerRef.current;
      if (!player) return;

      try {
        if (detail.action === "pause") {
          player.pauseVideo();
          return;
        }

        if (detail.action !== "play") return;
        const nextVideoId = extractYouTubeVideoId(detail.track) || videoIdRef.current;
        if (!isValidVideoId(nextVideoId)) return;

        if (lastVideoIdRef.current !== nextVideoId) {
          lastVideoIdRef.current = nextVideoId;
          player.loadVideoById(nextVideoId);
          return;
        }

        player.playVideo();
      } catch {
        /* The state-driven effect will retry after React commits. */
      }
    };

    window.addEventListener(RADIO_COMMAND_EVENT, onCommand);
    return () => window.removeEventListener(RADIO_COMMAND_EVENT, onCommand);
  }, []);

  useEffect(() => {
    if (!ready || !playerRef.current) return;
    try {
      playerRef.current.setVolume(effectiveVolume);
    } catch {
      /* ignore */
    }
  }, [effectiveVolume, ready]);

  useEffect(() => {
    if (!ready || !playerRef.current) return;
    const player = playerRef.current;

    try {
      if (!isValidVideoId(videoId)) {
        player.pauseVideo();
        lastVideoIdRef.current = "";
        return;
      }

      if (lastVideoIdRef.current !== videoId) {
        lastVideoIdRef.current = videoId;
        if (radio.isPlaying) {
          player.loadVideoById(videoId);
        } else {
          player.cueVideoById(videoId);
        }
        return;
      }

      if (radio.isPlaying) {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    } catch {
      /* The API can throw while the iframe is still settling. The next state update retries. */
    }
  }, [radio.isPlaying, ready, videoId]);

  return (
    <div
      aria-hidden="true"
      className="fixed bottom-0 right-0 h-[200px] w-[200px] overflow-hidden opacity-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <div ref={hostRef} />
    </div>
  );
}
