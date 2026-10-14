import { isAdmin, sameOrigin } from '../../_lib/admin-auth.js';
import { githubConfig, uploadProductImages, verifyRepoImageUrls, syncProductsJson } from '../../_lib/github.js';

const fail = (message, status = 400) => Response.json({ error: message }, { status });
const parseArray = (value) => { try { const a = JSON.parse(value || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const clean = (value, max = 5000) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const productRow = (row) => ({ id: row.id, code: row.code, title: row.title, description: row.description, price: Number(row.price), images: parseArray(row.images_json), sizes: parseArray(row.sizes_json), createdAt: row.created_at, updatedAt: row.updated_at });

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return fail('انتهت الجلسة. سجل الدخول مرة أخرى.', 401);
  try {
    const { results = [] } = await env.DB.prepare('SELECT id, code, title, description, price, images_json, sizes_json, created_at, updated_at FROM products ORDER BY created_at DESC').all();
    return Response.json({ products: results.map(productRow) });
  } catch { return fail('تعذر تحميل المنتجات من قاعدة البيانات.', 500); }
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return fail('انتهت الجلسة. سجل الدخول مرة أخرى.', 401);
  if (!sameOrigin(request)) return fail('طلب غير مسموح.', 403);
  const size = Number(request.headers.get('Content-Length') || 0);
  if (size > 9 * 1024 * 1024) return fail('حجم البيانات كبير. قلل أحجام الصور وجرب ثانية.', 413);
  let form;
  try { form = await request.formData(); } catch { return fail('تعذر قراءة بيانات المنتج.'); }
  let input;
  try { input = JSON.parse(String(form.get('product') || '{}')); } catch { return fail('بيانات المنتج غير صحيحة.'); }
  const title = clean(input.title, 150);
  const description = clean(input.description, 5000);
  const price = Number(input.price);
  let code = clean(input.code, 30).toUpperCase().replace(/\s+/g, '-');
  const id = clean(input.id, 80) || crypto.randomUUID();
  if (title.length < 2) return fail('اسم المنتج مطلوب ويجب ألا يقل عن حرفين.');
  if (!Number.isFinite(price) || price <= 0 || price > 10000000) return fail('أدخل سعرًا صحيحًا أكبر من صفر.');
  if (code && !/^[A-Z0-9-]{3,30}$/.test(code)) return fail('كود المنتج يجب أن يحتوي على حروف إنجليزية وأرقام وشرطة فقط، من 3 إلى 30 رمزًا.');
  if (!code) code = `P90-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const sizes = String(input.sizes || '').split(/[،,\n]/).map(x => clean(x, 12)).filter(Boolean).slice(0, 30);
  const existingImages = parseArray(form.get('existingImages'));
  const files = form.getAll('images').filter(file => file && typeof file.arrayBuffer === 'function' && file.size > 0);
  if (files.length > 6) return fail('يمكن رفع 6 صور كحد أقصى للمنتج الواحد.');
  if (existingImages.length > 6) return fail('يمكن اختيار 6 صور كحد أقصى للمنتج الواحد.');
  try {
    const { owner, repo, branch } = githubConfig(env);
    if (!verifyRepoImageUrls(env, existingImages)) return fail('إحدى الصور الحالية لا تشير إلى مستودع GitHub الخاص بالمشروع. أعد اختيار الصور أو ارفعها من جديد.');
    const uploadedImages = await uploadProductImages(env, files);
    const images = [...existingImages, ...uploadedImages].slice(0, 6);
    if (!images.length) return fail('ارفع صورة واحدة على الأقل للمنتج.');
    const now = new Date().toISOString();
    const previous = await env.DB.prepare('SELECT id, created_at FROM products WHERE id = ?').bind(id).first();
    if (input.id && !previous) return fail('هذا المنتج لم يعد موجودًا. حدّث الصفحة ثم حاول مرة أخرى.', 404);
    if (previous) {
      await env.DB.prepare('UPDATE products SET code = ?, title = ?, description = ?, price = ?, images_json = ?, sizes_json = ?, updated_at = ? WHERE id = ?')
        .bind(code, title, description, price, JSON.stringify(images), JSON.stringify(sizes), now, id).run();
    } else {
      await env.DB.prepare('INSERT INTO products (id, code, title, description, price, images_json, sizes_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, code, title, description, price, JSON.stringify(images), JSON.stringify(sizes), now, now).run();
    }
    const row = await env.DB.prepare('SELECT id, code, title, description, price, images_json, sizes_json, created_at, updated_at FROM products WHERE id = ?').bind(id).first();
    let warning = '';
    try { await syncProductsJson(env, env.DB); }
    catch (error) { warning = `تم حفظ المنتج في قاعدة البيانات، لكن لم يتم تحديث نسخة JSON في GitHub. التفاصيل: ${String(error.message || '').slice(0, 180)}`; }
    return Response.json({ ok: true, product: productRow(row), warning, github: { owner, repo, branch } }, { status: 200 });
  } catch (error) {
    const message = String(error.message || 'تعذر حفظ المنتج.').slice(0, 400);
    const status = /GitHub secret|Set GITHUB|GITHUB_OWNER|GITHUB_REPO/i.test(message) ? 503 : 502;
    return fail(message, status);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return fail('انتهت الجلسة. سجل الدخول مرة أخرى.', 401);
  if (!sameOrigin(request)) return fail('طلب غير مسموح.', 403);
  let body;
  try { body = await request.json(); } catch { return fail('معرّف المنتج غير صحيح.'); }
  const id = clean(body.id, 80);
  if (!id) return fail('معرّف المنتج مطلوب.');
  const exists = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (!exists) return fail('المنتج غير موجود.', 404);
  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  let warning = '';
  try { await syncProductsJson(env, env.DB); }
  catch (error) { warning = `حُذف المنتج من المتجر، لكن تعذّر تحديث ملف JSON في GitHub: ${String(error.message || '').slice(0, 180)}`; }
  // Product image files are intentionally retained in GitHub to avoid deleting a file still used by another product.
  return Response.json({ ok: true, warning });
}
