import { adminToken } from "./config";

export const UNAUTHORIZED_MSG = "Fel admin-token – skriv värdet av ADMIN_TOKEN från config/secrets.env i fältet Admin-token.";

export function authorized(req: Request) {
  if (!adminToken) return true;
  const url = new URL(req.url);
  const given = (req.headers.get("x-admin-token") ?? url.searchParams.get("token") ?? "").trim();
  return given === adminToken;
}
