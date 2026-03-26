const explicitApiBase = String(import.meta.env.VITE_API_URL || '').trim();
const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

// Local dev keeps the existing backend port. Hosted frontends should set VITE_API_URL.
export const API_BASE = explicitApiBase || (isLocalHost ? 'http://localhost:3001/api' : `${window.location.origin}/api`);
