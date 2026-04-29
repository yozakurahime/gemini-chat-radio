import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PontoPage from "@/pages/PontoPage";

const mocks = vi.hoisted(() => ({
  createAttendanceEmployee: vi.fn(),
  updateAttendanceEmployee: vi.fn(),
  deleteAttendanceEmployee: vi.fn(),
  refreshAttendance: vi.fn(),
}));

vi.mock("@/hooks/use-panel-data", () => ({
  usePanelData: () => ({
    user: { username: "admin", role: "admin" },
    attendanceEmployees: [
      {
        id: 7,
        name: "Ana Ponto",
        role: "Professor",
        whatsapp_phone: "5511999999999",
        active: 1,
        schedules_count: 2,
      },
    ],
    attendanceCatalog: [
      { id: 10, type: "function", name: "Professor", active: 1, default_value: 0 },
      { id: 20, type: "class", name: "Musculacao", active: 1, default_value: 30 },
    ],
    attendanceTemplates: [],
    attendanceSchedules: [],
    attendanceRecords: [],
    attendanceSummary: [],
    attendanceSelectedEmployee: "Todos",
    attendanceFromDate: "",
    attendanceToDate: "",
    setAttendanceSelectedEmployee: vi.fn(),
    setAttendanceFromDate: vi.fn(),
    setAttendanceToDate: vi.fn(),
    createAttendanceEmployee: mocks.createAttendanceEmployee,
    updateAttendanceEmployee: mocks.updateAttendanceEmployee,
    deleteAttendanceEmployee: mocks.deleteAttendanceEmployee,
    createAttendanceCatalogItem: vi.fn(),
    updateAttendanceCatalogItem: vi.fn(),
    deleteAttendanceCatalogItem: vi.fn(),
    createAttendanceTemplate: vi.fn(),
    updateAttendanceTemplate: vi.fn(),
    deleteAttendanceTemplate: vi.fn(),
    applyEmployeeTemplates: vi.fn(),
    updateAttendanceSchedule: vi.fn(),
    refreshAttendance: mocks.refreshAttendance,
  }),
}));

describe("Ponto employee management", () => {
  beforeEach(() => {
    mocks.createAttendanceEmployee.mockReset().mockResolvedValue(true);
    mocks.updateAttendanceEmployee.mockReset().mockResolvedValue(true);
    mocks.deleteAttendanceEmployee.mockReset().mockResolvedValue(true);
    mocks.refreshAttendance.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("creates an employee from the employees tab", async () => {
    render(<PontoPage />);

    const employeesTab = screen.getByRole("tab", { name: /funcionarios/i });
    fireEvent.mouseDown(employeesTab, { button: 0, ctrlKey: false });
    fireEvent.click(employeesTab);
    fireEvent.change(screen.getByPlaceholderText("Nome"), { target: { value: "Carlos" } });
    fireEvent.change(screen.getByPlaceholderText("WhatsApp com DDD"), { target: { value: "5511888888888" } });
    fireEvent.click(screen.getByRole("button", { name: /adicionar/i }));

    await waitFor(() => {
      expect(mocks.createAttendanceEmployee).toHaveBeenCalledWith({
        name: "Carlos",
        phone: "5511888888888",
        roleActivityId: 10,
        notes: "",
      });
    });
  });

  it("deactivates an active employee after confirmation", async () => {
    render(<PontoPage />);

    const employeesTab = screen.getByRole("tab", { name: /funcionarios/i });
    fireEvent.mouseDown(employeesTab, { button: 0, ctrlKey: false });
    fireEvent.click(employeesTab);
    fireEvent.click(screen.getByRole("button", { name: /remover ana ponto/i }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(mocks.deleteAttendanceEmployee).toHaveBeenCalledWith(7);
    });
  });
});
