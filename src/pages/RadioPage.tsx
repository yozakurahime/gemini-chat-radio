import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Play, Pause, SkipForward, SkipBack,
  Volume2, VolumeX, Radio, Music, Megaphone, GripVertical,
  ListMusic, Clock, Building2, FileText, BarChart3, Settings,
} from "lucide-react";
import YouTubePlayer from "@/components/radio/YouTubePlayer";
import AdPlayer from "@/components/radio/AdPlayer";
import RadioDashboard from "@/components/radio/RadioDashboard";
import AdvertisersList from "@/components/radio/AdvertisersList";
import ContractsList from "@/components/radio/ContractsList";
import AdsList from "@/components/radio/AdsList";
import AdScheduleView from "@/components/radio/AdScheduleView";
import AdLogs from "@/components/radio/AdLogs";
import RadioReports from "@/components/radio/RadioReports";
import RadioSettingsPanel from "@/components/radio/RadioSettingsPanel";

interface Track {
  id: string;
  title: string;
  url: string;
  duration?: string;
}

const mockPlaylist: Track[] = [
  { id: "1", title: "Motivação Total - Mix Treino", url: "https://youtube.com/watch?v=abc123", duration: "4:32" },
  { id: "2", title: "Rock Pesado Academia", url: "https://youtube.com/watch?v=def456", duration: "3:45" },
  { id: "3", title: "EDM Workout 2024", url: "https://youtube.com/watch?v=ghi789", duration: "5:10" },
  { id: "4", title: "Pop Hits - Cardio", url: "https://youtube.com/watch?v=jkl012", duration: "3:58" },
];

export default function RadioPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState([75]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [playlist, setPlaylist] = useState(mockPlaylist);
  const [newUrl, setNewUrl] = useState("");
  const [duckingLevel, setDuckingLevel] = useState([20]);
  const [isDucked, setIsDucked] = useState(false);

  const effectiveVolume = isDucked ? duckingLevel[0] : volume[0];

  const handleTrackEnd = useCallback(() => {
    setCurrentTrackIndex((prev) => (prev < playlist.length - 1 ? prev + 1 : 0));
  }, [playlist.length]);

  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  const handleTrackTitleUpdate = useCallback((index: number, title: string) => {
    setPlaylist((prev) => prev.map((t, i) => (i === index ? { ...t, title } : t)));
  }, []);

  const currentTrack = playlist[currentTrackIndex];

  const addTrack = () => {
    if (!newUrl.trim()) return;
    const newTrack: Track = { id: Date.now().toString(), title: `Nova música (${newUrl.substring(0, 30)}...)`, url: newUrl };
    setPlaylist([...playlist, newTrack]);
    setNewUrl("");
  };

  const removeTrack = (id: string) => setPlaylist(playlist.filter((t) => t.id !== id));

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Radio className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Rádio Interna</h1>
        {isPlaying && <Badge className="bg-primary text-primary-foreground animate-pulse">NO AR</Badge>}
        {isDucked && <Badge variant="secondary" className="animate-pulse"><Megaphone className="h-3 w-3 mr-1" /> Anúncio</Badge>}
      </div>

      {/* Player */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCurrentTrackIndex(Math.max(0, currentTrackIndex - 1))}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button size="icon" className="h-11 w-11" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCurrentTrackIndex(Math.min(playlist.length - 1, currentTrackIndex + 1))}>
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{currentTrack?.title || "Nenhuma música"}</p>
              <p className="text-sm text-muted-foreground">{currentTrack?.duration || "--:--"}</p>
            </div>

            <div className="flex items-center gap-2 w-36">
              {effectiveVolume === 0 ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-muted-foreground" />}
              <Slider value={volume} onValueChange={setVolume} max={100} className="flex-1" />
              <span className="text-xs text-muted-foreground w-8">{effectiveVolume}%</span>
            </div>
          </div>

          <YouTubePlayer
            playlist={playlist}
            currentTrackIndex={currentTrackIndex}
            isPlaying={isPlaying}
            volume={effectiveVolume}
            onTrackEnd={handleTrackEnd}
            onPlayStateChange={handlePlayStateChange}
            onTrackTitleUpdate={handleTrackTitleUpdate}
          />

          <AdPlayer
            isPlaying={isPlaying}
            musicVolume={volume[0]}
            duckingLevel={duckingLevel[0]}
            onDucking={setIsDucked}
          />
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="playlist" className="gap-1"><ListMusic className="h-3.5 w-3.5" /> Playlist</TabsTrigger>
          <TabsTrigger value="advertisers" className="gap-1"><Building2 className="h-3.5 w-3.5" /> Anunciantes</TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1"><FileText className="h-3.5 w-3.5" /> Contratos</TabsTrigger>
          <TabsTrigger value="ads" className="gap-1"><Megaphone className="h-3.5 w-3.5" /> Anúncios</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1"><Clock className="h-3.5 w-3.5" /> Grade</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1"><FileText className="h-3.5 w-3.5" /> Logs</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Relatórios</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Settings className="h-3.5 w-3.5" /> Config</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><RadioDashboard /></TabsContent>

        <TabsContent value="playlist" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-2 mb-4">
                <Input placeholder="Cole o link do YouTube..." value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="flex-1" />
                <Button onClick={addTrack}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <span className="text-sm text-muted-foreground">Audio Ducking:</span>
                <Slider value={duckingLevel} onValueChange={setDuckingLevel} max={100} className="w-40" />
                <span className="text-xs text-muted-foreground">{duckingLevel[0]}%</span>
              </div>
              <ScrollArea className="max-h-80">
                <div className="space-y-1">
                  {playlist.map((track, index) => (
                    <div
                      key={track.id}
                      className={`flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 group ${
                        index === currentTrackIndex ? "bg-primary/5 border border-primary/20" : ""
                      }`}
                      onClick={() => setCurrentTrackIndex(index)}
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advertisers"><AdvertisersList /></TabsContent>
        <TabsContent value="contracts"><ContractsList /></TabsContent>
        <TabsContent value="ads"><AdsList /></TabsContent>
        <TabsContent value="schedule"><AdScheduleView /></TabsContent>
        <TabsContent value="logs"><AdLogs /></TabsContent>
        <TabsContent value="reports"><RadioReports /></TabsContent>
        <TabsContent value="settings"><RadioSettingsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
