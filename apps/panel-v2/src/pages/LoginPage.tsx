import { useState } from "react";
import { Dumbbell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePanelData } from "@/hooks/use-panel-data";

export default function LoginPage() {
  const { connected, login } = usePanelData();
  const [username, setUsername] = useState(() => window.localStorage.getItem("h_u") || "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password.trim() || submitting) return;
    setSubmitting(true);
    const ok = await login(username, password);
    if (!ok) setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>GymPanel</CardTitle>
              <CardDescription>{connected ? "Sistema online" : "Conectando ao sistema..."}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user">Usuário</Label>
            <Input
              id="user"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="usuario"
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              placeholder="senha"
              autoComplete="current-password"
            />
          </div>
          <Button className="w-full gap-2" onClick={submit} disabled={submitting || !username.trim() || !password.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
