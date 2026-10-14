const jsonError = (message, status = 400) => Response.json({ error: message }, { status });
function parseArray(value) { try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; } catch { return []; } }
function cleanText(value, max) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }

export async function onRequestPost({ request, env }) {
  if (!env.DB) return jsonError('نظام الطلبات غير جاهز بعد. حاول لاحقًا.', 503);
  let body;
  try { body = await request.json(); } catch { return jsonError('بيانات الطلب غير صحيحة.'); }
  const name = cleanText(body.name, 100);
  const phone = cleanText(body.phone, 25);
  const email = cleanText(body.email, 160);
  if (name.length < 2) return jsonError('الاسم مطلوب.');
  if (phone.replace(/\D/g, '').length < 8) return jsonError('رقم الهاتف غير صحيح.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('البريد الإلكتروني غير صحيح.');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) return jsonError('السلة فارغة أو تحتوي على عدد غير صالح من المنتجات.');

  const items = [];
  let total = 0;
  for (const submitted of body.items) {
    const id = cleanText(submitted?.id, 80);
    const quantity = Number(submitted?.quantity);
    const size = cleanText(submitted?.size, 20);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return jsonError('تأكد من الكميات المختارة.');
    const row = await env.DB.prepare('SELECT id, code, title, price, images_json, sizes_json FROM products WHERE id = ?').bind(id).first();
    if (!row) return jsonError('أحد المنتجات في السلة لم يعد متاحًا. حدّث الصفحة وراجع السلة.');
    const sizes = parseArray(row.sizes_json);
    if (sizes.length && (!size || !sizes.map(String).includes(size))) return jsonError(`اختار مقاسًا صحيحًا للمنتج ${row.title}.`);
    if (!sizes.length && size) return jsonError(`حدّث الصفحة قبل طلب المنتج ${row.title}.`);
    const price = Number(row.price);
    const lineTotal = Math.round(price * quantity * 100) / 100;
    items.push({ productId: row.id, code: row.code, title: row.title, price, quantity, size, lineTotal, image: parseArray(row.images_json)[0] || '' });
    total += lineTotal;
  }
  total = Math.round(total * 100) / 100;
  const now = new Date().toISOString();
  try {
    const inserted = await env.DB.prepare('INSERT INTO orders (order_code, customer_name, customer_phone, customer_email, items_json, total, status, created_at, updated_at) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(name, phone, email, JSON.stringify(items), total, 'new', now, now).run();
    const id = Number(inserted.meta?.last_row_id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Could not obtain order id');
    const orderCode = `CL${String(id).padStart(4, '0')}`;
    await env.DB.prepare('UPDATE orders SET order_code = ?, updated_at = ? WHERE id = ?').bind(orderCode, now, id).run();
    const message = `مرحباً انا هنا لأتمام طلب الشراء من موقع plus90 وهذا كود الطلب معه\n"${orderCode}"`;
    const whatsappUrl = `https://wa.me/201126090244?text=${encodeURIComponent(message)}`;
    return Response.json({ ok: true, orderCode, total, whatsappUrl }, { status: 201 });
  } catch {
    return jsonError('تعذر حفظ الطلب الآن. لم يتم تفريغ السلة؛ حاول مرة أخرى بعد قليل.', 500);
  }
}

// Public, read-only status lookup used by the storefront to know when the admin has
// confirmed/completed an order (only then is the order removed from the customer's cart).
// Returns the order code and status ONLY — never customer data.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return jsonError('نظام الطلبات غير جاهز بعد.', 503);
  const raw = new URL(request.url).searchParams.get('codes') || '';
  const codes = [...new Set(raw.split(',').map(code => code.trim().toUpperCase()).filter(code => /^CL\d{4,10}$/.test(code)))].slice(0, 20);
  if (!codes.length) return Response.json({ orders: [] });
  try {
    const placeholders = codes.map(() => '?').join(',');
    const { results = [] } = await env.DB.prepare(`SELECT order_code, status FROM orders WHERE order_code IN (${placeholders})`).bind(...codes).all();
    return Response.json({ orders: results.map(row => ({ orderCode: row.order_code, status: row.status })) });
  } catch {
    return jsonError('تعذر التحقق من حالة الطلبات.', 500);
  }
}
