import { adminToken } from "./config";

export function authorized(req: Request) {
  if (!adminToken) return true;
  const url = new URL(req.url);
  return (req.headers.get("x-admin-token") ?? url.searchParams.get("token")) === adminToken;
}
