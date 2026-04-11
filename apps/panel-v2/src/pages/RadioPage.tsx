import { useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  Clock,
  FileText,
  ListMusic,
  Megaphone,
  Pause,
  Play,
  Plus,
  Radio,
  Settings,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePanelData } from "@/hooks/use-panel-data";
import RadioDashboard from "@/components/radio/RadioDashboard";
import AdvertisersList from "@/components/radio/AdvertisersList";
import ContractsList from "@/components/radio/ContractsList";
import AdsList from "@/components/radio/AdsList";
import AdScheduleView from "@/components/radio/AdScheduleView";
import AdLogs from "@/components/radio/AdLogs";
import RadioReports from "@/components/radio/RadioReports";
import RadioSettingsPanel from "@/components/radio/RadioSettingsPanel";

function trackId(track: any) {
  return String(track?.id || track?.videoId || track?.url || track?.title || "");
}
function trackTitle(track: any) {
  return String(track?.title || track?.name || track?.videoId || "Musica sem titulo");
}
function trackUrl(track: any) {
  return String(track?.url || track?.webpage_url || track?.videoId || "");
}

export default function RadioPage() {
  const { radio, playlist, adPlayback, toggleRadio, skipTrack, playTrack, addTrack, removeTrack, updateRadioSettings } = usePanelData();
  const [newUrl, setNewUrl] = useState("");

  const currentTrack = radio.currentTrack || playlist[0] || null;
  const currentTrackId = trackId(currentTrack);
  const volume = useMemo(() => [Math.max(0, Math.min(100, Number(radio.musicVolume || 0)))], [radio.musicVolume]);

  const add = () => {
    if (!newUrl.trim()) return;
    addTrack(newUrl);
    setNewUrl("");
  };
  const setVolume = (next: number[]) => updateRadioSettings({ musicVolume: next[0] });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Radio interna</h1>
            <p className="text-sm text-muted-foreground">Musica continua com anuncios comerciais automatizados.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={radio.isPlaying ? "default" : "secondary"}>{radio.isPlaying ? "NO AR" : "PAUSADA"}</Badge>
          {adPlayback.isPlaying ? <Badge variant="secondary">ANUNCIO TOCANDO</Badge> : null}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button size="icon" className="h-11 w-11" onClick={toggleRadio}>
                {radio.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <Button variant="outline" size="icon" onClick={skipTrack}>
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{trackTitle(currentTrack)}</p>
              <p className="truncate text-sm text-muted-foreground">{trackUrl(currentTrack) || "Aguardando faixa"}</p>
            </div>
            <div className="flex w-44 items-center gap-2">
              {volume[0] === 0 ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-muted-foreground" />}
              <Slider value={volume} onValueChange={setVolume} max={100} className="flex-1" />
              <span className="w-8 text-xs text-muted-foreground">{volume[0]}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="dashboard" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>
          <TabsTrigger value="playlist" className="gap-1"><ListMusic className="h-3.5 w-3.5" /> Playlist</TabsTrigger>
          <TabsTrigger value="advertisers" className="gap-1"><Building2 className="h-3.5 w-3.5" /> Anunciantes</TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1"><FileText className="h-3.5 w-3.5" /> Contratos</TabsTrigger>
          <TabsTrigger value="ads" className="gap-1"><Megaphone className="h-3.5 w-3.5" /> Anuncios</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1"><Clock className="h-3.5 w-3.5" /> Grade</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1"><FileText className="h-3.5 w-3.5" /> Logs</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Relatorios</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Settings className="h-3.5 w-3.5" /> Config</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><RadioDashboard /></TabsContent>

        <TabsContent value="playlist" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Adicionar musica</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 md:flex-row">
              <Input placeholder="Cole o link do YouTube..." value={newUrl} onChange={(event) => setNewUrl(event.target.value)} className="flex-1" />
              <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Playlist ({playlist.length})</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[30rem]">
                <div className="space-y-2 pr-4">
                  {playlist.length ? playlist.map((track, index) => {
                    const id = trackId(track);
                    const selected = id && id === currentTrackId;
                    return (
                      <div key={id || `${index}`} className={`rounded-lg border p-3 ${selected ? "border-primary bg-primary/5" : ""}`}>
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-xs text-muted-foreground">{index + 1}</span>
                          <Button variant={selected ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => playTrack(track)}>
                            <Play className="h-3 w-3" />
                          </Button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{trackTitle(track)}</p>
                            <p className="truncate text-xs text-muted-foreground">{trackUrl(track)}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTrack(id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Nenhuma faixa cadastrada.</div>
                  )}
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
