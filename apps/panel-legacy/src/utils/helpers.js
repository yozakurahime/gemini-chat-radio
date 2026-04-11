export const formatPhone = (id) => {
  if (!id) return '';
  let n = id.split('@')[0].replace(/^55/, '');
  if (n.length === 11) return `(${n.substring(0, 2)}) ${n.substring(2, 7)}-${n.substring(7)}`;
  return n;
};

export const formatTime = (t) => {
  if (!t) return '';
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const debounce = (fn, wait) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};
