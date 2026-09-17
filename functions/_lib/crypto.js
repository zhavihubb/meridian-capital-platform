/* ============================================================
   Meridian Capital Partners — crypto helpers (Web Crypto)
   Works in Cloudflare Workers / Pages Functions (no Node APIs).
   - Password hashing: PBKDF2-SHA256 (100k iterations)
   - JWT: HS256 sign/verify
   ============================================================ */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlFromBytes(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromString(str) {
  return b64urlFromBytes(enc.encode(str));
}
function bytesFromB64url(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function stringFromB64url(s) {
  return dec.decode(bytesFromB64url(s));
}

/* ---------------- Password hashing (PBKDF2) ---------------- */
const PBKDF2_ITER = 100000;

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256
  );
  return 'pbkdf2$' + PBKDF2_ITER + '$' + b64urlFromBytes(salt) + '$' + b64urlFromBytes(bits);
}

export async function verifyPassword(password, stored) {
  try {
    if (!stored) return false;
    const parts = String(stored).split('$');
    if (parts[0] !== 'pbkdf2' || parts.length !== 4) return false;
    const iter = parseInt(parts[1], 10);
    const salt = bytesFromB64url(parts[2]);
    const expected = parts[3];
    const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256
    );
    const got = b64urlFromBytes(bits);
    /* constant-time-ish compare */
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    return false;
  }
}

/* ---------------- JWT (HS256) ---------------- */
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signJwt(payload, secret, expiresInSec) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = Object.assign({ iat: now, exp: now + (expiresInSec || 604800) }, payload);
  const h = b64urlFromString(JSON.stringify(header));
  const p = b64urlFromString(JSON.stringify(body));
  const data = h + '.' + p;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return data + '.' + b64urlFromBytes(sig);
}

export async function verifyJwt(token, secret) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const data = parts[0] + '.' + parts[1];
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, bytesFromB64url(parts[2]), enc.encode(data));
    if (!ok) return null;
    const payload = JSON.parse(stringFromB64url(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export function randomHex(bytes) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes || 24));
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}
