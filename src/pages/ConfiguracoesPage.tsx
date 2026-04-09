import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Bot, MapPin, Save, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

export default function ConfiguracoesPage() {
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
- Premium: R$ 199,90/mês (tudo incluso + personal 2x/semana)

🏋️ Aulas:
- Spinning: Ter/Qui 7h, 12h, 19h
- Funcional: Seg/Qua/Sex 8h, 17h
- Yoga: Seg/Qua 9h, 18h
- Muay Thai: Ter/Qui 20h

📋 Regras:
- É obrigatório o uso de toalha
- Atestado médico na matrícula
- Cancelamento com 30 dias de antecedência`
  );

  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTestLoading, setIsTestLoading] = useState(false);

  const [gymLat, setGymLat] = useState("-23.5505");
  const [gymLng, setGymLng] = useState("-46.6333");
  const [gymRadius, setGymRadius] = useState("100");

  const handleSaveContext = () => {
    toast.success("Contexto da IA salvo com sucesso!");
  };

  const handleTestAI = async () => {
    if (!testMessage.trim()) return;
    setIsTestLoading(true);
    // Mock response for now - will integrate with Lovable AI Gateway
    setTimeout(() => {
      setTestResponse(
        "Olá! 🏋️ Baseado no nosso contexto, posso responder: A academia funciona de segunda a sexta das 6h às 22h. Deseja saber mais sobre nossos planos?"
      );
      setIsTestLoading(false);
    }, 1500);
  };

  const handleSaveLocation = () => {
    toast.success("Localização da academia atualizada!");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Configurações</h1>
      </div>

      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ai" className="gap-1">
            <Bot className="h-4 w-4" /> Contexto da IA
          </TabsTrigger>
          <TabsTrigger value="location" className="gap-1">
            <MapPin className="h-4 w-4" /> Localização
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4" /> Contexto da IA (Gemini)
              </CardTitle>
              <CardDescription>
                Este texto será usado como base de conhecimento para a IA responder automaticamente
                no WhatsApp. Inclua todas as informações relevantes sobre a academia.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                placeholder="Digite aqui todas as informações da academia..."
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {aiContext.length} caracteres
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-1" onClick={() => setAiContext("")}>
                    <RotateCcw className="h-4 w-4" /> Limpar
                  </Button>
                  <Button className="gap-1" onClick={handleSaveContext}>
                    <Save className="h-4 w-4" /> Salvar Contexto
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Test AI */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Testar Resposta da IA</CardTitle>
              <CardDescription>
                Envie uma mensagem de teste para verificar como a IA responde com o contexto atual
              </CardDescription>
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
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                      IA Gemini
                    </Badge>
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
                <MapPin className="h-4 w-4" /> Localização da Academia
              </CardTitle>
              <CardDescription>
                Configure as coordenadas e o raio de proximidade para validação do ponto dos funcionários
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <Input value={gymRadius} onChange={(e) => setGymRadius(e.target.value)} placeholder="100" type="number" />
                </div>
              </div>
              <Button className="gap-1" onClick={handleSaveLocation}>
                <Save className="h-4 w-4" /> Salvar Localização
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
