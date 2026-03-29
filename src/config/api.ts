const explicitApiBase = String(import.meta.env.VITE_API_URL || '').trim();
const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
const origin = typeof window !== 'undefined' ? window.location.origin : '';
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

const getResolvedApiBase = () => {
  if (!explicitApiBase) {
    return isLocalHost ? 'http://localhost:3001/api' : `${origin}/api`;
  }

  if (isLocalHost) {
    return explicitApiBase;
  }

  try {
    const explicitUrl = new URL(explicitApiBase, origin);
    if (explicitUrl.origin === origin) {
      return explicitUrl.toString().replace(/\/+$/, '');
    }
  } catch {
    if (explicitApiBase.startsWith('/')) {
      return `${origin}${explicitApiBase}`.replace(/\/+$/, '');
    }
  }

  return `${origin}/api`;
};

export const API_BASE = getResolvedApiBase();
