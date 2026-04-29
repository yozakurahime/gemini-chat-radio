import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch, jsonHeaders } from "@/lib/panel-api";
import { BR_TIMEZONE } from "@/lib/date-time";

type User = { username: string; fullname?: string; role?: string; avatar?: string };
type Chat = {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: number;
  unreadCount?: number;
  attentionActive?: boolean;
  attentionSince?: number;
  slaStatus?: "ok" | "atrasando" | "critico";
  slaPendingSince?: number;
  status?: string;
  pausedByHuman?: boolean;
  pendingHuman?: boolean;
  needsHuman?: boolean;
  tags?: string[];
  notes?: string;
};
type AiContextPreview = {
  conversation?: {
    id: string;
    name: string;
    routeJid?: string;
  };
  generatedAt?: number;
  context?: {
    baseContextLength?: number;
    noticesLength?: number;
    baseContextUpdatedAt?: number;
    noticesUpdatedAt?: number;
    scaMatch?: boolean;
    scaSnippet?: string;
  };
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
};
type SystemHealthSnapshot = {
  generatedAt?: number;
  status?: "ok" | "degraded" | "critical";
  components?: Record<string, { status?: string; message?: string; metrics?: Record<string, any> }>;
  incidents?: Array<Record<string, any>>;
  summary?: { ok?: number; degraded?: number; critical?: number };
};
type RadioState = {
  isPlaying: boolean;
  currentTrack: any;
  musicVolume: number;
  adVolume: number;
  adFrequency: number;
  isShuffle: boolean;
  lastAdTime?: number;
};
export type AdFile = {
  id: string;
  file: string;
  name: string;
  url: string;
};
export type AdCampaign = {
  id: number;
  name: string;
  advertiser?: string;
  file: string;
  mode: "per_day" | "hourly";
  runs_per_day: number;
  interval_hours: number;
  start_at: number;
  end_at: number;
  is_active: boolean;
  priority: number;
  notes?: string;
  created_by?: string;
  created_at?: number;
  updated_at?: number;
  runtime?: Record<string, any>;
};
export type AdHistoryEntry = {
  id: number;
  event: string;
  at: number;
  data: Record<string, any>;
};
export type NextAdState = {
  now?: number;
  next_due_at?: number | null;
  blocked_files?: string[];
  campaign?: AdCampaign | null;
  next_campaign?: AdCampaign | null;
};
export type AdPlaybackState = {
  isPlaying: boolean;
  currentFile: string;
  currentName: string;
  currentCampaignId: number | null;
  source: "manual" | "auto" | "";
  queuedCount: number;
  lastStatus: "idle" | "playing" | "played" | "error" | "skipped";
  lastError: string;
  lastEventAt: number;
};
export type AdCampaignPayload = {
  name: string;
  advertiser?: string;
  file: string;
  mode: "per_day" | "hourly";
  runs_per_day: number;
  interval_hours: number;
  start_at: number;
  end_at: number;
  is_active: boolean;
  priority: number;
  notes?: string;
};
export type AdPlayRequest = {
  file: string;
  name?: string;
  campaignId?: number | null;
  source?: "manual" | "auto";
  mode?: string;
  priority?: number;
};
type ChatMediaKind = "image" | "sticker";
type ChatMedia = {
  url: string;
  caption?: string;
  mime?: string;
  size?: number;
  ts?: number;
  width?: number;
  height?: number;
};
type ParsedPanelMessage = {
  id: string;
  content: string;
  sender: "user" | "ai" | "system" | "operator";
  timestamp: string;
  senderName: string;
  mediaKind?: ChatMediaKind;
  media?: ChatMedia;
};

type PanelDataContextValue = {
  authLoading: boolean;
  user: User | null;
  connected: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  chats: Chat[];
  selectedChatId: string | null;
  selectedChat: Chat | null;
  messages: string[];
  selectChat: (id: string) => void;
  ackChatAttention: (id: string) => Promise<void>;
  sendText: (text: string) => Promise<boolean>;
  setChatIAEnabled: (enabled: boolean) => Promise<boolean>;
  fetchAiContextPreview: (contactId: string) => Promise<AiContextPreview | null>;
  submitAiFeedback: (contactId: string, payload?: { feedbackType?: string; reason?: string }) => Promise<boolean>;
  loadMoreMessages: () => Promise<boolean>;
  hasMoreMessages: boolean;
  loadingMessages: boolean;
  radio: RadioState;
  playlist: any[];
  adFiles: AdFile[];
  adCampaigns: AdCampaign[];
  adHistory: AdHistoryEntry[];
  nextAdState: NextAdState | null;
  adPlayback: AdPlaybackState;
  toggleRadio: () => void;
  skipTrack: () => void;
  playTrack: (track: any) => void;
  addTrack: (url: string) => void;
  removeTrack: (id: string) => void;
  updateRadioSettings: (next: Partial<RadioState>) => void;
  refreshAds: () => Promise<void>;
  refreshAdCampaigns: () => Promise<void>;
  refreshAdHistory: () => Promise<void>;
  refreshNextAdState: () => Promise<NextAdState | null>;
  uploadAd: (file: File) => Promise<boolean>;
  deleteAd: (filename: string) => Promise<boolean>;
  createAdCampaign: (payload: AdCampaignPayload) => Promise<boolean>;
  updateAdCampaign: (id: number, payload: AdCampaignPayload) => Promise<boolean>;
  toggleAdCampaign: (id: number, active: boolean) => Promise<boolean>;
  deleteAdCampaign: (id: number) => Promise<boolean>;
  playAdNow: (input: AdPlayRequest | string) => Promise<boolean>;
  emitAdsEvent: (event: string, data?: Record<string, any>) => void;
  trackAdCampaignRun: (args: { id: number; status: "played" | "error" | "skipped"; file?: string; reason?: string; meta?: Record<string, any> }) => Promise<boolean>;
  updateAdPlaybackState: (next: Partial<AdPlaybackState>) => void;
  attendanceEmployees: any[];
  attendanceCatalog: any[];
  attendanceTemplates: any[];
  attendanceSchedules: any[];
  attendanceRecords: any[];
  attendanceSummary: any[];
  attendanceSelectedEmployee: string;
  attendanceFromDate: string;
  attendanceToDate: string;
  setAttendanceSelectedEmployee: (value: string) => void;
  setAttendanceFromDate: (value: string) => void;
  setAttendanceToDate: (value: string) => void;
  refreshAttendanceCatalog: () => Promise<void>;
  refreshAttendanceTemplates: () => Promise<void>;
  createAttendanceEmployee: (payload: { name: string; phone: string; roleActivityId?: number; notes?: string }) => Promise<boolean>;
  updateAttendanceEmployee: (id: number, payload: { name?: string; phone?: string; roleActivityId?: number; role?: string; notes?: string; active?: boolean }) => Promise<boolean>;
  deleteAttendanceEmployee: (id: number) => Promise<boolean>;
  createAttendanceCatalogItem: (payload: { type: "class" | "function"; name: string; defaultValue?: number; sortOrder?: number }) => Promise<boolean>;
  updateAttendanceCatalogItem: (id: number, payload: { type?: "class" | "function"; name?: string; defaultValue?: number; sortOrder?: number; active?: boolean }) => Promise<boolean>;
  deleteAttendanceCatalogItem: (id: number) => Promise<boolean>;
  createAttendanceTemplate: (payload: { activityId: number; weekday: number; startTime: string; endTime: string }) => Promise<boolean>;
  updateAttendanceTemplate: (id: number, payload: { activityId?: number; weekday?: number; startTime?: string; endTime?: string; active?: boolean }) => Promise<boolean>;
  deleteAttendanceTemplate: (id: number) => Promise<boolean>;
  applyEmployeeTemplates: (payload: { employeeId: number; templateIds: number[]; replace?: boolean; toleranceMin?: number }) => Promise<boolean>;
  updateAttendanceSchedule: (id: number, payload: { weekday?: number; startTime?: string; endTime?: string; scheduleType?: "class" | "function"; activityId?: number; valuePerClass?: number | null; toleranceMin?: number; active?: boolean }) => Promise<boolean>;
  refreshAttendance: () => Promise<void>;
  knowledgeBase: string;
  saveKnowledgeBase: (value: string) => Promise<boolean>;
  geoPolicy: any;
  saveGeoPolicy: (policy: { academyLat: string; academyLng: string; radiusM: string }) => Promise<boolean>;
  systemHealth: SystemHealthSnapshot | null;
};

const PanelDataContext = createContext<PanelDataContextValue | null>(null);
const RADIO_COMMAND_EVENT = "himefit-radio-command";
export const AD_PLAY_COMMAND_EVENT = "himefit-ad-play-command";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, Math.floor(days)));
  return date.toISOString().slice(0, 10);
}

function resolveAttendanceRange(fromRaw?: string, toRaw?: string) {
  let from = String(fromRaw || "").slice(0, 10);
  let to = String(toRaw || "").slice(0, 10);
  if (!from && !to) {
    from = daysAgoISO(90);
    to = today();
  } else if (from && !to) {
    to = from;
  } else if (!from && to) {
    from = to;
  }
  if (from > to) {
    return { from: to, to: from };
  }
  return { from, to };
}

function getWsUrl() {
  if (import.meta.env.DEV) return `ws://${window.location.hostname}:3001/ws`;
  return window.location.protocol === "https:" ? `wss://${window.location.host}/ws` : `ws://${window.location.host}/ws`;
}

const HISTORY_TS_PREFIX = /^\[ts=(\d{10,16})\]\s*/i;
const HISTORY_ISO_PREFIX = /^\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s*/;

function extractHistoryTimestamp(message: string): { timestampMs?: number; content: string } {
  const raw = String(message || "");
  const tsMatch = raw.match(HISTORY_TS_PREFIX);
  if (tsMatch) {
    const parsedTs = Number(tsMatch[1]);
    return {
      timestampMs: Number.isFinite(parsedTs) && parsedTs > 0 ? parsedTs : undefined,
      content: raw.slice(tsMatch[0].length),
    };
  }

  const isoMatch = raw.match(HISTORY_ISO_PREFIX);
  if (isoMatch) {
    const parsedTs = Date.parse(isoMatch[1]);
    return {
      timestampMs: Number.isFinite(parsedTs) ? parsedTs : undefined,
      content: raw.slice(isoMatch[0].length),
    };
  }

  return { content: raw };
}

function formatMessageTimestamp(timestampMs?: number) {
  if (!timestampMs) return "";
  try {
    const date = new Date(timestampMs);
    if (Number.isNaN(date.getTime())) return "";
    const datePart = date.toLocaleDateString("pt-BR", {
      timeZone: BR_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
    const timePart = date.toLocaleTimeString("pt-BR", {
      timeZone: BR_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${datePart} ${timePart}`;
  } catch {
    return "";
  }
}

function buildHistoryLine(sender: string, body: string, timestampMs?: number) {
  const senderLabel = String(sender || "Sistema").replace(/\s+/g, " ").trim() || "Sistema";
  const content = String(body ?? "");
  const ts = Number(timestampMs);
  const safeTs = Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : Date.now();
  return `[ts=${safeTs}] ${senderLabel}: ${content}`;
}

function normalizeChatMessage(message: string) {
  const { content } = extractHistoryTimestamp(message);
  return String(content || "").replace(/^\*([^*]+):\*\s*/i, "$1: ");
}

function splitChatLine(message: string) {
  const normalized = normalizeChatMessage(message);
  const match = normalized.match(/^([^:]{1,80}):\s*([\s\S]*)$/);
  if (!match) return { sender: "Sistema", body: normalized };
  return { sender: match[1], body: match[2] };
}

function isInboundMessage(message: string) {
  const sender = splitChatLine(message).sender.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return sender === "usuario" || sender === "cliente";
}

function previewMessage(message?: string) {
  const { body } = splitChatLine(message || "");
  const media = parseChatMediaMarker(body);
  if (media?.kind === "image") return media.media.caption || "Imagem";
  if (media?.kind === "sticker") return "Figurinha";
  if (body.includes("[imagem:")) return "Imagem";
  if (body.includes("[figurinha:")) return "Figurinha";
  return body || message || "";
}

function parseChatMediaMarker(body: string): { kind: ChatMediaKind; media: ChatMedia; text: string } | null {
  const trimmed = String(body || "").trim();
  const marker = trimmed.startsWith("[IMG]") ? "[IMG]" : trimmed.startsWith("[STK]") ? "[STK]" : "";
  if (marker) {
    try {
      const media = JSON.parse(trimmed.slice(marker.length)) as ChatMedia;
      if (!media?.url) return null;
      const kind = marker === "[IMG]" ? "image" : "sticker";
      return {
        kind,
        media,
        text: kind === "image" ? String(media.caption || "") : "",
      };
    } catch {
      return null;
    }
  }

  const legacy = trimmed.match(/^\[(imagem|figurinha):\s*([^\]\s]+)(?:\s+([^\]]+))?\]$/i);
  if (!legacy?.[2]) return null;
  const kind = legacy[1].toLowerCase() === "imagem" ? "image" : "sticker";
  return {
    kind,
    media: {
      url: legacy[2],
      caption: legacy[3] || "",
    },
    text: legacy[3] || "",
  };
}

function formatTrackTitle(track: any) {
  return track?.title || track?.name || track?.videoId || "Nenhuma música";
}

function isValidRadioVideoId(value: unknown) {
  return /^[A-Za-z0-9_-]{11}$/.test(String(value || "").trim());
}

function sanitizeRadioTrack(track: any) {
  return track && isValidRadioVideoId(track.videoId) ? track : null;
}

function toAdFile(file: string): AdFile {
  const safe = String(file || "").trim();
  return {
    id: safe,
    file: safe,
    name: safe.replace(/\.mp3$/i, ""),
    url: `/ads/${encodeURIComponent(safe)}`,
  };
}

function toAdHistoryEntry(entry: any): AdHistoryEntry {
  return {
    id: Number(entry?.id || 0),
    event: String(entry?.event || "ads.event"),
    at: Number(entry?.at || entry?.created_at || Date.now()),
    data: entry?.data && typeof entry.data === "object" ? entry.data : {},
  };
}

function reportRowsFromPayload(data: any, employeeName = "", employeeId: string | number = "") {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const out: any[] = [];
  const hasClock = (value: any) => /^\d{2}:\d{2}$/.test(String(value || "").trim());

  rows.forEach((row: any, index: number) => {
    const base = {
      employee: employeeName || data?.employee?.name || "",
      employeeId: String(employeeId || data?.employee?.id || ""),
      date: row.date || "",
      raw: row,
    };

    if (hasClock(row.first_entry_hhmm)) {
      out.push({
        ...base,
        id: `${employeeId || data?.employee?.id || "emp"}-${row.date || "dia"}-${index}-entry`,
        type: "entrada",
        time: row.first_entry_hhmm,
        lat: Number(
          row.first_entry_geo_lat
          ?? row.first_entry_lat
          ?? row.entry_geo_lat
          ?? row.entry_lat
          ?? 0,
        ),
        lng: Number(
          row.first_entry_geo_lng
          ?? row.first_entry_lng
          ?? row.entry_geo_lng
          ?? row.entry_lng
          ?? 0,
        ),
        withinRadius: String(row.first_entry_geo_status || "").toLowerCase() !== "outside",
      });
    }

    if (hasClock(row.last_exit_hhmm)) {
      out.push({
        ...base,
        id: `${employeeId || data?.employee?.id || "emp"}-${row.date || "dia"}-${index}-exit`,
        type: "saida",
        time: row.last_exit_hhmm,
        lat: Number(
          row.last_exit_geo_lat
          ?? row.last_exit_lat
          ?? row.exit_geo_lat
          ?? row.exit_lat
          ?? 0,
        ),
        lng: Number(
          row.last_exit_geo_lng
          ?? row.last_exit_lng
          ?? row.exit_geo_lng
          ?? row.exit_lng
          ?? 0,
        ),
        withinRadius: String(row.last_exit_geo_status || "").toLowerCase() !== "outside",
      });
    }
  });

  return out;
}

export function PanelDataProvider({ children }: { children: React.ReactNode }) {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [connected, setConnected] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [messageCursor, setMessageCursor] = useState<number | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [radio, setRadio] = useState<RadioState>({
    isPlaying: false,
    currentTrack: null,
    musicVolume: 50,
    adVolume: 80,
    adFrequency: 15,
    isShuffle: false,
    lastAdTime: 0,
  });
  const [playlist, setPlaylist] = useState<any[]>([]);
  const [adFiles, setAdFiles] = useState<AdFile[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaign[]>([]);
  const [adHistory, setAdHistory] = useState<AdHistoryEntry[]>([]);
  const [nextAdState, setNextAdState] = useState<NextAdState | null>(null);
  const [adPlayback, setAdPlayback] = useState<AdPlaybackState>({
    isPlaying: false,
    currentFile: "",
    currentName: "",
    currentCampaignId: null,
    source: "",
    queuedCount: 0,
    lastStatus: "idle",
    lastError: "",
    lastEventAt: 0,
  });
  const [attendanceEmployees, setAttendanceEmployees] = useState<any[]>([]);
  const [attendanceCatalog, setAttendanceCatalog] = useState<any[]>([]);
  const [attendanceTemplates, setAttendanceTemplates] = useState<any[]>([]);
  const [attendanceSchedules, setAttendanceSchedules] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any[]>([]);
  const [attendanceSelectedEmployee, setAttendanceSelectedEmployee] = useState("Todos");
  const [attendanceFromDate, setAttendanceFromDate] = useState("");
  const [attendanceToDate, setAttendanceToDate] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [geoPolicy, setGeoPolicy] = useState<any>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthSnapshot | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const selectedChatRef = useRef<string | null>(null);
  const authenticatedRef = useRef(false);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) || null,
    [chats, selectedChatId],
  );

  const sendWs = useCallback((payload: any) => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  const notifyUnreadMessage = useCallback((chatName: string) => {
    toast.info("Nova mensagem", { description: chatName || "Nova conversa" });
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const audio = new AudioContextCtor();
      const oscillator = audio.createOscillator();
      const gainNode = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(960, audio.currentTime);
      gainNode.gain.setValueAtTime(0.0001, audio.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
      oscillator.connect(gainNode);
      gainNode.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.2);
      oscillator.onended = () => {
        try {
          audio.close();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* ignore */
    }
  }, []);

  const requestInitialLists = useCallback(() => {
    if (!authenticatedRef.current) return;
    sendWs({ type: "request_initial_lists" });
  }, [sendWs]);

  const fetchPlaylist = useCallback(async () => {
    try {
      const res = await apiFetch("/api/playlist");
      const data = await res.json();
      const nextPlaylist = (Array.isArray(data.playlist) ? data.playlist : []).filter((track) => !!sanitizeRadioTrack(track));
      const nextCurrent = sanitizeRadioTrack(data.current);
      setPlaylist(nextPlaylist);
      setRadio((prev) => ({ ...prev, currentTrack: nextCurrent || null }));
    } catch {
      /* auth or offline */
    }
  }, []);

  const refreshAds = useCallback(async () => {
    try {
      const res = await apiFetch("/api/ads");
      const files = await res.json();
      setAdFiles((Array.isArray(files) ? files : []).map((file) => toAdFile(String(file || ""))));
    } catch {
      setAdFiles([]);
    }
  }, []);

  const refreshAdCampaigns = useCallback(async () => {
    if (user?.role !== "admin") {
      setAdCampaigns([]);
      return;
    }
    try {
      const res = await apiFetch("/admin/radio/ads/campaigns");
      const data = await res.json();
      setAdCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : []);
    } catch {
      setAdCampaigns([]);
    }
  }, [user?.role]);

  const refreshAdHistory = useCallback(async () => {
    if (user?.role !== "admin") {
      setAdHistory([]);
      return;
    }
    try {
      const res = await apiFetch("/admin/radio/ads/history?limit=30");
      const data = await res.json();
      setAdHistory((Array.isArray(data?.history) ? data.history : []).map((entry) => toAdHistoryEntry(entry)));
    } catch {
      setAdHistory([]);
    }
  }, [user?.role]);

  const refreshNextAdState = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/radio/ads/next");
      const data = await res.json();
      setNextAdState(data || null);
      return (data || null) as NextAdState | null;
    } catch {
      setNextAdState(null);
      return null;
    }
  }, []);

  const refreshAttendanceCatalog = useCallback(async () => {
    try {
      const catalogRes = await apiFetch("/admin/attendance/catalog?active=1");
      const catalogData = await catalogRes.json();
      setAttendanceCatalog(Array.isArray(catalogData.items) ? catalogData.items : []);
    } catch {
      setAttendanceCatalog([]);
    }
  }, []);

  const refreshAttendanceTemplates = useCallback(async () => {
    try {
      const templatesRes = await apiFetch("/admin/attendance/templates?active=1&source=manual");
      const templatesData = await templatesRes.json();
      setAttendanceTemplates(Array.isArray(templatesData.templates) ? templatesData.templates : []);
    } catch {
      setAttendanceTemplates([]);
    }
  }, []);

  const refreshAttendance = useCallback(async () => {
    try {
      const employeesRes = await apiFetch("/admin/attendance/employees");
      const employeesData = await employeesRes.json();
      const employees = Array.isArray(employeesData.employees) ? employeesData.employees : [];
      setAttendanceEmployees(employees);
      await Promise.all([refreshAttendanceCatalog(), refreshAttendanceTemplates()]);

      const selectedEmployees = attendanceSelectedEmployee === "Todos"
        ? employees
        : employees.filter((employee: any) => String(employee.id) === String(attendanceSelectedEmployee) || employee.name === attendanceSelectedEmployee);

      if (!selectedEmployees.length) {
        setAttendanceSchedules([]);
        setAttendanceRecords([]);
        setAttendanceSummary([]);
        return;
      }

      const { from, to } = resolveAttendanceRange(attendanceFromDate, attendanceToDate);

      const reportPairs = await Promise.all(
        selectedEmployees.map(async (employee: any) => {
          try {
            const reportRes = await apiFetch(`/admin/attendance/report?${new URLSearchParams({
              from,
              to,
              employeeId: String(employee.id),
            })}`);
            const report = await reportRes.json();
            return { employee, report };
          } catch {
            return { employee, report: null };
          }
        }),
      );

      const mergedRecords = reportPairs
        .flatMap(({ employee, report }) => reportRowsFromPayload(report, employee?.name || "", employee?.id || ""))
        .sort((a: any, b: any) => {
          const left = `${a.date || ""}T${a.time || "00:00"}:00`;
          const right = `${b.date || ""}T${b.time || "00:00"}:00`;
          return right.localeCompare(left);
        });

      const summaryRows = reportPairs.map(({ employee, report }) => ({
        employee: employee?.name || `Funcionario ${employee?.id || ""}`,
        employeeId: String(employee?.id || ""),
        entradas: Number(report?.summary?.totalEntries || 0),
        saidas: Number(report?.summary?.totalExits || 0),
        outsideRadius: Number(report?.summary?.geoOutsideAttempts || 0),
      }));

      const scheduleParams = new URLSearchParams();
      if (attendanceSelectedEmployee !== "Todos" && selectedEmployees[0]) {
        scheduleParams.set("employeeId", String(selectedEmployees[0].id));
      }
      const schedulesRes = await apiFetch(`/admin/attendance/schedules${scheduleParams.toString() ? `?${scheduleParams.toString()}` : ""}`);
      const schedulesData = await schedulesRes.json();
      const schedules = Array.isArray(schedulesData.schedules) ? schedulesData.schedules : [];
      const employeeById = new Map(employees.map((employee: any) => [String(employee.id), employee.name || `Funcionario ${employee.id}`]));

      setAttendanceSchedules(
        schedules.map((row: any) => ({
          ...row,
          employeeName: employeeById.get(String(row.employee_id)) || `Funcionario ${row.employee_id}`,
        })),
      );
      setAttendanceRecords(mergedRecords);
      setAttendanceSummary(summaryRows);
    } catch {
      setAttendanceCatalog([]);
      setAttendanceTemplates([]);
      setAttendanceSchedules([]);
      setAttendanceRecords([]);
      setAttendanceSummary([]);
    }
  }, [attendanceFromDate, attendanceSelectedEmployee, attendanceToDate, refreshAttendanceCatalog, refreshAttendanceTemplates]);

  const fetchKnowledge = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/knowledge/current");
      const data = await res.json();
      setKnowledgeBase(String(data.base_context || data?.published?.avisos || ""));
    } catch {
      /* auth or offline */
    }
  }, []);

  const fetchGeoPolicy = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/attendance/geo-policy");
      const data = await res.json();
      setGeoPolicy(data.policy || null);
    } catch {
      try {
        const res = await apiFetch("/admin/attendance/status");
        const data = await res.json();
        setGeoPolicy(data.geo || null);
      } catch {
        /* auth or offline */
      }
    }
  }, []);

  const refreshSystemHealth = useCallback(async () => {
    if (user?.role !== "admin") {
      setSystemHealth(null);
      return;
    }
    try {
      const res = await apiFetch("/admin/system/health/detailed");
      const data = await res.json();
      setSystemHealth((data?.health || null) as SystemHealthSnapshot | null);
    } catch {
      setSystemHealth(null);
    }
  }, [user?.role]);

  const refreshAll = useCallback(async () => {
    requestInitialLists();
    await Promise.all([
      fetchPlaylist(),
      refreshAds(),
      refreshAdCampaigns(),
      refreshAdHistory(),
      refreshNextAdState(),
      refreshAttendance(),
      fetchKnowledge(),
      fetchGeoPolicy(),
      refreshSystemHealth(),
    ]);
  }, [fetchGeoPolicy, fetchKnowledge, fetchPlaylist, refreshAdCampaigns, refreshAdHistory, refreshAds, refreshAttendance, refreshNextAdState, refreshSystemHealth, requestInitialLists]);

  const updateChatMessage = useCallback((
    id: string,
    text: string,
    name?: string,
    status = "active",
    pausedByHuman?: boolean | null,
    inbound = false,
    timestamp?: number,
    extra?: { slaStatus?: "ok" | "atrasando" | "critico"; slaPendingSince?: number | null },
  ) => {
    const parsedTimestamp = Number(timestamp || extractHistoryTimestamp(text).timestampMs || Date.now());
    const now = Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 ? parsedTimestamp : Date.now();
    const preview = previewMessage(text);
    setChats((prev) => {
      const index = prev.findIndex((chat) => chat.id === id);
      if (index >= 0) {
        return prev.map((chat) => {
          if (chat.id !== id) return chat;
          const isSelected = chat.id === selectedChatRef.current;
          const nextUnread = isSelected ? 0 : (chat.unreadCount || 0) + (inbound ? 1 : 0);
          const shouldAttention = inbound && !isSelected;
          return {
            ...chat,
            name: name || chat.name,
            lastMessage: preview,
            timestamp: now,
            status: status || chat.status,
            pausedByHuman: pausedByHuman ?? chat.pausedByHuman,
            unreadCount: nextUnread,
            attentionActive: shouldAttention ? true : (isSelected ? false : chat.attentionActive),
            attentionSince: shouldAttention ? now : (isSelected ? undefined : chat.attentionSince),
            slaStatus: extra?.slaStatus || chat.slaStatus || "ok",
            slaPendingSince: extra?.slaPendingSince ?? chat.slaPendingSince,
          };
        });
      }
      const shouldAttention = inbound && id !== selectedChatRef.current;
      return [{
        id,
        name: name || id,
        lastMessage: preview,
        timestamp: now,
        status,
        pausedByHuman: !!pausedByHuman,
        unreadCount: id === selectedChatRef.current ? 0 : inbound ? 1 : 0,
        attentionActive: shouldAttention,
        attentionSince: shouldAttention ? now : undefined,
        slaStatus: extra?.slaStatus || "ok",
        slaPendingSince: extra?.slaPendingSince ?? 0,
      }, ...prev];
    });

    if (id === selectedChatRef.current) {
      setMessages((prev) => [...prev, text]);
    }
  }, []);

  const handleWsMessage = useCallback((payload: any) => {
    switch (payload?.type) {
      case "active_chat_list": {
        const next = (payload.chats || []).map((chat: any) => ({
          id: chat.id,
          name: chat.name || chat.id,
          lastMessage: previewMessage(chat.lastMessage || ""),
          timestamp: Number(chat.timestamp || Date.now()),
          tags: chat.tags || [],
          notes: chat.notes || "",
          status: chat.status || "active",
          pausedByHuman: !!chat.pausedByHuman,
          pendingHuman: !!chat.pendingHuman,
          slaStatus: (chat.slaStatus || "ok") as "ok" | "atrasando" | "critico",
          slaPendingSince: Number(chat.slaPendingSince || 0),
        }));
        setChats((prev) => {
          const prevMap = new Map(prev.map((chat) => [chat.id, chat]));
          return next.map((chat: Chat) => ({
            ...chat,
            unreadCount: prevMap.get(chat.id)?.unreadCount || 0,
            needsHuman: !!prevMap.get(chat.id)?.needsHuman,
            attentionActive: !!prevMap.get(chat.id)?.attentionActive,
            attentionSince: prevMap.get(chat.id)?.attentionSince,
            slaStatus: (chat.slaStatus || prevMap.get(chat.id)?.slaStatus || "ok") as "ok" | "atrasando" | "critico",
            slaPendingSince: Number(chat.slaPendingSince || prevMap.get(chat.id)?.slaPendingSince || 0),
          }));
        });
        break;
      }
      case "chat_meta_response":
        if (payload.from === selectedChatRef.current) {
          setChats((prev) => prev.map((chat) => chat.id === payload.from ? {
            ...chat,
            tags: payload.tags || [],
            notes: payload.notes || "",
            pausedByHuman: !!payload.isPaused,
            pendingHuman: !!payload.pendingHuman,
          } : chat));
        }
        break;
      case "chat_history_response":
        if (payload.from === selectedChatRef.current && Array.isArray(payload.history)) {
          setMessages(payload.history);
        }
        break;
      case "user_reply":
        updateChatMessage(
          payload.from,
          buildHistoryLine("Usuario", payload.text || "", payload.timestamp),
          payload.name,
          payload.status,
          payload.pausedByHuman,
          true,
          payload.timestamp,
          {
            slaStatus: payload.slaStatus,
            slaPendingSince: payload.slaPendingSince,
          },
        );
        if (payload.from && payload.from !== selectedChatRef.current) {
          notifyUnreadMessage(payload.name || payload.from);
        } else if (payload.from) {
          void apiFetch(`/admin/conversations/${encodeURIComponent(payload.from)}/ack`, {
            method: "POST",
            headers: jsonHeaders,
          }).catch(() => undefined);
        }
        break;
      case "bot_reply":
        updateChatMessage(
          payload.from,
          buildHistoryLine("Hime", payload.text || "", payload.timestamp),
          undefined,
          "active",
          undefined,
          false,
          payload.timestamp,
        );
        break;
      case "admin_reply_success":
        updateChatMessage(
          payload.from,
          buildHistoryLine(payload.senderName || "Atendente", payload.text || "", payload.timestamp),
          undefined,
          "active",
          payload.isPaused,
          false,
          payload.timestamp,
        );
        break;
      case "chat_ia_state_updated":
        if (payload.from) {
          setChats((prev) => prev.map((chat) => chat.id === payload.from ? {
            ...chat,
            pausedByHuman: !!payload.isPaused,
            pendingHuman: false,
          } : chat));
        }
        break;
      case "bot_resumed":
        if (payload.from) {
          setChats((prev) => prev.map((chat) => chat.id === payload.from ? {
            ...chat,
            pausedByHuman: false,
            pendingHuman: false,
          } : chat));
        }
        break;
      case "help_alert":
        toast.warning("Humano solicitado", { description: `${payload.name || payload.from}: ${payload.text || ""}` });
        updateChatMessage(
          payload.from,
          buildHistoryLine("Atendente", payload.text || "", payload.timestamp),
          payload.name,
          "active",
          true,
          true,
          payload.timestamp,
        );
        setChats((prev) => prev.map((chat) => chat.id === payload.from ? { ...chat, needsHuman: true, pausedByHuman: true } : chat));
        break;
      case "chat_sla_update":
        if (payload.from) {
          setChats((prev) => prev.map((chat) => chat.id === payload.from ? {
            ...chat,
            slaStatus: (payload.status || "ok") as "ok" | "atrasando" | "critico",
            slaPendingSince: Number(payload.pendingSince || 0),
          } : chat));
        }
        break;
      case "incident_opened":
        toast.error("Incidente operacional", {
          description: `${payload?.incident?.component || "sistema"}: ${payload?.incident?.message || "verifique o painel"}`,
        });
        break;
      case "incident_closed":
        toast.success("Incidente resolvido", {
          description: `${payload?.incident?.component || "sistema"} voltou ao normal`,
        });
        break;
      case "system_health_update":
        setSystemHealth(payload.health || null);
        break;
      case "radio_sync_update":
        if (payload.state) {
          const syncedTrack = sanitizeRadioTrack(payload.state.currentTrack) || null;
          setRadio((prev) => ({
            ...prev,
            isPlaying: !!payload.state.isPlaying,
            currentTrack: syncedTrack || prev.currentTrack,
            musicVolume: Number(payload.state.musicVolume ?? prev.musicVolume),
            adVolume: Number(payload.state.adVolume ?? prev.adVolume),
            adFrequency: Number(payload.state.adFrequency ?? prev.adFrequency),
            isShuffle: !!payload.state.isShuffle,
            lastAdTime: Number(payload.state.lastAdTime ?? prev.lastAdTime ?? 0),
          }));
        }
        break;
      case "playlist_updated":
        fetchPlaylist();
        break;
      case "ads_files_updated":
        refreshAds();
        break;
      case "ads_campaigns_updated":
        refreshAdCampaigns();
        refreshNextAdState();
        break;
      case "ads_history_updated":
        if (payload.entry) {
          const entry = toAdHistoryEntry(payload.entry);
          setAdHistory((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 30));
        }
        break;
      default:
        break;
    }
  }, [fetchPlaylist, notifyUnreadMessage, refreshAdCampaigns, refreshAds, refreshNextAdState, updateChatMessage]);

  useEffect(() => {
    selectedChatRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    const unreadTotal = chats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0);
    const attentionTotal = chats.reduce((sum, chat) => sum + (chat.attentionActive ? 1 : 0), 0);
    const count = unreadTotal || attentionTotal;
    if (!attentionTotal) {
      document.title = unreadTotal > 0 ? `(${unreadTotal}) GymPanel` : "GymPanel";
      return;
    }
    let showAlert = true;
    const applyTitle = () => {
      document.title = showAlert ? `(${count}) NOVA MENSAGEM` : `(${count}) GymPanel`;
      showAlert = !showAlert;
    };
    applyTitle();
    const timer = window.setInterval(applyTitle, 900);
    return () => window.clearInterval(timer);
  }, [chats]);

  useEffect(() => {
    authenticatedRef.current = !!user;
  }, [user]);

  useEffect(() => {
    apiFetch("/auth/me")
      .then((res) => res.json())
      .then((data) => setUser({ username: data.username, fullname: data.fullname, role: data.role, avatar: data.avatar }))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | null = null;
    let activeSocket: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    };

    const connect = () => {
      if (disposed) return;
      try {
        const socket = new WebSocket(getWsUrl());
        activeSocket = socket;
        wsRef.current = socket;
        socket.onopen = () => {
          if (disposed) return;
          setConnected(true);
          requestInitialLists();
        };
        socket.onclose = () => {
          if (disposed) return;
          setConnected(false);
          scheduleReconnect();
        };
        socket.onerror = () => {
          if (disposed) return;
          setConnected(false);
        };
        socket.onmessage = (event) => {
          try {
            handleWsMessage(JSON.parse(event.data));
          } catch {
            /* ignore */
          }
        };
      } catch {
        setConnected(false);
        scheduleReconnect();
      }
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      try {
        activeSocket?.close();
      } catch {
        /* ignore */
      }
    };
  }, [handleWsMessage, requestInitialLists]);

  useEffect(() => {
    if (!user) return;
    refreshAll();
    const timer = window.setInterval(() => requestInitialLists(), 30000);
    return () => window.clearInterval(timer);
  }, [refreshAll, requestInitialLists, user]);

  useEffect(() => {
    if (!user) return;
    refreshAttendance();
  }, [attendanceFromDate, attendanceSelectedEmployee, attendanceToDate, refreshAttendance, user]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ user: username, pass: password }),
      });
      const data = await res.json();
      const nextUser = { username: data.username, fullname: data.fullname, role: data.role, avatar: data.avatar };
      setUser(nextUser);
      window.localStorage.setItem("h_u", username);
      toast.success("Login realizado");
      requestInitialLists();
      return true;
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "inactive_user") {
        toast.error("Conta desativada. Fale com um administrador.");
        return false;
      }
      if (code === "rate_limited") {
        toast.error("Muitas tentativas. Aguarde e tente novamente.");
        return false;
      }
      toast.error("Usuario ou senha invalidos");
      return false;
    }
  }, [requestInitialLists]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setUser(null);
    setChats([]);
    setMessages([]);
    setSelectedChatId(null);
  }, []);

  const selectChat = useCallback(async (id: string) => {
    selectedChatRef.current = id;
    setSelectedChatId(id);
    setMessages([]);
    setMessageCursor(null);
    setChats((prev) => prev.map((chat) => chat.id === id ? {
      ...chat,
      unreadCount: 0,
      needsHuman: false,
      attentionActive: false,
      attentionSince: undefined,
      slaStatus: "ok",
      slaPendingSince: 0,
    } : chat));
    void apiFetch(`/admin/conversations/${encodeURIComponent(id)}/ack`, {
      method: "POST",
      headers: jsonHeaders,
    }).catch(() => undefined);
    setLoadingMessages(true);
    try {
      const res = await apiFetch(`/api/conversations/${encodeURIComponent(id)}/messages?limit=80`);
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setMessageCursor(data.nextCursor ?? null);
      sendWs({ type: "request_chat_meta", contactId: id });
    } catch {
      sendWs({ type: "request_chat_history", contactId: id });
    } finally {
      setLoadingMessages(false);
    }
  }, [sendWs]);

  const loadMoreMessages = useCallback(async () => {
    if (!selectedChatId || !messageCursor || loadingMessages) return false;
    setLoadingMessages(true);
    try {
      const res = await apiFetch(`/api/conversations/${encodeURIComponent(selectedChatId)}/messages?limit=80&before=${messageCursor}`);
      const data = await res.json();
      setMessages((prev) => [...(data.messages || []), ...prev]);
      setMessageCursor(data.nextCursor ?? null);
      return true;
    } catch {
      return false;
    } finally {
      setLoadingMessages(false);
    }
  }, [loadingMessages, messageCursor, selectedChatId]);

  const sendText = useCallback(async (text: string) => {
    if (!selectedChatId || !text.trim()) return false;
    try {
      await apiFetch(`/admin/conversations/${encodeURIComponent(selectedChatId)}/send-text`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ text }),
      });
      return true;
    } catch {
      toast.error("Falha ao enviar mensagem");
      return false;
    }
  }, [selectedChatId]);

  const setChatIAEnabled = useCallback(async (enabled: boolean) => {
    if (!selectedChatId) return false;
    try {
      const res = await apiFetch(`/admin/conversations/${encodeURIComponent(selectedChatId)}/ia-state`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      const isPaused = !!data?.isPaused;
      setChats((prev) => prev.map((chat) => chat.id === selectedChatId ? {
        ...chat,
        pausedByHuman: isPaused,
        pendingHuman: false,
      } : chat));
      return true;
    } catch {
      toast.error("Falha ao alterar resposta IA");
      return false;
    }
  }, [selectedChatId]);

  const ackChatAttention = useCallback(async (contactId: string) => {
    if (!contactId) return;
    try {
      await apiFetch(`/admin/conversations/${encodeURIComponent(contactId)}/ack`, {
        method: "POST",
        headers: jsonHeaders,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const fetchAiContextPreview = useCallback(async (contactId: string) => {
    if (!contactId) return null;
    try {
      const res = await apiFetch(`/admin/conversations/${encodeURIComponent(contactId)}/ai-context-preview`);
      const data = await res.json();
      return (data?.preview || null) as AiContextPreview | null;
    } catch {
      return null;
    }
  }, []);

  const submitAiFeedback = useCallback(async (
    contactId: string,
    payload: { feedbackType?: string; reason?: string } = {},
  ) => {
    if (!contactId) return false;
    try {
      await apiFetch(`/admin/conversations/${encodeURIComponent(contactId)}/ia-feedback`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          feedbackType: payload.feedbackType || "inadequada",
          reason: payload.reason || "",
        }),
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const uploadAd = useCallback(async (file: File) => {
    if (user?.role !== "admin") return false;
    if (!file || !/\.mp3$/i.test(file.name)) {
      toast.error("Envie um arquivo MP3");
      return false;
    }
    try {
      const body = new FormData();
      body.append("file", file);
      await apiFetch("/api/upload-ad", { method: "POST", body });
      toast.success("Anúncio enviado");
      await refreshAds();
      await refreshAdCampaigns();
      await refreshNextAdState();
      return true;
    } catch {
      toast.error("Falha ao enviar anúncio");
      return false;
    }
  }, [refreshAdCampaigns, refreshAds, refreshNextAdState, user?.role]);

  const deleteAd = useCallback(async (filename: string) => {
    if (user?.role !== "admin" || !filename) return false;
    try {
      await apiFetch("/api/delete-ad", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ filename }),
      });
      toast.success("Anúncio removido");
      await refreshAds();
      await refreshAdCampaigns();
      await refreshNextAdState();
      return true;
    } catch {
      toast.error("Falha ao remover anúncio");
      return false;
    }
  }, [refreshAdCampaigns, refreshAds, refreshNextAdState, user?.role]);

  const createAdCampaign = useCallback(async (payload: AdCampaignPayload) => {
    if (user?.role !== "admin") return false;
    try {
      await apiFetch("/admin/radio/ads/campaigns", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      toast.success("Campanha criada");
      await refreshAdCampaigns();
      await refreshNextAdState();
      return true;
    } catch {
      toast.error("Falha ao criar campanha");
      return false;
    }
  }, [refreshAdCampaigns, refreshNextAdState, user?.role]);

  const updateAdCampaign = useCallback(async (id: number, payload: AdCampaignPayload) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/radio/ads/campaigns/${id}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      toast.success("Campanha atualizada");
      await refreshAdCampaigns();
      await refreshNextAdState();
      return true;
    } catch {
      toast.error("Falha ao atualizar campanha");
      return false;
    }
  }, [refreshAdCampaigns, refreshNextAdState, user?.role]);

  const toggleAdCampaign = useCallback(async (id: number, active: boolean) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/radio/ads/campaigns/${id}/toggle`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ active }),
      });
      await refreshAdCampaigns();
      await refreshNextAdState();
      return true;
    } catch {
      toast.error("Falha ao alterar campanha");
      return false;
    }
  }, [refreshAdCampaigns, refreshNextAdState, user?.role]);

  const deleteAdCampaign = useCallback(async (id: number) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/radio/ads/campaigns/${id}`, { method: "DELETE" });
      toast.success("Campanha removida");
      await refreshAdCampaigns();
      await refreshNextAdState();
      return true;
    } catch {
      toast.error("Falha ao remover campanha");
      return false;
    }
  }, [refreshAdCampaigns, refreshNextAdState, user?.role]);

  const emitAdsEvent = useCallback((event: string, data: Record<string, any> = {}) => {
    sendWs({ type: "ads_event", event, data });
  }, [sendWs]);

  const trackAdCampaignRun = useCallback(async ({ id, status, file, reason, meta }: { id: number; status: "played" | "error" | "skipped"; file?: string; reason?: string; meta?: Record<string, any> }) => {
    if (!Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/radio/ads/campaigns/${id}/track`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ status, file, reason, meta }),
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const updateAdPlaybackState = useCallback((next: Partial<AdPlaybackState>) => {
    setAdPlayback((prev) => ({ ...prev, ...next }));
  }, []);

  const playAdNow = useCallback(async (input: AdPlayRequest | string) => {
    const request = typeof input === "string"
      ? { file: input, name: input.replace(/\.mp3$/i, ""), source: "manual" as const }
      : {
          ...input,
          source: input.source || "manual",
        };
    if (user?.role !== "admin") return false;
    if (!request.file) return false;
    if (!radio.isPlaying) {
      toast.error("Ligue a rádio antes de tocar um anúncio");
      return false;
    }
    window.dispatchEvent(new CustomEvent(AD_PLAY_COMMAND_EVENT, { detail: request }));
    if (adPlayback.isPlaying) toast.info("Anúncio adicionado à fila");
    else toast.success("Anúncio acionado");
    return true;
  }, [adPlayback.isPlaying, radio.isPlaying, user?.role]);

  const sendRadioAction = useCallback(async (
    action: "play" | "pause" | "skip",
    track?: any,
  ) => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      if (action === "skip") sendWs({ type: "skip_track" });
      else sendWs({ type: "radio_action", action, track });
      return true;
    }
    try {
      await apiFetch("/admin/radio/control", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ action, track }),
      });
      return true;
    } catch {
      toast.error("Sem conexao com o servidor da radio");
      return false;
    }
  }, [sendWs]);

  const toggleRadio = useCallback(() => {
    const wasPlaying = !!radio.isPlaying;
    const action = wasPlaying ? "pause" : "play";
    setRadio((prev) => ({ ...prev, isPlaying: action === "play" }));
    window.dispatchEvent(new CustomEvent(RADIO_COMMAND_EVENT, { detail: { action, track: radio.currentTrack || playlist[0] || null } }));
    void sendRadioAction(action, radio.currentTrack || playlist[0] || null).then((ok) => {
      if (!ok) {
        setRadio((prev) => ({ ...prev, isPlaying: wasPlaying }));
      }
    });
  }, [playlist, radio.currentTrack, radio.isPlaying, sendRadioAction]);

  const skipTrack = useCallback(() => {
    void sendRadioAction("skip");
  }, [sendRadioAction]);
  const playTrack = useCallback((track: any) => {
    setRadio((prev) => ({ ...prev, currentTrack: track, isPlaying: true }));
    window.dispatchEvent(new CustomEvent(RADIO_COMMAND_EVENT, { detail: { action: "play", track } }));
    void sendRadioAction("play", track);
  }, [sendRadioAction]);
  const addTrack = useCallback((url: string) => url.trim() && sendWs({ type: "add_track", url: url.trim() }), [sendWs]);
  const removeTrack = useCallback((id: string) => sendWs({ type: "remove_track", id }), [sendWs]);
  const updateRadioSettings = useCallback((next: Partial<RadioState>) => {
    setRadio((prev) => ({ ...prev, ...next }));
    sendWs({
      type: "radio_settings_update",
      musicVolume: next.musicVolume ?? radio.musicVolume,
      adVolume: next.adVolume ?? radio.adVolume,
      adFrequency: next.adFrequency ?? radio.adFrequency,
    });
  }, [radio.adFrequency, radio.adVolume, radio.musicVolume, sendWs]);

  const saveKnowledgeBase = useCallback(async (value: string) => {
    try {
      await apiFetch("/admin/knowledge/base/save", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ base_context: value }),
      });
      setKnowledgeBase(value);
      toast.success("Contexto salvo");
      return true;
    } catch {
      toast.error("Falha ao salvar contexto");
      return false;
    }
  }, []);

  const saveGeoPolicy = useCallback(async (policy: { academyLat: string; academyLng: string; radiusM: string }) => {
    try {
      const res = await apiFetch("/admin/attendance/geo-policy", {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({
          enabled: true,
          requireEntryLocation: true,
          requireExitLocation: false,
          academyLat: Number(policy.academyLat),
          academyLng: Number(policy.academyLng),
          radiusM: Number(policy.radiusM),
        }),
      });
      const data = await res.json();
      setGeoPolicy(data.policy || null);
      toast.success("Localização salva");
      return true;
    } catch {
      toast.error("Falha ao salvar localização");
      return false;
    }
  }, []);

  const createAttendanceEmployee = useCallback(async (payload: { name: string; phone: string; roleActivityId?: number; notes?: string }) => {
    if (user?.role !== "admin") return false;
    try {
      await apiFetch("/admin/attendance/employees", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      await refreshAttendance();
      toast.success("Funcionario cadastrado");
      return true;
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "phone_already_exists") toast.error("Esse WhatsApp ja esta cadastrado.");
      else if (code === "cannot_use_bot_own_number") toast.error("Use um numero diferente do WhatsApp do bot.");
      else if (code === "invalid_role_catalog") toast.error("Selecione uma funcao valida.");
      else toast.error("Falha ao cadastrar funcionario");
      return false;
    }
  }, [refreshAttendance, user?.role]);

  const updateAttendanceEmployee = useCallback(async (id: number, payload: { name?: string; phone?: string; roleActivityId?: number; role?: string; notes?: string; active?: boolean }) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/attendance/employees/${id}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      await refreshAttendance();
      toast.success("Funcionario atualizado");
      return true;
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "phone_already_exists") toast.error("Esse WhatsApp ja esta cadastrado.");
      else if (code === "cannot_use_bot_own_number") toast.error("Use um numero diferente do WhatsApp do bot.");
      else if (code === "invalid_role_catalog") toast.error("Selecione uma funcao valida.");
      else if (code === "not_found") toast.error("Funcionario nao encontrado.");
      else toast.error("Falha ao atualizar funcionario");
      return false;
    }
  }, [refreshAttendance, user?.role]);

  const deleteAttendanceEmployee = useCallback(async (id: number) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/attendance/employees/${id}`, { method: "DELETE" });
      await refreshAttendance();
      toast.success("Funcionario removido do ponto");
      return true;
    } catch {
      toast.error("Falha ao remover funcionario");
      return false;
    }
  }, [refreshAttendance, user?.role]);

  const createAttendanceCatalogItem = useCallback(async (payload: { type: "class" | "function"; name: string; defaultValue?: number; sortOrder?: number }) => {
    if (user?.role !== "admin") return false;
    try {
      await apiFetch("/admin/attendance/catalog", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      await refreshAttendanceCatalog();
      toast.success("Atividade cadastrada");
      return true;
    } catch {
      toast.error("Falha ao cadastrar atividade");
      return false;
    }
  }, [refreshAttendanceCatalog, user?.role]);

  const updateAttendanceCatalogItem = useCallback(async (id: number, payload: { type?: "class" | "function"; name?: string; defaultValue?: number; sortOrder?: number; active?: boolean }) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/attendance/catalog/${id}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      await refreshAttendanceCatalog();
      toast.success("Atividade atualizada");
      return true;
    } catch {
      toast.error("Falha ao atualizar atividade");
      return false;
    }
  }, [refreshAttendanceCatalog, user?.role]);

  const deleteAttendanceCatalogItem = useCallback(async (id: number) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/attendance/catalog/${id}`, { method: "DELETE" });
      await refreshAttendanceCatalog();
      toast.success("Atividade inativada");
      return true;
    } catch {
      toast.error("Falha ao inativar atividade");
      return false;
    }
  }, [refreshAttendanceCatalog, user?.role]);

  const createAttendanceTemplate = useCallback(async (payload: { activityId: number; weekday: number; startTime: string; endTime: string }) => {
    if (user?.role !== "admin") return false;
    try {
      await apiFetch("/admin/attendance/templates", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      await refreshAttendanceTemplates();
      toast.success("Modelo criado");
      return true;
    } catch {
      toast.error("Falha ao criar modelo");
      return false;
    }
  }, [refreshAttendanceTemplates, user?.role]);

  const updateAttendanceTemplate = useCallback(async (id: number, payload: { activityId?: number; weekday?: number; startTime?: string; endTime?: string; active?: boolean }) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/attendance/templates/${id}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      await refreshAttendanceTemplates();
      toast.success("Modelo atualizado");
      return true;
    } catch {
      toast.error("Falha ao atualizar modelo");
      return false;
    }
  }, [refreshAttendanceTemplates, user?.role]);

  const deleteAttendanceTemplate = useCallback(async (id: number) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/attendance/templates/${id}`, { method: "DELETE" });
      await refreshAttendanceTemplates();
      toast.success("Modelo removido");
      return true;
    } catch {
      toast.error("Falha ao remover modelo");
      return false;
    }
  }, [refreshAttendanceTemplates, user?.role]);

  const applyEmployeeTemplates = useCallback(async (payload: { employeeId: number; templateIds: number[]; replace?: boolean; toleranceMin?: number }) => {
    if (user?.role !== "admin" || !Number.isFinite(payload.employeeId)) return false;
    try {
      await apiFetch(`/admin/attendance/employees/${payload.employeeId}/templates/apply`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          templateIds: Array.isArray(payload.templateIds) ? payload.templateIds : [],
          replace: !!payload.replace,
          toleranceMin: Number.isFinite(Number(payload.toleranceMin)) ? Number(payload.toleranceMin) : 5,
        }),
      });
      await refreshAttendance();
      toast.success("Modelos aplicados ao funcionario");
      return true;
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "not_teacher_for_class") {
        toast.error("Esse funcionario nao pode receber aulas.");
        return false;
      }
      toast.error("Falha ao aplicar modelos");
      return false;
    }
  }, [refreshAttendance, user?.role]);

  const updateAttendanceSchedule = useCallback(async (id: number, payload: { weekday?: number; startTime?: string; endTime?: string; scheduleType?: "class" | "function"; activityId?: number; valuePerClass?: number | null; toleranceMin?: number; active?: boolean }) => {
    if (user?.role !== "admin" || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/admin/attendance/schedules/${id}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      await refreshAttendance();
      toast.success("Escala atualizada");
      return true;
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "not_teacher_for_class") {
        toast.error("Funcionario nao pode receber escala de aula.");
        return false;
      }
      toast.error("Falha ao atualizar escala");
      return false;
    }
  }, [refreshAttendance, user?.role]);

  const value = useMemo<PanelDataContextValue>(() => ({
    authLoading,
    user,
    connected,
    login,
    logout,
    chats,
    selectedChatId,
    selectedChat,
    messages,
    selectChat,
    ackChatAttention,
    sendText,
    setChatIAEnabled,
    fetchAiContextPreview,
    submitAiFeedback,
    loadMoreMessages,
    hasMoreMessages: !!messageCursor,
    loadingMessages,
    radio: { ...radio, currentTrack: radio.currentTrack ? { ...radio.currentTrack, title: formatTrackTitle(radio.currentTrack) } : null },
    playlist,
    adFiles,
    adCampaigns,
    adHistory,
    nextAdState,
    adPlayback,
    toggleRadio,
    skipTrack,
    playTrack,
    addTrack,
    removeTrack,
    updateRadioSettings,
    refreshAds,
    refreshAdCampaigns,
    refreshAdHistory,
    refreshNextAdState,
    uploadAd,
    deleteAd,
    createAdCampaign,
    updateAdCampaign,
    toggleAdCampaign,
    deleteAdCampaign,
    playAdNow,
    emitAdsEvent,
    trackAdCampaignRun,
    updateAdPlaybackState,
    attendanceEmployees,
    attendanceCatalog,
    attendanceTemplates,
    attendanceSchedules,
    attendanceRecords,
    attendanceSummary,
    attendanceSelectedEmployee,
    attendanceFromDate,
    attendanceToDate,
    setAttendanceSelectedEmployee,
    setAttendanceFromDate,
    setAttendanceToDate,
    refreshAttendanceCatalog,
    refreshAttendanceTemplates,
    createAttendanceEmployee,
    updateAttendanceEmployee,
    deleteAttendanceEmployee,
    createAttendanceCatalogItem,
    updateAttendanceCatalogItem,
    deleteAttendanceCatalogItem,
    createAttendanceTemplate,
    updateAttendanceTemplate,
    deleteAttendanceTemplate,
    applyEmployeeTemplates,
    updateAttendanceSchedule,
    refreshAttendance,
    knowledgeBase,
    saveKnowledgeBase,
    geoPolicy,
    saveGeoPolicy,
    systemHealth,
  }), [
    adCampaigns,
    adFiles,
    adHistory,
    adPlayback,
    attendanceFromDate,
    attendanceToDate,
    attendanceEmployees,
    attendanceCatalog,
    attendanceTemplates,
    attendanceSchedules,
    attendanceRecords,
    attendanceSelectedEmployee,
    attendanceSummary,
    applyEmployeeTemplates,
    authLoading,
    chats,
    connected,
    createAttendanceCatalogItem,
    createAttendanceEmployee,
    createAttendanceTemplate,
    createAdCampaign,
    deleteAttendanceCatalogItem,
    deleteAttendanceEmployee,
    deleteAttendanceTemplate,
    deleteAd,
    deleteAdCampaign,
    emitAdsEvent,
    fetchAiContextPreview,
    submitAiFeedback,
    knowledgeBase,
    loadMoreMessages,
    loadingMessages,
    login,
    logout,
    messageCursor,
    messages,
    nextAdState,
    playlist,
    playAdNow,
    radio,
    refreshAdCampaigns,
    refreshAdHistory,
    refreshAds,
    refreshNextAdState,
    refreshAttendanceCatalog,
    refreshAttendanceTemplates,
    refreshAttendance,
    saveKnowledgeBase,
    geoPolicy,
    saveGeoPolicy,
    systemHealth,
    ackChatAttention,
    selectChat,
    selectedChat,
    selectedChatId,
    sendText,
    toggleRadio,
    skipTrack,
    playTrack,
    addTrack,
    removeTrack,
    toggleAdCampaign,
    updateRadioSettings,
    setChatIAEnabled,
    updateAttendanceCatalogItem,
    updateAttendanceTemplate,
    updateAttendanceSchedule,
    trackAdCampaignRun,
    updateAdCampaign,
    updateAdPlaybackState,
    updateAttendanceEmployee,
    uploadAd,
    user,
  ]);

  return <PanelDataContext.Provider value={value}>{children}</PanelDataContext.Provider>;
}

export function usePanelData() {
  const context = useContext(PanelDataContext);
  if (!context) throw new Error("usePanelData must be used inside PanelDataProvider");
  return context;
}

export function parsePanelMessage(message: string): ParsedPanelMessage {
  const meta = extractHistoryTimestamp(message);
  const parsed = splitChatLine(meta.content);
  const senderKey = parsed.sender.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const role = isInboundMessage(meta.content) ? "user" : senderKey === "hime" ? "ai" : senderKey === "sistema" ? "system" : "operator";
  const media = parseChatMediaMarker(parsed.body);
  return {
    id: `${parsed.sender}-${parsed.body}`.slice(0, 120),
    content: media ? media.text : previewMessage(meta.content),
    sender: role,
    timestamp: formatMessageTimestamp(meta.timestampMs),
    senderName: parsed.sender,
    mediaKind: media?.kind,
    media: media?.media,
  };
}
