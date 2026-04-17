import { describe, expect, it } from "vitest";
import { parsePanelMessage } from "@/hooks/use-panel-data";

describe("parsePanelMessage", () => {
  it("parses timestamp-prefixed history messages", () => {
    const parsed = parsePanelMessage("[ts=1713484800000] Usuario: Oi, tudo bem?");

    expect(parsed.sender).toBe("user");
    expect(parsed.senderName).toBe("Usuario");
    expect(parsed.content).toContain("Oi, tudo bem?");
    expect(parsed.timestamp).not.toBe("");
  });

  it("keeps compatibility with legacy messages without timestamp", () => {
    const parsed = parsePanelMessage("Hime: Mensagem antiga");

    expect(parsed.sender).toBe("ai");
    expect(parsed.senderName).toBe("Hime");
    expect(parsed.content).toBe("Mensagem antiga");
    expect(parsed.timestamp).toBe("");
  });
});
