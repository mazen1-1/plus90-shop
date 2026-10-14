import { clearAdminCookie, isAdmin, sameOrigin } from '../../_lib/admin-auth.js';
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return Response.json({ error: 'طلب غير مسموح.' }, { status: 403 });
  const response = Response.json({ ok: true });
  response.headers.append('Set-Cookie', clearAdminCookie());
  return response;
}
