const SUFFIXES = [
  [1e18, 'Quintillion'],
  [1e15, 'Quadrillion'],
  [1e12, 'Trillion'],
  [1e9,  'Billion'],
  [1e6,  'Million'],
  [1e3,  'Thousand'],
];

export function format(n, mode = 'words') {
  if (!Number.isFinite(n)) return '0';
  if (n < 0) n = 0;

  if (mode === 'scientific' || n >= 1e21) {
    if (!Number.isFinite(n)) return '0';
    return n.toExponential(2);
  }

  if (n < 1000) return String(Math.floor(n));

  for (const [threshold, label] of SUFFIXES) {
    if (n >= threshold) {
      return (n / threshold).toFixed(2) + ' ' + label;
    }
  }

  return String(Math.floor(n));
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatSize(cm) {
  if (!Number.isFinite(cm)) return '0 cm';
  return cm.toFixed(1) + ' cm';
}

export default { format, formatTime, formatSize };
