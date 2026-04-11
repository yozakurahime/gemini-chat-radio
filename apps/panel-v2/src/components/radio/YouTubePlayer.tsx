import { useEffect, useCallback, useState, useRef } from "react";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { Progress } from "@/components/ui/progress";

interface Track {
  id: string;
  title: string;
  url: string;
  duration?: string;
}

interface YouTubePlayerProps {
  playlist: Track[];
  currentTrackIndex: number;
  isPlaying: boolean;
  volume: number;
  onTrackEnd: () => void;
  onPlayStateChange: (playing: boolean) => void;
  onTrackTitleUpdate: (index: number, title: string) => void;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function YouTubePlayer({
  playlist,
  currentTrackIndex,
  isPlaying,
  volume,
  onTrackEnd,
  onPlayStateChange,
  onTrackTitleUpdate,
}: YouTubePlayerProps) {
  const lastLoadedUrl = useRef<string>("");

  const { loadVideo, play, pause, setVolume, duration, currentTime, isAPIReady } =
    useYouTubePlayer({
      containerId: "yt-player",
      onEnd: onTrackEnd,
      onStateChange: (state) => {
        if (state === 1) onPlayStateChange(true);
        else if (state === 2) onPlayStateChange(false);
      },
    });

  const currentTrack = playlist[currentTrackIndex];

  // Load video when track changes
  useEffect(() => {
    if (!currentTrack || !isAPIReady) return;
    if (currentTrack.url !== lastLoadedUrl.current) {
      lastLoadedUrl.current = currentTrack.url;
      loadVideo(currentTrack.url);
    }
  }, [currentTrack, isAPIReady, loadVideo]);

  // Play/pause sync
  useEffect(() => {
    if (!isAPIReady) return;
    if (isPlaying) play();
    else pause();
  }, [isPlaying, isAPIReady, play, pause]);

  // Volume sync
  useEffect(() => {
    if (isAPIReady) setVolume(volume);
  }, [volume, isAPIReady, setVolume]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* Hidden YT iframe container */}
      <div id="yt-player" className="hidden" />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="w-10 text-right font-mono">{formatTime(currentTime)}</span>
        <Progress value={progress} className="flex-1 h-1.5" />
        <span className="w-10 font-mono">{formatTime(duration)}</span>
      </div>

      {!isAPIReady && (
        <p className="text-xs text-muted-foreground animate-pulse">Carregando player do YouTube...</p>
      )}
    </div>
  );
}
