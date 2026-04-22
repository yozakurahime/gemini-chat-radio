import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

export default function MatriculaSucessoPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PaymentTestModeBanner />
      <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Pagamento confirmado!</h1>
          <p className="text-muted-foreground">
            Sua assinatura mensal foi ativada. Bem-vindo à Academia Oxigênio.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 text-left space-y-4">
          <h2 className="font-semibold text-lg">Próximos passos</h2>
          <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside">
            <li>
              <span className="text-foreground">Compareça à recepção</span> para finalizar a
              matrícula presencial e receber sua carteirinha.
            </li>
            <li>
              <span className="text-foreground">Leve um documento com foto</span> (RG ou CNH).
            </li>
            <li>
              <span className="text-foreground">Combine seu horário</span> de treino ou turma com
              a equipe.
            </li>
          </ol>

          <div className="border-t border-border pt-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span className="text-muted-foreground">
                Av. Contorno, Quadra 14, Lote 29, nº 422 — Setor Jardim Colorado, Goiânia - GO
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span className="text-muted-foreground">
                Seg a Sex: 05:30 às 23:00 • Sáb: 07:00 às 12:00
              </span>
            </div>
          </div>
        </div>

        {sessionId && (
          <p className="text-xs text-muted-foreground">
            Comprovante: <span className="font-mono">{sessionId.slice(0, 24)}…</span>
          </p>
        )}

        <Button asChild>
          <Link to="/">Voltar para a página inicial</Link>
        </Button>
      </main>
    </div>
  );
}
