import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { PanelDataProvider, usePanelData } from "@/hooks/use-panel-data";
import Index from "./pages/Index";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import PontoPage from "./pages/PontoPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import ScaPage from "./pages/ScaPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthenticatedRoutes() {
  const { authLoading, user } = usePanelData();

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        Carregando painel...
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/atendimento" element={<Index />} />
        <Route path="/ponto" element={<PontoPage />} />
        <Route path="/sca" element={<ScaPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename="/painel">
        <PanelDataProvider>
          <AuthenticatedRoutes />
        </PanelDataProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
