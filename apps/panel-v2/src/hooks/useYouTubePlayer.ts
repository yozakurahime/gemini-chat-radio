import { useEffect, useRef, useCallback, useState } from "react";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

interface UseYouTubePlayerOptions {
  containerId: string;
  onEnd?: () => void;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
}

export function useYouTubePlayer({ containerId, onEnd, onReady, onStateChange }: UseYouTubePlayerOptions) {
  const playerRef = useRef<any>(null);
  const [isAPIReady, setIsAPIReady] = useState(!!window.YT?.Player);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Load YT IFrame API script once
  useEffect(() => {
    if (window.YT?.Player) {
      setIsAPIReady(true);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      setIsAPIReady(true);
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  }, []);

  // Time tracking
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startTimeTracking = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (playerRef.current?.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 500);
  }, []);

  const stopTimeTracking = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const loadVideo = useCallback((url: string) => {
    const videoId = extractVideoId(url);
    if (!videoId || !isAPIReady) return;

    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      return;
    }

    playerRef.current = new window.YT.Player(containerId, {
      height: "0",
      width: "0",
      videoId,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1 },
      events: {
        onReady: (e: any) => {
          setDuration(e.target.getDuration());
          onReady?.();
        },
        onStateChange: (e: any) => {
          onStateChange?.(e.data);
          if (e.data === window.YT.PlayerState.PLAYING) {
            setDuration(e.target.getDuration());
            startTimeTracking();
          } else if (e.data === window.YT.PlayerState.PAUSED) {
            stopTimeTracking();
          } else if (e.data === window.YT.PlayerState.ENDED) {
            stopTimeTracking();
            onEnd?.();
          }
        },
      },
    });
  }, [isAPIReady, containerId, onEnd, onReady, onStateChange, startTimeTracking, stopTimeTracking]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const setVolume = useCallback((v: number) => playerRef.current?.setVolume(v), []);
  const seekTo = useCallback((t: number) => playerRef.current?.seekTo(t, true), []);
  const destroy = useCallback(() => {
    stopTimeTracking();
    playerRef.current?.destroy();
    playerRef.current = null;
  }, [stopTimeTracking]);

  return { loadVideo, play, pause, setVolume, seekTo, destroy, isAPIReady, duration, currentTime };
}

export { extractVideoId };
