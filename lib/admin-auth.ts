/** Central admin-token boundary for every Mission Control API route. */

export const ADMIN_COOKIE = "mc_admin_session";

export function configured(): boolean {
  return Boolean(process.env.MC_ADMIN_TOKEN?.trim());
}

export function adminToken(): string {
  return process.env.MC_ADMIN_TOKEN?.trim() ?? "";
}

/** Constant-time comparison without exposing a timing oracle for token length. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function bearerToken(req: Request): string {
  const authorization = req.headers.get("authorization") ?? "";
  if (/^bearer\s+/i.test(authorization)) return authorization.replace(/^bearer\s+/i, "").trim();
  return (req.headers.get("x-mc-admin-token") ?? "").trim();
}

export function cookieToken(req: Request): string {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]*)`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

/** Accept a CLI bearer token or the HttpOnly browser session cookie. */
export function isAdminRequest(req: Request): boolean {
  const expected = adminToken();
  if (!expected) return false;
  return sameSecret(bearerToken(req), expected) || sameSecret(cookieToken(req), expected);
}
