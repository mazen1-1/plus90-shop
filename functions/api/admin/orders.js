import { isAdmin, sameOrigin } from '../../_lib/admin-auth.js';

const fail = (message, status = 400) => Response.json({ error: message }, { status });
function parseItems(value) { try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; } catch { return []; } }
function mapOrder(row) { return { id: Number(row.id), orderCode: row.order_code, name: row.customer_name, phone: row.customer_phone, email: row.customer_email, items: parseItems(row.items_json), total: Number(row.total), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }; }

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return fail('انتهت الجلسة. سجل الدخول مرة أخرى.', 401);
  try {
    const { results = [] } = await env.DB.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all();
    return Response.json({ orders: results.map(mapOrder) });
  } catch { return fail('تعذر تحميل الطلبات.', 500); }
}

export async function onRequestPatch({ request, env }) {
  if (!(await isAdmin(request, env))) return fail('انتهت الجلسة. سجل الدخول مرة أخرى.', 401);
  if (!sameOrigin(request)) return fail('طلب غير مسموح.', 403);
  let body;
  try { body = await request.json(); } catch { return fail('بيانات الحالة غير صحيحة.'); }
  const id = Number(body.id);
  const status = String(body.status || '');
  if (!Number.isSafeInteger(id) || id < 1) return fail('رقم الطلب غير صحيح.');
  if (!['new', 'confirmed', 'completed', 'cancelled'].includes(status)) return fail('حالة الطلب غير معروفة.');
  const result = await env.DB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), id).run();
  if (!result.meta?.changes) return fail('الطلب غير موجود.', 404);
  const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  return Response.json({ ok: true, order: mapOrder(row) });
}
