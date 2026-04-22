import { useMemo } from "react";
import { useSearchParams, Link, Navigate } from "react-router-dom";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { ArrowLeft } from "lucide-react";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { Button } from "@/components/ui/button";

const PLAN_CATALOG: Record<
  string,
  { name: string; price: string; details: string }
> = {
  musculacao_completo_monthly: {
    name: "Musculação Completo",
    price: "R$ 120,00 / mês",
    details: "Inclui musculação, capoeira e dança.",
  },
  hidroginastica_monthly: {
    name: "Hidroginástica",
    price: "R$ 150,00 / mês",
    details: "Piscina aquecida. Seg, Qua e Sex.",
  },
  pilates_monthly: {
    name: "Pilates",
    price: "R$ 120,00 / mês",
    details: "2x por semana. Manhã ou noite.",
  },
  natacao_infantil_monthly: {
    name: "Natação Infantil e Baby",
    price: "R$ 140,00 / mês",
    details: "Turmas por faixa etária. Aulas de 45 min.",
  },
  natacao_adulto_monthly: {
    name: "Natação Adulto",
    price: "R$ 140,00 / mês",
    details: "Seg e Qua. Iniciantes e avançados.",
  },
};

export default function MatriculaPage() {
  const [searchParams] = useSearchParams();
  const priceId = searchParams.get("plano") ?? "";
  const plan = PLAN_CATALOG[priceId];

  const fetchClientSecret = useMemo(
    () => async () => {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/matricula/sucesso?session_id={CHECKOUT_SESSION_ID}`,
        },
      });
      if (error || !data?.clientSecret) {
        throw new Error(error?.message || "Falha ao iniciar checkout");
      }
      return data.clientSecret as string;
    },
    [priceId],
  );

  if (!priceId || !plan) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PaymentTestModeBanner />
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <span className="text-sm font-medium">Academia Oxigênio</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid lg:grid-cols-[1fr_1.4fr] gap-8">
        <aside className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano selecionado</p>
            <h1 className="text-2xl font-semibold mt-1">{plan.name}</h1>
            <p className="text-3xl font-bold text-primary mt-2">{plan.price}</p>
          </div>
          <p className="text-sm text-muted-foreground">{plan.details}</p>
          <div className="rounded-lg border border-border p-4 text-sm space-y-2 bg-muted/30">
            <p className="font-medium">Cobrança recorrente</p>
            <p className="text-muted-foreground">
              A mensalidade será debitada automaticamente todo mês no cartão informado. Você pode cancelar quando quiser.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Sem taxa de matrícula • Sem fidelidade
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Escolher outro plano</Link>
          </Button>
        </aside>

        <section className="rounded-lg border border-border bg-card p-1">
          <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </section>
      </main>
    </div>
  );
}
