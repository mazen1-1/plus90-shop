function arrayValue(value) { try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; } catch { return []; } }

export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: 'قاعدة البيانات غير مربوطة.' }, { status: 503 });
  try {
    const { results = [] } = await env.DB.prepare('SELECT id, code, title, description, price, images_json, sizes_json, created_at, updated_at FROM products ORDER BY created_at DESC').all();
    const products = results.map(row => ({ id: row.id, code: row.code, title: row.title, description: row.description, price: Number(row.price), images: arrayValue(row.images_json), sizes: arrayValue(row.sizes_json), createdAt: row.created_at, updatedAt: row.updated_at }));
    return Response.json({ products });
  } catch {
    return Response.json({ error: 'تعذر تحميل المنتجات. تحقق من إعداد قاعدة البيانات.' }, { status: 500 });
  }
}
