const COOKIE_NAME = 'p90_admin';
const SESSION_SECONDS = 8 * 60 * 60;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator > 0 && trimmed.slice(0, separator) === name) return trimmed.slice(separator + 1);
  }
  return '';
}

export async function createAdminCookie(env) {
  if (!env.ADMIN_SESSION_SECRET) throw new Error('ADMIN_SESSION_SECRET is not configured');
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signature = await sign(String(expires), env.ADMIN_SESSION_SECRET);
  return `${COOKIE_NAME}=${expires}.${signature}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export async function isAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const token = getCookie(request, COOKIE_NAME);
  const separator = token.indexOf('.');
  if (separator < 1) return false;
  const expiry = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d{10,}$/.test(expiry) || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  try {
    const expected = await sign(expiry, env.ADMIN_SESSION_SECRET);
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

export function clearAdminCookie() {
  return `${COOKIE_NAME}=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return request.method === 'GET' || request.method === 'HEAD';
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
