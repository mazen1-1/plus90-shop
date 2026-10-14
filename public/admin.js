(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const state = { products: [], orders: [], toastTimer: null, submitting: false };
  const money = value => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value || 0))} ج.م`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const placeholder = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f0ebf8"/><text x="60" y="67" font-family="Arial" font-size="30" text-anchor="middle" font-weight="800" fill="#9b82e8">P90</text></svg>');
  const statusNames = { new:'جديد', confirmed:'مؤكد', completed:'مكتمل', cancelled:'ملغي' };
  function toast(message) { const el = $('#adminToast'); el.textContent = message; el.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 3000); }
  function globalMessage(message, warning = false) { const el = $('#globalMessage'); el.textContent = message; el.classList.toggle('warning', warning); el.hidden = !message; }
  async function api(url, options = {}) {
    const response = await fetch(url, { credentials:'same-origin', ...options, headers: { Accept:'application/json', ...(options.body instanceof FormData ? {} : options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 401) showLoggedOut('انتهت الجلسة. سجّل الدخول مرة أخرى.'); throw new Error(body.error || 'حدث خطأ غير متوقع.'); }
    return body;
  }
  function showLoggedOut(message = '') {
    $('#dashboard').hidden = true; $('#loginPanel').hidden = false; $('#logoutButton').hidden = true;
    if (message) { $('#loginError').textContent = message; $('#loginError').hidden = false; }
  }
  async function boot() {
    $('#loginPanel').hidden = true;
    try { const result = await api('/api/admin/session'); if (result.authenticated) await showDashboard(); else showLoggedOut(); }
    catch (error) { if (/إعدادات دخول الأدمن/.test(error.message)) showLoggedOut(error.message); else showLoggedOut(); }
  }
  async function showDashboard() {
    $('#loginPanel').hidden = true; $('#dashboard').hidden = false; $('#logoutButton').hidden = false;
    await Promise.all([loadProducts(), loadOrders()]); renderStats();
  }
  async function loadProducts() {
    try { const data = await api('/api/admin/products'); state.products = data.products || []; renderProductList(); renderStats(); }
    catch (error) { globalMessage(error.message, true); }
  }
  async function loadOrders() {
    try { const data = await api('/api/admin/orders'); state.orders = data.orders || []; renderOrders(); renderStats(); }
    catch (error) { globalMessage(error.message, true); }
  }
  function renderStats() {
    $('#statProducts').textContent = state.products.length;
    $('#statNewOrders').textContent = state.orders.filter(order => order.status === 'new').length;
    $('#statOrders').textContent = state.orders.length;
    $('#tabProductCount').textContent = state.products.length;
    $('#tabOrderCount').textContent = state.orders.length;
    $('#sideProductCount').textContent = `${state.products.length} ITEMS`;
  }
  function renderProductList() {
    const term = ($('#adminProductSearch').value || '').trim().toLocaleLowerCase('ar');
    const products = state.products.filter(p => !term || `${p.title} ${p.code}`.toLocaleLowerCase('ar').includes(term));
    const host = $('#adminProductList');
    if (!products.length) { host.innerHTML = `<div class="side-empty">${state.products.length ? 'لا توجد نتيجة مطابقة.' : 'لا توجد منتجات بعد.'}</div>`; renderStats(); return; }
    host.innerHTML = products.map(p => `<article class="admin-product-row"><img src="${esc(p.images?.[0] || placeholder)}" alt="" onerror="this.onerror=null;this.src='${placeholder}'"><div><h3>${esc(p.title)}</h3><p>${esc(p.code)}</p><strong>${money(p.price)}</strong></div><div class="row-actions"><button type="button" data-edit-product="${esc(p.id)}">تعديل</button><button type="button" class="delete" data-delete-product="${esc(p.id)}">حذف</button></div></article>`).join('');
    renderStats();
  }
  function statusClass(status) { return ({new:'status-new',confirmed:'status-confirmed',completed:'status-completed',cancelled:'status-cancelled'})[status] || 'status-new'; }
  function renderOrders() {
    const term = ($('#orderSearch').value || '').trim().toLocaleLowerCase('ar');
    const selected = $('#orderStatusFilter').value;
    const orders = state.orders.filter(o => (selected === 'all' || o.status === selected) && (!term || `${o.orderCode} ${o.name} ${o.phone} ${o.email}`.toLocaleLowerCase('ar').includes(term)));
    const host = $('#ordersList');
    if (!orders.length) { host.innerHTML = `<div class="order-empty">${state.orders.length ? 'لا توجد طلبات تطابق البحث.' : 'لا توجد طلبات حتى الآن.'}</div>`; return; }
    host.innerHTML = orders.map(order => {
      const rows = (order.items || []).map(item => `<tr><td>${esc(item.title)}<small style="display:block;color:#a198af">${esc(item.code)}${item.size ? ` · المقاس ${esc(item.size)}` : ''}</small></td><td>${Number(item.quantity || 0)}</td><td>${money(item.price)}</td><td>${money(item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 0))}</td></tr>`).join('');
      const date = order.createdAt ? new Date(order.createdAt).toLocaleString('ar-EG', { dateStyle:'medium', timeStyle:'short' }) : '—';
      return `<article class="order-card" data-order-card="${order.id}"><div class="order-summary"><div><div class="order-code">${esc(order.orderCode || `#${order.id}`)}</div><span class="order-date">${esc(date)}</span></div><div class="order-person"><strong>${esc(order.name)}</strong><small>${esc(order.phone)}</small></div><div class="order-total">${money(order.total)}</div><span class="status-pill ${statusClass(order.status)}">${statusNames[order.status] || esc(order.status)}</span><button class="order-open" type="button" data-toggle-order="${order.id}">التفاصيل ↓</button></div><div class="order-details"><div class="details-grid"><div class="detail-box"><span>اسم العميل</span><strong>${esc(order.name)}</strong></div><div class="detail-box"><span>رقم الهاتف</span><strong dir="ltr">${esc(order.phone)}</strong></div><div class="detail-box"><span>البريد الإلكتروني</span><strong dir="ltr">${esc(order.email || 'لم يُضف')}</strong></div></div><div style="overflow-x:auto"><table class="order-items-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3"><strong>إجمالي الطلب</strong></td><td><strong>${money(order.total)}</strong></td></tr></tfoot></table></div><div class="order-status-actions"><label for="status-${order.id}">حالة الطلب</label><select id="status-${order.id}" data-status-select="${order.id}">${Object.entries(statusNames).map(([value,label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select><button type="button" data-save-status="${order.id}">حفظ الحالة</button><span class="save-state" id="save-state-${order.id}"></span></div></div></article>`;
    }).join('');
  }
  function resetProductForm() {
    $('#productForm').reset(); $('#productId').value = ''; $('#productFormHeading').textContent = 'إضافة منتج جديد'; $('#existingImagesArea').hidden = true; $('#existingImages').innerHTML = ''; $('#newImagePreview').innerHTML = ''; $('#productFormError').hidden = true; $('#saveProductButton').disabled = false; $('#saveProductButton').innerHTML = 'نشر التعديلات <span>↗</span>';
  }
  function editProduct(id) {
    const p = state.products.find(item => item.id === id); if (!p) return;
    resetProductForm(); $('#productId').value = p.id; $('#productTitle').value = p.title; $('#productCode').value = p.code; $('#productPrice').value = p.price; $('#productDescription').value = p.description || ''; $('#productSizes').value = (p.sizes || []).join(', '); $('#productFormHeading').textContent = 'تعديل المنتج';
    $('#existingImagesArea').hidden = false;
    $('#existingImages').innerHTML = (p.images || []).map((src, i) => `<label class="keep-image" title="${esc(`الصورة ${i+1}`)}"><img src="${esc(src)}" alt="" onerror="this.onerror=null;this.src='${placeholder}'"><input type="checkbox" name="keepImage" value="${esc(src)}" checked aria-label="الإبقاء على الصورة ${i+1}"></label>`).join('');
    $('#productForm').scrollIntoView({ behavior:'smooth', block:'start' });
  }
  function showPreviews() {
    const files = [...$('#productImages').files];
    $('#newImagePreview').innerHTML = files.map((file, i) => `<div class="preview-image"><img alt="معاينة ${i+1}" src="${URL.createObjectURL(file)}"><span>جديدة</span></div>`).join('');
    const oldKept = $('#existingImages').querySelectorAll('input[name="keepImage"]:checked').length;
    if (oldKept + files.length > 6) { $('#productFormError').textContent = 'إجمالي الصور الحالية والجديدة يجب ألا يتجاوز 6 صور.'; $('#productFormError').hidden = false; }
    else $('#productFormError').hidden = true;
  }
  async function saveProduct(event) {
    event.preventDefault(); if (state.submitting) return;
    const title = $('#productTitle').value.trim(); const price = Number($('#productPrice').value); const error = $('#productFormError'); error.hidden = true;
    const files = [...$('#productImages').files]; const keep = [...$('#existingImages').querySelectorAll('input[name="keepImage"]:checked')].map(input => input.value);
    if (title.length < 2) { error.textContent = 'اكتب اسم المنتج.'; error.hidden = false; return; }
    if (!Number.isFinite(price) || price <= 0) { error.textContent = 'اكتب سعرًا صحيحًا.'; error.hidden = false; return; }
    if (keep.length + files.length < 1) { error.textContent = 'ارفع صورة واحدة على الأقل.'; error.hidden = false; return; }
    if (keep.length + files.length > 6) { error.textContent = 'إجمالي الصور يجب ألا يتجاوز 6 صور.'; error.hidden = false; return; }
    for (const file of files) { if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) { error.textContent = `صيغة الصورة ${file.name} غير مدعومة.`; error.hidden = false; return; } if (file.size > 3 * 1024 * 1024) { error.textContent = `الصورة ${file.name} أكبر من 3 ميجابايت.`; error.hidden = false; return; } }
    const product = { id: $('#productId').value, code: $('#productCode').value.trim(), title, price, description: $('#productDescription').value.trim(), sizes: $('#productSizes').value };
    const form = new FormData(); form.append('product', JSON.stringify(product)); form.append('existingImages', JSON.stringify(keep)); files.forEach(file => form.append('images', file, file.name));
    state.submitting = true; $('#saveProductButton').disabled = true; $('#saveProductButton').innerHTML = '<span class="spinner" aria-hidden="true"></span> جارٍ الحفظ والرفع…';
    try {
      const result = await api('/api/admin/products', { method:'POST', body:form });
      if (result.warning) globalMessage(result.warning, true); else globalMessage('تم حفظ المنتج بنجاح. إذا كان المتجر منشورًا على GitHub فقد يحتاج تحديث النسخة الثابتة قليلًا حتى يكتمل نشر Cloudflare.');
      toast('تم حفظ المنتج بنجاح.'); resetProductForm(); await loadProducts();
    } catch (err) { error.textContent = err.message; error.hidden = false; }
    finally { state.submitting = false; $('#saveProductButton').disabled = false; $('#saveProductButton').innerHTML = 'نشر التعديلات <span>↗</span>'; }
  }
  async function deleteProduct(id) {
    const product = state.products.find(p => p.id === id); if (!product) return;
    if (!window.confirm(`هل تريد حذف المنتج «${product.title}» من المتجر؟\nسيتم إبقاء ملفات الصور داخل GitHub لتجنب حذف صورة مشتركة.`)) return;
    try { const result = await api('/api/admin/products', { method:'DELETE', body:JSON.stringify({ id }) }); if (result.warning) globalMessage(result.warning, true); else globalMessage('تم حذف المنتج من المتجر.'); if ($('#productId').value === id) resetProductForm(); await loadProducts(); toast('تم حذف المنتج.'); }
    catch (error) { globalMessage(error.message, true); }
  }
  async function updateOrderStatus(id) {
    const select = $(`[data-status-select="${id}"]`); const label = $(`#save-state-${id}`); if (!select) return;
    label.textContent = 'جارٍ الحفظ…';
    try { const result = await api('/api/admin/orders', { method:'PATCH', body:JSON.stringify({ id:Number(id), status:select.value }) }); const index = state.orders.findIndex(o => o.id === Number(id)); if (index >= 0) state.orders[index] = result.order; renderOrders(); renderStats(); toast('تم تحديث حالة الطلب.'); }
    catch (error) { label.textContent = error.message; label.style.color = '#b0295a'; }
  }

  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault(); const error = $('#loginError'); error.hidden = true; const button = $('#loginSubmit'); button.disabled = true; button.textContent = 'جارٍ التحقق…';
    try { await api('/api/admin/login', { method:'POST', body:JSON.stringify({ password:$('#adminPassword').value }) }); $('#adminPassword').value = ''; await showDashboard(); }
    catch (err) { error.textContent = err.message; error.hidden = false; }
    finally { button.disabled = false; button.innerHTML = 'دخول لوحة التحكم <span>↗</span>'; }
  });
  $('#logoutButton').addEventListener('click', async () => { try { await api('/api/admin/logout', { method:'POST', body:JSON.stringify({}) }); } catch {} showLoggedOut('تم تسجيل الخروج.'); });
  $('#productForm').addEventListener('submit', saveProduct); $('#resetProductForm').addEventListener('click', resetProductForm); $('#productImages').addEventListener('change', showPreviews);
  $('#adminProductSearch').addEventListener('input', renderProductList); $('#orderSearch').addEventListener('input', renderOrders); $('#orderStatusFilter').addEventListener('change', renderOrders);
  $('#adminProductList').addEventListener('click', event => { const edit = event.target.closest('[data-edit-product]'); if (edit) editProduct(edit.dataset.editProduct); const del = event.target.closest('[data-delete-product]'); if (del) deleteProduct(del.dataset.deleteProduct); });
  $('#ordersList').addEventListener('click', event => { const toggle = event.target.closest('[data-toggle-order]'); if (toggle) { const card = toggle.closest('.order-card'); card.classList.toggle('expanded'); toggle.textContent = card.classList.contains('expanded') ? 'إخفاء التفاصيل ↑' : 'التفاصيل ↓'; } const save = event.target.closest('[data-save-status]'); if (save) updateOrderStatus(save.dataset.saveStatus); });
  $('#refreshButton').addEventListener('click', async () => { globalMessage('جاري تحديث البيانات…'); await Promise.all([loadProducts(),loadOrders()]); globalMessage('تم تحديث البيانات.'); });
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === button)); document.querySelectorAll('.panel').forEach(panel => { const active = panel.id === button.dataset.tab; panel.hidden = !active; panel.classList.toggle('active-panel',active); }); }));
  const dropZone = $('.upload-zone');
  ['dragenter','dragover'].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('dragover'); if (name === 'drop') { const accepted = [...event.dataTransfer.files].filter(file => ['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)); const transfer = new DataTransfer(); accepted.forEach(file => transfer.items.add(file)); $('#productImages').files = transfer.files; showPreviews(); } }));
  boot();
})();
