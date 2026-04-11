import React, { useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import RadioPanel from './components/RadioPanel.jsx';
import Toast from './components/Toast.jsx';
import Login from './components/Login.jsx';
import { formatPhone, formatTime, debounce } from './utils/helpers.js';

const DEFAULT_TAGS = [
  { val: '🔥 Aula Exp.', label: 'Aula Exp.' },
  { val: '✅ Matriculado', label: 'Matriculado' },
  { val: '👀 Interessado', label: 'Interessado' },
  { val: '❌ Ex-Aluno', label: 'Ex-Aluno' },
  { val: '🛟 Ajuda', label: 'Precisa de Humano' }
];

const DEFAULT_THEME = () => {
  const stored = localStorage.getItem('h_panel_theme');
  if (stored) return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const DEFAULT_DUCK = {
  enabled: true,
  levelDb: -18,
  attackMs: 60,
  releaseMs: 600,
  minHoldMs: 250,
  cooldownSec: 120
};

const DEFAULT_NOTIFY = {
  soundEnabled: true,
  mute: false,
  volume: 60,
  notifyBackgroundOnly: true,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  systemNotifications: false
};

export default function App() {
  const [ws, setWs] = useState(null);
  const wsRef = useRef(null);
  const sendWS = (payload) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(payload));
  };

  const [connected, setConnected] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [loginUser, setLoginUser] = useState(localStorage.getItem('h_u') || '');
  const [loginPass, setLoginPass] = useState(localStorage.getItem('h_p') || '');
  const [currentUser, setCurrentUser] = useState({ username: '', fullname: '', role: 'user', avatar: '' });

  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const currentChatIdRef = useRef(null);
  const [currentHistory, setCurrentHistory] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentTags, setCurrentTags] = useState([]);
  const [currentNotes, setCurrentNotes] = useState('');
  const [isChatPaused, setIsChatPaused] = useState(false);
  const [chatTab, setChatTab] = useState('active');
  const [search, setSearch] = useState('');

  const [toast, setToast] = useState(null);
  const [showRadioPanel, setShowRadioPanel] = useState(false);
  const [showSidebarDrawer, setShowSidebarDrawer] = useState(false);
  const [showRightDrawer, setShowRightDrawer] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);

  const [scrollSignal, setScrollSignal] = useState(0);

  const [radio, setRadio] = useState({
    isPlaying: false,
    currentTrack: null,
    musicVolume: 50,
    adVolume: 80,
    adFrequency: 15,
    isShuffle: false,
    startTime: 0,
    serverDuration: 0
  });

  const [playlist, setPlaylist] = useState([]);
  const [adList, setAdList] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  const [ducking, setDucking] = useState(() => {
    const raw = localStorage.getItem('h_radio_prefs');
    if (!raw) return DEFAULT_DUCK;
    try { return { ...DEFAULT_DUCK, ...JSON.parse(raw) }; } catch { return DEFAULT_DUCK; }
  });

  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    const raw = localStorage.getItem('h_notify_prefs');
    if (!raw) return DEFAULT_NOTIFY;
    try { return { ...DEFAULT_NOTIFY, ...JSON.parse(raw) }; } catch { return DEFAULT_NOTIFY; }
  });
  const [notifyAudioOk, setNotifyAudioOk] = useState(false);

  const [notificationState, setNotificationState] = useState({
    lastSoundAt: 0,
    titleBase: document.title,
    titleTimer: null,
    isWindowFocused: !document.hidden
  });
  const [sessionStats, setSessionStats] = useState({ inbound: 0, outbound: 0 });

  const [knowledge, setKnowledge] = useState({ avisos: '' });
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [knowledgeVersions, setKnowledgeVersions] = useState([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  const [adStatus, setAdStatus] = useState({ mutex: false, currentAd: null, lastAdTime: 0, played: 0, failed: 0, skipped: 0 });

  const [theme, setTheme] = useState(DEFAULT_THEME);

  const musicRef = useRef(null);
  const adRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('h_panel_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('h_notify_prefs', JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  useEffect(() => {
    fetch('/media/notify.mp3', { method: 'HEAD' })
      .then((r) => setNotifyAudioOk(r.ok))
      .catch(() => setNotifyAudioOk(false));
  }, []);

  useEffect(() => {
    const wsUrl = import.meta.env.DEV ? `ws://${location.hostname}:3001` : (location.protocol === 'https:' ? `wss://${location.host}` : `ws://${location.host}`);
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      setConnected(true);
      if (loginUser && loginPass) doLogin(socket, loginUser, loginPass);
    };
    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);
    socket.onmessage = (e) => {
      try { handleMessage(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    setWs(socket);
    wsRef.current = socket;

    return () => socket.close();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchPlaylist();
    fetchAds();
    sendWS({ type: 'request_initial_lists' });
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const t = setInterval(() => sendWS({ type: 'request_initial_lists' }), 30000);
    return () => clearInterval(t);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !currentChatId) return;
    loadLatestHistory(currentChatId);
  }, [isLoggedIn, currentChatId]);

  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  useEffect(() => {
    const onFocus = () => setNotificationState(prev => ({ ...prev, isWindowFocused: true }));
    const onBlur = () => setNotificationState(prev => ({ ...prev, isWindowFocused: false }));
    const onVisibility = () => setNotificationState(prev => ({ ...prev, isWindowFocused: !document.hidden }));
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!radio.currentTrack || !musicRef.current) return;
    const audio = musicRef.current;
    const src = new URL(`/cache/${radio.currentTrack.videoId}.mp3`, location.origin).href;
    if (audio.src !== src) {
      audio.src = src;
      audio.load();
    }
    audio.volume = Math.min(1, Math.max(0, radio.musicVolume / 100));
    if (radio.isPlaying) audio.play().catch(() => {});
    if (!radio.isPlaying) audio.pause();
  }, [radio.currentTrack, radio.isPlaying, radio.musicVolume]);

  useEffect(() => {
    let timer = null;
    if (radio.isPlaying && radio.startTime && musicRef.current) {
      timer = setInterval(() => syncAudio(), 5000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [radio.isPlaying, radio.startTime]);

  useEffect(() => {
    if (!radio.isPlaying) return;
    if (!adList.length) return;
    const t = setInterval(() => checkAdSchedule('timer'), 10000);
    return () => clearInterval(t);
  }, [radio.isPlaying, adList.length, radio.adFrequency]);

  const saveDucking = (next) => {
    setDucking(next);
    localStorage.setItem('h_radio_prefs', JSON.stringify(next));
  };

  const shouldNotifyNow = () => {
    if (!notificationPrefs.soundEnabled || notificationPrefs.mute) return false;
    if (notificationPrefs.notifyBackgroundOnly && notificationState.isWindowFocused) return false;
    if (!notificationPrefs.quietHoursEnabled) return true;
    const now = new Date();
    const [sh, sm] = notificationPrefs.quietStart.split(':').map(Number);
    const [eh, em] = notificationPrefs.quietEnd.split(':').map(Number);
    const start = new Date(now); start.setHours(sh, sm, 0, 0);
    const end = new Date(now); end.setHours(eh, em, 0, 0);
    if (start <= end) {
      return !(now >= start && now <= end);
    }
    return !(now >= start || now <= end);
  };

  const playNotifySound = () => {
    const now = Date.now();
    if (now - notificationState.lastSoundAt < 1200) return;
    setNotificationState(prev => ({ ...prev, lastSoundAt: now }));
    if (notifyAudioOk) {
      const audio = new Audio('/media/notify.mp3');
      audio.volume = Math.min(1, Math.max(0, (notificationPrefs.volume || 0) / 100));
      audio.play().catch(() => {});
      return;
    }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08 * ((notificationPrefs.volume || 0) / 100);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  const maybeSystemNotify = (title, body, chatId) => {
    if (!notificationPrefs.systemNotifications) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    const n = new Notification(title, { body });
    n.onclick = () => { window.focus(); if (chatId) selectChat(chatId); };
  };

  const ensureNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    const p = await Notification.requestPermission();
    if (p !== 'granted') setNotificationPrefs(prev => ({ ...prev, systemNotifications: false }));
  };

  const updateTitleFlash = (count) => {
    if (!count) {
      if (notificationState.titleTimer) {
        clearInterval(notificationState.titleTimer);
        setNotificationState(prev => ({ ...prev, titleTimer: null }));
      }
      document.title = notificationState.titleBase;
      return;
    }
    if (!document.hidden && notificationState.isWindowFocused) return;
    if (notificationState.titleTimer) return;
    let toggle = false;
    const timer = setInterval(() => {
      document.title = toggle ? notificationState.titleBase : `(${count}) Novo atendimento`;
      toggle = !toggle;
    }, 1200);
    setNotificationState(prev => ({ ...prev, titleTimer: timer }));
  };

  const debouncedSaveNotes = useMemo(() => debounce((notes, tags) => {
    if (!currentChatId) return;
    sendWS({ type: 'update_contact_data', contactId: currentChatId, tags, notes });
  }, 700), [ws, currentChatId]);

  const filteredChats = useMemo(() => {
    let list = [...chats].filter(c => (c.status || 'active') === chatTab);
    if (search) list = list.filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [chats, chatTab, search]);

  const totalUnread = useMemo(() => chats.reduce((s, c) => s + (c.unreadCount || 0), 0), [chats]);

  useEffect(() => { updateTitleFlash(totalUnread); }, [totalUnread, notificationState.isWindowFocused]);

  const showToast = (title, message, type = 'info', onClick = null) => {
    setToast({ title, message, type, onClick });
    setTimeout(() => setToast(null), 3000);
  };

  const doLogin = (socket, user, pass) => {
    setLoginError(false);
    socket.send(JSON.stringify({ type: 'login', user, pass }));
  };

  const logAd = (event, data = {}) => {
    console.log(`[ads] ${event}`, data);
    sendWS({ type: 'ads_event', event, data });
  };

  const selectAdFile = () => {
    if (!adList.length) return null;
    const idx = Math.floor(Math.random() * adList.length);
    return adList[idx];
  };

  const checkAdSchedule = (reason) => {
    if (adStatus.mutex) return logAd('ads.skipped', { reason: 'mutex' });
    if (!radio.isPlaying) return logAd('ads.skipped', { reason: 'radio_off' });
    if (!musicRef.current) return logAd('ads.skipped', { reason: 'music_missing' });
    if (musicRef.current.paused) logAd('ads.warn', { reason: 'music_paused' });
    if (!adList.length) return logAd('ads.skipped', { reason: 'no_files' });
    const cooldownMs = Math.max(60000, radio.adFrequency * 60000);
    if (Date.now() - adStatus.lastAdTime < cooldownMs) return logAd('ads.skipped', { reason: 'cooldown' });
    const file = selectAdFile();
    if (file) playAdFile(file, reason);
  };

  const playAdFile = (file, reason) => {
    if (!adRef.current) return;
    const prevLastAdTime = adStatus.lastAdTime || 0;
    setAdStatus(prev => ({ ...prev, mutex: true, currentAd: file }));
    logAd('ads.tryPlay', { reason, file });
    const ad = adRef.current;
    ad.pause();
    try { ad.currentTime = 0; } catch {}
    ad.src = `/ads/${encodeURIComponent(file)}`;
    ad.volume = Math.min(1, Math.max(0, radio.adVolume / 100));
    let started = false;
    let preDucked = false;
    const preDuck = () => {
      if (preDucked) return;
      preDucked = true;
      applyDucking(true);
    };
    const resumeMusic = () => {
      const m = musicRef.current;
      if (!m || !radio.isPlaying || !radio.currentTrack?.videoId) return;
      const expectedSrc = new URL(`/cache/${radio.currentTrack.videoId}.mp3`, location.origin).href;
      if (m.src !== expectedSrc) {
        m.src = expectedSrc;
        m.load();
      }
      if (radio.startTime) {
        const elapsed = Math.max(0, (Date.now() - radio.startTime) / 1000);
        if (Math.abs((m.currentTime || 0) - elapsed) > 2) {
          try { m.currentTime = elapsed; } catch {}
        }
      }
      m.volume = Math.min(1, Math.max(0, radio.musicVolume / 100));
      m.play().catch(() => {});
    };
    const finish = (reasonCode) => {
      applyDucking(false);
      try { ad.pause(); ad.currentTime = 0; } catch {}
      resumeMusic();
      setTimeout(() => resumeMusic(), 180);
      if (reasonCode === 'ended') {
        setAdStatus(prev => ({ ...prev, mutex: false, currentAd: null, played: prev.played + 1 }));
        logAd('ads.play.end', { file });
      } else {
        setAdStatus(prev => ({ ...prev, mutex: false, currentAd: null, failed: prev.failed + 1, lastAdTime: prevLastAdTime }));
        logAd('ads.play.error', { file, reason: reasonCode });
      }
    };
    preDuck();
    ad.onplay = () => {
      if (started) return;
      started = true;
      applyDucking(true);
      const ts = Date.now();
      setAdStatus(prev => ({ ...prev, lastAdTime: ts }));
    };
    ad.onplaying = () => {
      if (started) return;
      started = true;
      applyDucking(true);
      const ts = Date.now();
      setAdStatus(prev => ({ ...prev, lastAdTime: ts }));
    };
    ad.onended = () => finish('ended');
    ad.onerror = () => finish('error');
    ad.onabort = () => finish('abort');
    ad.play().catch(() => {
      finish('play_rejected');
    });
    setTimeout(() => {
      setAdStatus(prev => prev.mutex ? { ...prev, mutex: false, currentAd: null, failed: prev.failed + 1, lastAdTime: prevLastAdTime } : prev);
    }, 30000);
  };

  const testAds = async () => {
    const res = await fetch('/admin/radio/ads/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-panel-user': loginUser, 'x-panel-pass': loginPass }
    });
    const data = await res.json();
    if (data.ok) showToast('Anúncios', `OK: ${data.file}`, 'success');
    else showToast('Anúncios', `Falha: ${data.reason || 'erro'}`, 'alert');
  };

  const handleMessage = (d) => {
    switch (d.type) {
      case 'login_success': {
        setIsLoggedIn(true);
        setCurrentUser({ username: d.username, fullname: d.fullname, role: d.isAdmin ? 'admin' : 'user', avatar: d.avatar });
        localStorage.setItem('h_u', loginUser);
        localStorage.setItem('h_p', loginPass);
        sendWS({ type: 'request_initial_lists' });
        break;
      }
      case 'login_error':
        setLoginError(true);
        break;
      case 'active_chat_list': {
        const list = (d.chats || []).map(c => ({
          id: c.id,
          name: c.name,
          lastMessage: c.lastMessage,
          timestamp: c.timestamp,
          tags: c.tags || [],
          notes: c.notes || '',
          status: c.status || 'active',
          pausedByHuman: !!c.pausedByHuman,
          unreadCount: 0
        }));
        setChats(list);
        break;
      }
      case 'chat_history_response': {
        if (d.from !== currentChatIdRef.current && d.from !== currentChatId) break;
        setCurrentHistory(d.history || []);
        setCurrentTags(d.tags || []);
        setCurrentNotes(d.notes || '');
        setIsChatPaused(!!d.isPaused);
        break;
      }
      case 'user_reply': {
        updateChatMessage(d.from, `Usuário: ${d.text}`, d.name, d.status, d.pausedByHuman, true);
        if (d.from === currentChatIdRef.current) {
          setCurrentHistory(prev => [...prev, `Usuário: ${d.text}`]);
          if (typeof d.pausedByHuman !== 'undefined') setIsChatPaused(!!d.pausedByHuman);
        }
        setSessionStats(prev => ({ ...prev, inbound: prev.inbound + 1 }));
        break;
      }
      case 'bot_reply': {
        updateChatMessage(d.from, `Hime: ${d.text}`);
        break;
      }
      case 'admin_reply_success': {
        updateChatMessage(d.from, `${d.senderName}: ${d.text}`);
        setSessionStats(prev => ({ ...prev, outbound: prev.outbound + 1 }));
        break;
      }
      case 'help_alert': {
        showToast('Humano solicitado', `${d.name}: ${d.text}`, 'alert');
        if (shouldNotifyNow()) playNotifySound();
        maybeSystemNotify('Humano solicitado', `${d.name}: ${d.text}`, d.from);
        break;
      }
      case 'contact_data_updated': {
        setChats(prev => prev.map(c => c.id === d.contactId ? { ...c, tags: d.tags, notes: d.notes } : c));
        if (d.contactId === currentChatId) {
          setCurrentTags(d.tags || []);
          setCurrentNotes(d.notes || '');
        }
        break;
      }
      case 'bot_resumed': {
        if (d.from === currentChatId) setIsChatPaused(false);
        break;
      }
      case 'chat_archived_update': {
        setChats(prev => prev.map(c => c.id === d.id ? { ...c, status: 'archived' } : c));
        break;
      }
      case 'radio_sync_update': {
        if (d.state) {
          setRadio(prev => ({
            isPlaying: d.state.isPlaying,
            currentTrack: (d.state.currentTrack && prev.currentTrack && d.state.currentTrack.videoId === prev.currentTrack.videoId) ? prev.currentTrack : d.state.currentTrack,
            musicVolume: d.state.musicVolume,
            adVolume: d.state.adVolume,
            adFrequency: d.state.adFrequency,
            isShuffle: d.state.isShuffle,
            startTime: d.state.startTime,
            serverDuration: d.state.serverDuration
          }));
        }
        break;
      }
      case 'playlist_updated':
        fetchPlaylist();
        break;
      case 'suggestions_list':
        setSuggestions(d.list || []);
        break;
      default:
        break;
    }
  };

  const updateChatMessage = (id, text, name = null, status = 'active', pausedByHuman = false, isInbound = false) => {
    setChats(prev => {
      const next = prev.map(c => {
        if (c.id !== id) return c;
        return {
          ...c,
          name: name || c.name,
          lastMessage: text,
          timestamp: Date.now(),
          status: status || c.status,
          pausedByHuman: pausedByHuman ?? c.pausedByHuman,
          unreadCount: c.id === currentChatIdRef.current ? 0 : (c.unreadCount || 0) + (isInbound ? 1 : 0),
          highlightUntil: isInbound && c.id !== currentChatIdRef.current ? Date.now() + 3000 : c.highlightUntil
        };
      });
      return next;
    });
    if (id === currentChatIdRef.current) {
      setCurrentHistory(prev => [...prev, text]);
    }
    if (isInbound && id !== currentChatIdRef.current) {
      showToast('Nova mensagem', name ? `${name}: ${text.replace(/^Usuário:\s*/, '')}` : text, 'info', () => selectChat(id));
      if (shouldNotifyNow()) playNotifySound();
      maybeSystemNotify('Nova mensagem', name ? `${name}: ${text.replace(/^Usuário:\s*/, '')}` : text, id);
      setTimeout(() => {
        setChats(prev => prev.map(c => c.id === id ? { ...c, highlightUntil: 0 } : c));
      }, 3200);
    }
  };

  const selectChat = (chatId) => {
    currentChatIdRef.current = chatId;
    setCurrentChatId(chatId);
    setCurrentHistory([]);
    setHistoryCursor(null);
    setHistoryHasMore(false);
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c));
    loadLatestHistory(chatId);
  };

  const loadLatestHistory = async (chatId) => {
    if (!chatId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(chatId)}/messages?limit=80`);
      const data = await res.json();
      setCurrentHistory(data.messages || []);
      setHistoryCursor(data.nextCursor ?? null);
      setHistoryHasMore(!!data.nextCursor);
      sendWS({ type: 'request_chat_history', contactId: chatId });
    } catch (e) {
      sendWS({ type: 'request_chat_history', contactId: chatId });
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadMoreHistory = async () => {
    if (!currentChatId || !historyHasMore || historyLoading) return false;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(currentChatId)}/messages?limit=80&before=${historyCursor}`);
      const data = await res.json();
      if (data.messages && data.messages.length) {
        setCurrentHistory(prev => [...data.messages, ...prev]);
      }
      setHistoryCursor(data.nextCursor ?? null);
      setHistoryHasMore(!!data.nextCursor);
      return true;
    } catch (e) {
      return false;
    } finally {
      setHistoryLoading(false);
    }
  };

  const sendMessage = (text) => {
    if (!text || !currentChatId) return;
    sendWS({ type: 'admin_reply', to: currentChatId, text });
    setScrollSignal((v) => v + 1);
  };

  const resumeBot = () => {
    if (!currentChatId) return;
    sendWS({ type: 'resume_bot', to: currentChatId });
  };

  const endChat = () => {
    if (!currentChatId) return;
    if (!confirm('Finalizar e arquivar?')) return;
    sendWS({ type: 'end_chat', to: currentChatId });
  };

  const addTag = (tag) => {
    if (currentTags.includes(tag)) return;
    const next = [...currentTags, tag];
    setCurrentTags(next);
    debouncedSaveNotes(currentNotes, next);
  };

  const removeTag = (tag) => {
    const next = currentTags.filter(t => t !== tag);
    setCurrentTags(next);
    debouncedSaveNotes(currentNotes, next);
  };

  const updateNotes = (value) => {
    setCurrentNotes(value);
    debouncedSaveNotes(value, currentTags);
  };

  const fetchPlaylist = async () => {
    try {
      const res = await fetch('/api/playlist');
      const data = await res.json();
      setPlaylist(data.playlist || []);
      if (data.current) setRadio(prev => ({ ...prev, currentTrack: data.current }));
    } catch {
      showToast('Rádio', 'Falha ao carregar playlist', 'alert');
    }
  };

  const fetchAds = async () => {
    try {
      const res = await fetch('/api/ads');
      const data = await res.json();
      setAdList(Array.isArray(data) ? data : []);
    } catch {}
  };

  const toggleRadio = () => {
    if (!playlist.length) return;
    const action = radio.isPlaying ? 'pause' : 'play';
    sendWS({ type: 'radio_action', action });
  };

  const skipTrack = () => sendWS({ type: 'skip_track' });

  const updateRadioSettings = (next) => {
    setRadio(prev => ({ ...prev, ...next }));
    sendWS({
      type: 'radio_settings_update',
      musicVolume: next.musicVolume ?? radio.musicVolume,
      adVolume: next.adVolume ?? radio.adVolume,
      adFrequency: next.adFrequency ?? radio.adFrequency
    });
  };

  const addTrack = (url) => {
    if (!url) return;
    sendWS({ type: 'add_track', url });
  };

  const removeTrack = (id) => sendWS({ type: 'remove_track', id });

  const syncAudio = () => {
    if (!musicRef.current || !radio.startTime) return;
    const elapsed = (Date.now() - radio.startTime) / 1000;
    if (Math.abs(musicRef.current.currentTime - elapsed) > 2) {
      musicRef.current.currentTime = elapsed;
    }
  };

  const applyDucking = (on) => {
    if (!ducking.enabled || !musicRef.current) return;
    const base = Math.min(1, Math.max(0, radio.musicVolume / 100));
    const factor = Math.pow(10, (ducking.levelDb || -18) / 20);
    musicRef.current.volume = on ? base * factor : base;
  };

  const loadKnowledge = async () => {
    setKnowledgeLoading(true);
    try {
      const res = await fetch('/admin/knowledge/current', { headers: { 'x-panel-user': loginUser, 'x-panel-pass': loginPass } });
      const data = await res.json();
      setKnowledge(data.published || { avisos: '' });
      setKnowledgeBase(data.base_context || '');
      const v = await fetch('/admin/knowledge/versions', { headers: { 'x-panel-user': loginUser, 'x-panel-pass': loginPass } });
      const vd = await v.json();
      setKnowledgeVersions(vd.versions || []);
    } catch {}
    setKnowledgeLoading(false);
  };

  const publishKnowledge = async () => {
    if (!knowledge.avisos || knowledge.avisos.trim().length < 3) return showToast('Conhecimento', 'Aviso vazio.', 'alert');
    const res = await fetch('/admin/knowledge/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-panel-user': loginUser, 'x-panel-pass': loginPass },
      body: JSON.stringify({ avisos: knowledge.avisos })
    });
    if (res.ok) { showToast('Conhecimento', 'Publicado!', 'success'); loadKnowledge(); }
  };

  const rollbackKnowledge = async (id) => {
    const res = await fetch('/admin/knowledge/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-panel-user': loginUser, 'x-panel-pass': loginPass },
      body: JSON.stringify({ id })
    });
    if (res.ok) { showToast('Conhecimento', 'Rollback aplicado.', 'success'); loadKnowledge(); }
  };

  if (!isLoggedIn) {
    return (
      <Login
        connected={connected}
        loginUser={loginUser}
        loginPass={loginPass}
        loginError={loginError}
        onChangeUser={setLoginUser}
        onChangePass={setLoginPass}
        onLogin={() => ws && doLogin(ws, loginUser, loginPass)}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        connected={connected}
        radioPlaying={radio.isPlaying}
        volume={radio.musicVolume}
        nextAd={adList[0] || '---'}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        stats={sessionStats}
        onToggleSidebar={() => setShowSidebarDrawer(true)}
        onToggleRight={() => setShowRightDrawer(true)}
        onOpenKnowledge={() => { setShowKnowledge(true); loadKnowledge(); }}
      />
      <div className="layout">
        <aside className={`sidebar-panel drawer ${showSidebarDrawer ? 'open' : ''}`}>
          <Sidebar
            chats={filteredChats}
            chatTab={chatTab}
            onTabChange={setChatTab}
            search={search}
            onSearch={setSearch}
            onSelectChat={(id) => { selectChat(id); setShowSidebarDrawer(false); }}
            currentChatId={currentChatId}
            totalUnread={totalUnread}
            formatPhone={formatPhone}
            formatTime={formatTime}
          />
        </aside>
        <ChatPanel
          currentChatId={currentChatId}
          currentChatName={chats.find(c => c.id === currentChatId)?.name || ''}
          currentHistory={currentHistory}
          isChatPaused={isChatPaused}
          onSend={sendMessage}
          onResume={resumeBot}
          onEnd={endChat}
          onOpenSidebar={() => setShowSidebarDrawer(true)}
          onOpenRight={() => setShowRightDrawer(true)}
          scrollSignal={scrollSignal}
          hasMore={historyHasMore}
          loadingMore={historyLoading}
          onLoadMore={loadMoreHistory}
        />
        <aside className={`right-panel drawer ${showRightDrawer ? 'open' : ''}`}>
          <RightPanel
            tags={currentTags}
            tagOptions={DEFAULT_TAGS}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            notes={currentNotes}
            onChangeNotes={updateNotes}
            onOpenRadio={() => setShowRadioPanel(true)}
            radio={radio}
            onToggleRadio={toggleRadio}
            onSkipRadio={skipTrack}
            onUpdateRadio={updateRadioSettings}
            adStatus={adStatus}
            onTestAds={testAds}
            notificationPrefs={notificationPrefs}
            onUpdateNotificationPrefs={setNotificationPrefs}
            onTestSound={() => playNotifySound()}
            onToggleSystemNotifications={ensureNotificationPermission}
          />
        </aside>
      </div>

      {(showSidebarDrawer || showRightDrawer) && (
        <div className="drawer-backdrop" onClick={() => { setShowSidebarDrawer(false); setShowRightDrawer(false); }} />
      )}

      {showRadioPanel && (
        <RadioPanel
          onClose={() => setShowRadioPanel(false)}
          radio={radio}
          playlist={playlist}
          ads={adList}
          suggestions={suggestions}
          ducking={ducking}
          onToggleRadio={toggleRadio}
          onSkip={skipTrack}
          onUpdateSettings={updateRadioSettings}
          onAddTrack={addTrack}
          onRemoveTrack={removeTrack}
          onFetchSuggestions={() => sendWS({ type: 'get_suggestions' })}
          onResolveSuggestion={(id, action, song) => sendWS({ type: 'resolve_suggestion', id, action, song })}
          onPlayAd={(file) => playAdFile(file, 'manual')}
          onUpdateDucking={saveDucking}
        />
      )}

      {showKnowledge && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <div className="modal-title">Conhecimento</div>
                <div className="muted">Editar avisos do dia</div>
              </div>
              <button className="btn" onClick={() => setShowKnowledge(false)}>Fechar</button>
            </div>
            <div className="modal-body">
              <div className="radio-left">
                <label className="muted">Avisos do dia (editável)</label>
                <textarea value={knowledge.avisos} onChange={(e) => setKnowledge({ ...knowledge, avisos: e.target.value })} className="knowledge-text" />
                <button className="btn accent" onClick={publishKnowledge} disabled={knowledgeLoading}>Publicar</button>
                <div className="muted">Preview</div>
                <div className="panel-card">{knowledge.avisos || 'Sem avisos publicados.'}</div>
              </div>
              <div className="radio-right">
                <div className="muted">Contexto base (somente leitura)</div>
                <div className="panel-card knowledge-base">{knowledgeBase || 'Contexto base vazio.'}</div>
                <div className="muted">Versões</div>
                <div className="list">
                  {knowledgeVersions.map(v => (
                    <div key={v.id} className="list-row">
                      <div className="list-title">#{v.id} • {new Date(v.created_at).toLocaleString()}</div>
                      <div className="list-actions">
                        {v.published && <span className="muted">Publicado</span>}
                        {!v.published && <button className="btn ghost" onClick={() => rollbackKnowledge(v.id)}>Rollback</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <audio ref={musicRef} preload="auto" />
      <audio ref={adRef} preload="auto" />

      {toast && <Toast {...toast} onClick={() => toast.onClick && toast.onClick()} />}
    </div>
  );
}
