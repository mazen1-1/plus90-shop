import { isAdmin } from '../../_lib/admin-auth.js';
export async function onRequestGet({ request, env }) {
  const ok = await isAdmin(request, env);
  return Response.json({ authenticated: ok }, { status: ok ? 200 : 401 });
}
