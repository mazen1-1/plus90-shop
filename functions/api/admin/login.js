import { createAdminCookie, sameOrigin } from '../../_lib/admin-auth.js';

function safeCompare(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return Response.json({ error: 'طلب غير مسموح.' }, { status: 403 });
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) return Response.json({ error: 'إعدادات دخول الأدمن غير مكتملة في Cloudflare.' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'بيانات الدخول غير صحيحة.' }, { status: 400 }); }
  if (!safeCompare(body.password, env.ADMIN_PASSWORD)) return Response.json({ error: 'كلمة المرور غير صحيحة.' }, { status: 401 });
  try {
    const response = Response.json({ ok: true });
    response.headers.append('Set-Cookie', await createAdminCookie(env));
    return response;
  } catch {
    return Response.json({ error: 'تعذر بدء جلسة الأدمن.' }, { status: 500 });
  }
}
