import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConfiguracoesPage from "@/pages/ConfiguracoesPage";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  saveKnowledgeBase: vi.fn(),
  saveGeoPolicy: vi.fn(),
}));

vi.mock("@/lib/panel-api", () => ({
  jsonHeaders: { "Content-Type": "application/json" },
  apiFetch: mocks.apiFetch,
}));

vi.mock("@/hooks/use-panel-data", () => ({
  usePanelData: () => ({
    user: { username: "admin", role: "admin" },
    knowledgeBase: "Contexto antigo QA",
    saveKnowledgeBase: mocks.saveKnowledgeBase,
    geoPolicy: null,
    saveGeoPolicy: mocks.saveGeoPolicy,
    systemHealth: null,
    pixPlans: [],
    pixCharges: [],
    refreshPixPlans: vi.fn().mockResolvedValue(undefined),
    createPixPlan: vi.fn().mockResolvedValue(true),
    updatePixPlan: vi.fn().mockResolvedValue(true),
    deletePixPlan: vi.fn().mockResolvedValue(true),
    refreshPixCharges: vi.fn().mockResolvedValue(undefined),
    confirmPixScaDone: vi.fn().mockResolvedValue(true),
    pixSafeConfig: null,
    loadPixSafeConfig: vi.fn().mockResolvedValue(null),
    savePixSafeConfig: vi.fn().mockResolvedValue(true),
    pixDailyImports: [],
    refreshPixDailyImports: vi.fn().mockResolvedValue(undefined),
    uploadPixDailyImport: vi.fn().mockResolvedValue(true),
    scaInactiveStudents: [],
    refreshScaInactiveStudents: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ConfiguracoesPage guided IA context profile", () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.saveKnowledgeBase.mockReset();
    mocks.saveGeoPolicy.mockReset();

    mocks.apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/admin/users") {
        return jsonResponse({ users: [] });
      }
      if (url === "/admin/system/alerts/config") {
        return jsonResponse({ config: { enabled: true, whatsappDestinations: [], thresholds: {} } });
      }
      if (url === "/admin/knowledge/profile") {
        return jsonResponse({ profile: null, base_context: "Contexto antigo QA" });
      }
      if (url === "/admin/knowledge/availability") {
        return jsonResponse({ ok: true, availability: { entries: [], updatedAt: 0, updatedBy: "" } });
      }
      if (url === "/admin/knowledge/availability/save") {
        const body = JSON.parse(String(options?.body || "{}"));
        return jsonResponse({
          ok: true,
          availability: {
            entries: body.availability.entries,
            updatedAt: Date.now(),
            updatedBy: "admin",
          },
        });
      }
      if (url === "/admin/knowledge/profile/save") {
        const body = JSON.parse(String(options?.body || "{}"));
        return jsonResponse({
          success: true,
          profile: body.profile,
          base_context: [
            "# CONTEXTO DA ACADEMIA",
            "",
            "Academia: Academia Teste",
            "Modalidades: Hidroginastica 3x por semana.",
          ].join("\n"),
        });
      }
      return jsonResponse({});
    });
  });

  it("loads old context into the guided form and saves the structured profile", async () => {
    render(<ConfiguracoesPage />);

    expect(await screen.findByText(/Formulario para montar o contexto/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith("/admin/knowledge/profile");
    });

    expect(screen.getByDisplayValue("Contexto antigo QA")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Academia Oxigenio"), {
      target: { value: "Academia Teste" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Segunda a sexta/i), {
      target: { value: "Segunda a sexta: 06h as 22h" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Musculacao: acesso livre/i), {
      target: { value: "Hidroginastica 3x por semana." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Salvar formulario/i }));

    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        "/admin/knowledge/profile/save",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const saveCall = mocks.apiFetch.mock.calls.find(([url]) => url === "/admin/knowledge/profile/save");
    const payload = JSON.parse(String(saveCall?.[1]?.body || "{}"));
    expect(payload.profile.academy.name).toBe("Academia Teste");
    expect(payload.profile.importedContext).toBe("Contexto antigo QA");

    fireEvent.click(screen.getByRole("tab", { name: /Texto avancado/i }));
    expect(await screen.findByDisplayValue(/Academia Teste/i)).toBeInTheDocument();
  });

  it("adds and saves current modality availability for the AI", async () => {
    render(<ConfiguracoesPage />);

    const availabilityTab = await screen.findByRole("tab", { name: /Vagas/i });
    fireEvent.mouseDown(availabilityTab, { button: 0, ctrlKey: false });
    fireEvent.change(await screen.findByPlaceholderText("Ex: Natação infantil"), { target: { value: "Natação infantil" } });
    fireEvent.change(screen.getByPlaceholderText("Ex: Ter/Qui às 16:00"), { target: { value: "Ter/Qui às 16:00" } });
    fireEvent.change(screen.getByPlaceholderText("Ex: 3"), { target: { value: "1" } });
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar à lista/i }));

    expect(await screen.findByText("Natação infantil")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Salvar vagas para a IA/i }));

    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        "/admin/knowledge/availability/save",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const saveCall = mocks.apiFetch.mock.calls.find(([url]) => url === "/admin/knowledge/availability/save");
    const payload = JSON.parse(String(saveCall?.[1]?.body || "{}"));
    expect(payload.availability.entries[0]).toEqual(expect.objectContaining({
      modality: "Natação infantil",
      schedule: "Ter/Qui às 16:00",
      availableSpots: 1,
    }));
  });
});
