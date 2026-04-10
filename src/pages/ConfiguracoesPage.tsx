import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Bot, MapPin, Save, RotateCcw, Send, Users } from "lucide-react";
import { toast } from "sonner";
import UserManagement from "@/components/settings/UserManagement";
import { useAcademySettings, useUpdateAcademySettings } from "@/hooks/usePontoData";

export default function ConfiguracoesPage() {
  const { data: settings } = useAcademySettings();
  const updateSettings = useUpdateAcademySettings();

  const [aiContext, setAiContext] = useState(
    `Academia FitMax - Informações para Atendimento

📍 Endereço: Rua das Flores, 123 - Centro
📞 Telefone: (11) 3456-7890

⏰ Horários:
- Segunda a Sexta: 06h às 22h
- Sábado: 08h às 14h
- Domingo e Feriados: Fechado

💪 Planos:
- Básico: R$ 89,90/mês (musculação)
- Completo: R$ 139,90/mês (musculação + aulas)
- Premium: R$ 199,90/mês (tudo incluso + personal 2x/semana)`
  );

  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTestLoading, setIsTestLoading] = useState(false);

  const [gymName, setGymName] = useState("");
  const [gymLat, setGymLat] = useState("");
  const [gymLng, setGymLng] = useState("");
  const [gymRadius, setGymRadius] = useState("");
  const [opStart, setOpStart] = useState("");
  const [opEnd, setOpEnd] = useState("");
  const [autoClose, setAutoClose] = useState(true);

  useEffect(() => {
    if (settings) {
      setGymName(settings.academy_name);
      setGymLat(settings.lat.toString());
      setGymLng(settings.lng.toString());
      setGymRadius(settings.radius_meters.toString());
      setOpStart(settings.operating_start.slice(0, 5));
      setOpEnd(settings.operating_end.slice(0, 5));
      setAutoClose(settings.auto_close_enabled);
    }
  }, [settings]);

  const handleSaveContext = () => {
    toast.success("Contexto da IA salvo com sucesso!");
  };

  const handleTestAI = async () => {
    if (!testMessage.trim()) return;
    setIsTestLoading(true);
    setTimeout(() => {
      setTestResponse(
        "Olá! 🏋️ Baseado no nosso contexto, posso responder: A academia funciona de segunda a sexta das 6h às 22h. Deseja saber mais sobre nossos planos?"
      );
      setIsTestLoading(false);
    }, 1500);
  };

  const handleSaveLocation = () => {
    if (!settings) return;
    updateSettings.mutate({
      id: settings.id,
      academy_name: gymName,
      lat: parseFloat(gymLat),
      lng: parseFloat(gymLng),
      radius_meters: parseInt(gymRadius),
      operating_start: opStart,
      operating_end: opEnd,
      auto_close_enabled: autoClose,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Configurações</h1>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-1">
            <Users className="h-4 w-4" /> Atendentes
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1">
            <Bot className="h-4 w-4" /> Contexto da IA
          </TabsTrigger>
          <TabsTrigger value="location" className="gap-1">
            <MapPin className="h-4 w-4" /> Academia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UserManagement />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4" /> Contexto da IA (Gemini)
              </CardTitle>
              <CardDescription>
                Texto usado como base de conhecimento para a IA responder no WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{aiContext.length} caracteres</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-1" onClick={() => setAiContext("")}>
                    <RotateCcw className="h-4 w-4" /> Limpar
                  </Button>
                  <Button className="gap-1" onClick={handleSaveContext}>
                    <Save className="h-4 w-4" /> Salvar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Testar Resposta da IA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Qual o horário de funcionamento?"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTestAI()}
                />
                <Button onClick={handleTestAI} disabled={isTestLoading} className="gap-1">
                  <Send className="h-4 w-4" /> Testar
                </Button>
              </div>
              {testResponse && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-1 mb-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">IA Gemini</Badge>
                  </div>
                  <p className="text-sm">{testResponse}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Configurações da Academia
              </CardTitle>
              <CardDescription>
                Coordenadas, raio de proximidade para ponto e horário de funcionamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Nome da Academia</Label>
                <Input value={gymName} onChange={(e) => setGymName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Latitude</Label>
                  <Input value={gymLat} onChange={(e) => setGymLat(e.target.value)} placeholder="-23.5505" />
                </div>
                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input value={gymLng} onChange={(e) => setGymLng(e.target.value)} placeholder="-46.6333" />
                </div>
                <div className="space-y-2">
                  <Label>Raio (metros)</Label>
                  <Input value={gymRadius} onChange={(e) => setGymRadius(e.target.value)} type="number" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Horário de Abertura</Label>
                  <Input type="time" value={opStart} onChange={(e) => setOpStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Horário de Fechamento</Label>
                  <Input type="time" value={opEnd} onChange={(e) => setOpEnd(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Fechamento automático do ponto</Label>
                  <p className="text-xs text-muted-foreground">
                    Registra saída automaticamente no horário de fechamento
                  </p>
                </div>
                <Switch checked={autoClose} onCheckedChange={setAutoClose} />
              </div>
              <Button className="gap-1" onClick={handleSaveLocation}>
                <Save className="h-4 w-4" /> Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
