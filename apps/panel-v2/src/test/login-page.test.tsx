import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "@/pages/LoginPage";

const mockLogin = vi.fn();

vi.mock("@/hooks/use-panel-data", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-panel-data")>("@/hooks/use-panel-data");
  return {
    ...actual,
    usePanelData: () => ({
      connected: true,
      login: mockLogin,
    }),
  };
});

describe("LoginPage interactions", () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  it("enables submit and calls login on click", async () => {
    mockLogin.mockResolvedValue(true);

    render(<LoginPage />);

    const userInput = screen.getByLabelText(/usuário|usuÃ¡rio/i);
    const passInput = screen.getByLabelText(/senha/i);
    const enterButton = screen.getByRole("button", { name: /entrar/i });

    expect(enterButton).toBeDisabled();

    fireEvent.change(userInput, { target: { value: "admin" } });
    fireEvent.change(passInput, { target: { value: "Admin#12345" } });

    expect(enterButton).toBeEnabled();
    fireEvent.click(enterButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("admin", "Admin#12345");
    });
  });

  it("submits on Enter key in password input", async () => {
    mockLogin.mockResolvedValue(true);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/usuário|usuÃ¡rio/i), { target: { value: "owner" } });
    const passInput = screen.getByLabelText(/senha/i);
    fireEvent.change(passInput, { target: { value: "Strong#Pass1" } });
    fireEvent.keyDown(passInput, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("owner", "Strong#Pass1");
    });
  });
});
