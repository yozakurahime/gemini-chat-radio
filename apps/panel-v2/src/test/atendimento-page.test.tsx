import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AtendimentoPage from "@/pages/Index";

const mockSelectChat = vi.fn();
const mockSendText = vi.fn();
const mockSetChatIAEnabled = vi.fn();
const mockLoadMoreMessages = vi.fn();
const mockFetchAiContextPreview = vi.fn();
const mockSubmitAiFeedback = vi.fn();

vi.mock("@/components/whatsapp/WhatsAppConnect", () => ({
  default: () => <div data-testid="whatsapp-connect-stub" />,
}));

vi.mock("@/hooks/use-panel-data", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-panel-data")>("@/hooks/use-panel-data");
  return {
    ...actual,
    usePanelData: () => ({
      chats: [
        {
          id: "chat-2",
          name: "Cliente Prioritario",
          lastMessage: "Oi",
          timestamp: Date.now() - 10000,
          unreadCount: 2,
          attentionActive: true,
          attentionSince: Date.now(),
          pausedByHuman: false,
          status: "active",
        },
        {
          id: "chat-1",
          name: "Cliente Normal",
          lastMessage: "Tudo bem?",
          timestamp: Date.now(),
          unreadCount: 0,
          attentionActive: false,
          pausedByHuman: false,
          status: "active",
        },
      ],
      selectedChatId: "chat-1",
      selectedChat: {
        id: "chat-1",
        name: "Cliente Normal",
        pausedByHuman: false,
      },
      messages: ["[ts=1713484800000] Usuario: Oi", "[ts=1713484810000] Hime: Olá!"],
      selectChat: mockSelectChat,
      sendText: mockSendText,
      setChatIAEnabled: mockSetChatIAEnabled,
      fetchAiContextPreview: mockFetchAiContextPreview,
      submitAiFeedback: mockSubmitAiFeedback,
      hasMoreMessages: false,
      loadingMessages: false,
      loadMoreMessages: mockLoadMoreMessages,
    }),
  };
});

describe("Atendimento page interactions", () => {
  beforeEach(() => {
    mockSelectChat.mockReset();
    mockSendText.mockReset().mockResolvedValue(true);
    mockSetChatIAEnabled.mockReset().mockResolvedValue(true);
    mockLoadMoreMessages.mockReset().mockResolvedValue(false);
    mockFetchAiContextPreview.mockReset().mockResolvedValue(null);
    mockSubmitAiFeedback.mockReset().mockResolvedValue(true);
  });

  it("calls selectChat when a conversation is clicked", () => {
    render(<AtendimentoPage />);

    fireEvent.click(screen.getByText(/cliente prioritario/i));
    expect(mockSelectChat).toHaveBeenCalledWith("chat-2");
  });

  it("sends message when pressing Enter in input", async () => {
    render(<AtendimentoPage />);

    const input = screen.getByPlaceholderText("Digite uma mensagem...");
    fireEvent.change(input, { target: { value: "Mensagem de teste" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(mockSendText).toHaveBeenCalledWith("Mensagem de teste");
    });
  });

  it("toggles IA response switch", async () => {
    render(<AtendimentoPage />);

    const switchButton = screen.getByRole("switch");
    fireEvent.click(switchButton);

    await waitFor(() => {
      expect(mockSetChatIAEnabled).toHaveBeenCalledWith(false);
    });
  });
});
