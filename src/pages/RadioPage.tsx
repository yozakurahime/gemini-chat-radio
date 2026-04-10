import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Plus, Trash2, Play, Pause, SkipForward, SkipBack,
  Volume2, VolumeX, Radio, Music, Megaphone, GripVertical,
  ListMusic, Clock,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import YouTubePlayer from "@/components/radio/YouTubePlayer";

interface Track {
  id: string;
  title: string;
  url: string;
  duration?: string;
}

interface Ad {
  id: string;
  name: string;
  interval: number; // minutes between plays
  enabled: boolean;
}

const mockPlaylist: Track[] = [
  { id: "1", title: "Motivação Total - Mix Treino", url: "https://youtube.com/watch?v=abc123", duration: "4:32" },
  { id: "2", title: "Rock Pesado Academia", url: "https://youtube.com/watch?v=def456", duration: "3:45" },
  { id: "3", title: "EDM Workout 2024", url: "https://youtube.com/watch?v=ghi789", duration: "5:10" },
  { id: "4", title: "Pop Hits - Cardio", url: "https://youtube.com/watch?v=jkl012", duration: "3:58" },
];

const mockAds: Ad[] = [
  { id: "a1", name: "Promoção Plano Anual", interval: 30, enabled: true },
  { id: "a2", name: "Aula Experimental Grátis", interval: 45, enabled: true },
  { id: "a3", name: "Loja de Suplementos", interval: 60, enabled: false },
];

export default function RadioPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState([75]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [playlist, setPlaylist] = useState(mockPlaylist);
  const [ads, setAds] = useState(mockAds);
  const [newUrl, setNewUrl] = useState("");
  const [duckingLevel, setDuckingLevel] = useState([20]);

  const currentTrack = playlist[currentTrackIndex];

  const addTrack = () => {
    if (!newUrl.trim()) return;
    const newTrack: Track = {
      id: Date.now().toString(),
      title: `Nova música (${newUrl.substring(0, 30)}...)`,
      url: newUrl,
    };
    setPlaylist([...playlist, newTrack]);
    setNewUrl("");
  };

  const removeTrack = (id: string) => {
    setPlaylist(playlist.filter((t) => t.id !== id));
  };

  const toggleAd = (id: string) => {
    setAds(ads.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Radio className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Rádio Interna</h1>
        {isPlaying && (
          <Badge className="bg-primary text-primary-foreground animate-pulse">
            NO AR
          </Badge>
        )}
      </div>

      {/* Player */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentTrackIndex(Math.max(0, currentTrackIndex - 1))}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button size="icon" className="h-12 w-12" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentTrackIndex(Math.min(playlist.length - 1, currentTrackIndex + 1))}>
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{currentTrack?.title || "Nenhuma música"}</p>
              <p className="text-sm text-muted-foreground">{currentTrack?.duration || "--:--"}</p>
            </div>

            <div className="flex items-center gap-2 w-40">
              {volume[0] === 0 ? (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Volume2 className="h-4 w-4 text-muted-foreground" />
              )}
              <Slider value={volume} onValueChange={setVolume} max={100} className="flex-1" />
              <span className="text-xs text-muted-foreground w-8">{volume[0]}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="playlist" className="space-y-4">
        <TabsList>
          <TabsTrigger value="playlist" className="gap-1">
            <ListMusic className="h-4 w-4" /> Playlist
          </TabsTrigger>
          <TabsTrigger value="ads" className="gap-1">
            <Megaphone className="h-4 w-4" /> Anúncios
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1">
            <Clock className="h-4 w-4" /> Programação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="playlist" className="space-y-4">
          {/* Add Track */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Adicionar Música</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Cole o link do YouTube (vídeo ou playlist)..."
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={addTrack} className="gap-1">
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Playlist */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Music className="h-4 w-4" /> Playlist ({playlist.length} músicas)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-96">
                <div className="space-y-1">
                  {playlist.map((track, index) => (
                    <div
                      key={track.id}
                      className={`flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 group ${
                        index === currentTrackIndex ? "bg-primary/5 border border-primary/20" : ""
                      }`}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                      {index === currentTrackIndex && isPlaying ? (
                        <div className="flex gap-0.5 items-end h-4">
                          <div className="w-0.5 bg-primary animate-pulse h-2" />
                          <div className="w-0.5 bg-primary animate-pulse h-4" style={{ animationDelay: "0.2s" }} />
                          <div className="w-0.5 bg-primary animate-pulse h-3" style={{ animationDelay: "0.4s" }} />
                        </div>
                      ) : (
                        <Play className="h-3 w-3 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{track.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{track.url}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{track.duration || "--:--"}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100"
                        onClick={() => removeTrack(track.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ads" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audio Ducking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Volume da música durante anúncios
              </p>
              <div className="flex items-center gap-4">
                <Slider value={duckingLevel} onValueChange={setDuckingLevel} max={100} className="flex-1" />
                <span className="text-sm font-medium w-12">{duckingLevel[0]}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4" /> Anúncios Cadastrados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ads.map((ad) => (
                  <div key={ad.id} className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <p className="text-sm font-medium">{ad.name}</p>
                      <p className="text-xs text-muted-foreground">A cada {ad.interval} min</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={ad.enabled ? "default" : "secondary"}>
                        {ad.enabled ? "Ativo" : "Inativo"}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => toggleAd(ad.id)}>
                        {ad.enabled ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Programação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { time: "06:00 - 09:00", playlist: "Warm Up - Pop", active: true },
                  { time: "09:00 - 12:00", playlist: "Treino Pesado - Rock", active: true },
                  { time: "12:00 - 14:00", playlist: "Almoço - Lo-fi", active: false },
                  { time: "14:00 - 18:00", playlist: "Cardio - EDM", active: true },
                  { time: "18:00 - 22:00", playlist: "Peak Hour - Mix", active: true },
                ].map((slot, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-md border">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-mono">{slot.time}</span>
                    </div>
                    <span className="text-sm">{slot.playlist}</span>
                    <Badge variant={slot.active ? "default" : "secondary"}>
                      {slot.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
