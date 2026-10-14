(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const CART_KEY = 'plus90_cart_v1';
  const state = { products: [], cart: readCart(), activeProduct: null, activeImage: 0, selectedSize: '', toastTimer: null };
  const money = (amount) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(amount || 0))} ج.م`;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const placeholderImage = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8f5ff"/><stop offset="1" stop-color="#eae4f5"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="270" r="145" fill="#fff" opacity=".42"/><text x="300" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="92" fill="#9b82e8">P90</text><text x="300" y="365" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" letter-spacing="7" fill="#887c9d">ADD PRODUCT</text></svg>');
  function readCart() { try { const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(parsed) ? parsed.filter(x => x && typeof x.id === 'string' && Number.isFinite(Number(x.quantity))) : []; } catch { return []; } }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch { showToast('المتصفح لم يستطع حفظ السلة. تحقق من إعدادات الخصوصية.'); } renderCart(); }
  function imgFor(product, index = 0) { const images = Array.isArray(product?.images) ? product.images : []; return images[index] || images[0] || placeholderImage; }
  function cartEntries() { const map = new Map(state.products.map(p => [p.id, p])); return state.cart.map(item => ({ ...item, quantity: Math.max(1, Math.min(10, Number(item.quantity) || 1)), product: map.get(item.id) })).filter(item => item.product); }
  function cartCount() { return cartEntries().reduce((sum, item) => sum + item.quantity, 0); }
  function cartTotal() { return cartEntries().reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0); }
  function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); }
  function setNotice(message) { const box = $('#notice'); box.textContent = message; box.hidden = !message; }

  async function loadProducts() {
    try {
      const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('api');
      const body = await response.json();
      state.products = Array.isArray(body.products) ? body.products : [];
      setNotice('');
    } catch {
      try {
        const fallback = await fetch('/data/products.json', { cache: 'no-store' });
        const body = await fallback.json();
        state.products = Array.isArray(body.products) ? body.products : [];
        setNotice('تعذر الاتصال بقاعدة المنتجات مباشرة. قد تكون بعض التعديلات الأخيرة لم تظهر بعد.');
      } catch {
        state.products = [];
        setNotice('المتجر يحتاج إلى إكمال إعداد قاعدة البيانات في Cloudflare قبل عرض المنتجات. راجع ملف README_AR.md.');
      }
    }
    renderProducts(); renderCart();
  }

  function sortedFilteredProducts() {
    const term = ($('#searchInput').value || '').trim().toLocaleLowerCase('ar');
    let result = state.products.filter(p => !term || String(p.title || '').toLocaleLowerCase('ar').includes(term) || String(p.code || '').toLocaleLowerCase('ar').includes(term));
    const sort = $('#sortSelect').value;
    if (sort === 'price-low') result.sort((a,b) => Number(a.price) - Number(b.price));
    else if (sort === 'price-high') result.sort((a,b) => Number(b.price) - Number(a.price));
    else if (sort === 'title') result.sort((a,b) => String(a.title).localeCompare(String(b.title), 'ar'));
    else result.sort((a,b) => String(b.createdAt || b.created_at || '').localeCompare(String(a.createdAt || a.created_at || '')));
    return result;
  }
  function renderProducts() {
    const grid = $('#productGrid'); const products = sortedFilteredProducts();
    $('#productsCount').textContent = `${products.length} منتج`;
    if (!state.products.length) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">✳</div><strong>لسه بنجهز التشكيلة</strong><p>المنتجات هتظهر هنا أول ما تضيفها من لوحة التحكم.</p></div>`;
      return;
    }
    if (!products.length) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⌕</div><strong>مفيش نتيجة مطابقة</strong><p>جرّب تكتب جزءًا من اسم الحذاء أو الكود الخاص به.</p></div>`;
      return;
    }
    grid.innerHTML = products.map(p => `<article class="product-card" data-product-card="${esc(p.id)}">
      <div class="product-visual" data-open-product="${esc(p.id)}" tabindex="0" role="button" aria-label="عرض ${esc(p.title)}">
        <img src="${esc(imgFor(p))}" alt="${esc(p.title)}" loading="lazy" onerror="this.onerror=null;this.src='${placeholderImage}'">
        <span class="quick-code">${esc(p.code)}</span>
        <button class="quick-add" type="button" data-quick-add="${esc(p.id)}" aria-label="إضافة ${esc(p.title)} للسلة">+</button>
      </div>
      <div class="product-content"><div class="product-topline"><span class="product-category">P90 / COLLECTION</span></div><h3 class="product-name" data-open-product="${esc(p.id)}">${esc(p.title)}</h3><div class="product-bottom"><div class="product-price">${money(p.price)}</div><button class="view-product" type="button" data-open-product="${esc(p.id)}">التفاصيل ↗</button></div></div>
    </article>`).join('');
  }

  function renderCart() {
    const entries = cartEntries(); const count = entries.reduce((sum, item) => sum + item.quantity, 0);
    $('#cartCount').textContent = count; $('#drawerCount').textContent = `(${count})`;
    $('#cartTotal').textContent = money(cartTotal()); $('#checkoutTotal').textContent = money(cartTotal());
    const host = $('#cartItems');
    if (!entries.length) { host.innerHTML = '<div class="cart-empty"><b>سلتك لسه فاضية</b><span>اختار الحذاء اللي يعجبك وهنحفظه هنا.</span></div>'; $('#goCheckout').disabled = true; $('#goCheckout').style.opacity = '.55'; return; }
    $('#goCheckout').disabled = false; $('#goCheckout').style.opacity = '1';
    host.innerHTML = entries.map(item => `<div class="cart-item"><img src="${esc(imgFor(item.product))}" alt="${esc(item.product.title)}" onerror="this.onerror=null;this.src='${placeholderImage}'"><div><div class="cart-item-title">${esc(item.product.title)}</div><div class="cart-item-code">${esc(item.product.code)}${item.size ? ` · مقاس ${esc(item.size)}` : ''}</div><div class="cart-item-price">${money(Number(item.product.price) * item.quantity)}</div><div class="cart-item-actions"><div class="mini-qty"><button type="button" data-cart-change="-1" data-cart-key="${esc(cartKey(item))}" aria-label="تقليل">−</button><span>${item.quantity}</span><button type="button" data-cart-change="1" data-cart-key="${esc(cartKey(item))}" aria-label="زيادة">+</button></div><button type="button" class="remove-item" data-remove-cart="${esc(cartKey(item))}">حذف</button></div></div></div>`).join('');
  }
  function cartKey(item) { return `${item.id}::${item.size || ''}`; }
  function addToCart(product, quantity = 1, size = '') {
    const key = `${product.id}::${size}`; const current = state.cart.find(item => `${item.id}::${item.size || ''}` === key);
    if (current) current.quantity = Math.min(10, Number(current.quantity) + quantity); else state.cart.push({ id: product.id, quantity: Math.min(10, quantity), size });
    saveCart(); showToast('اتضاف للسلة بنجاح ✦');
  }
  function changeCart(key, delta) { const item = state.cart.find(x => cartKey(x) === key); if (!item) return; item.quantity = Number(item.quantity) + delta; if (item.quantity <= 0) state.cart = state.cart.filter(x => x !== item); else item.quantity = Math.min(10, item.quantity); saveCart(); }
  function removeCart(key) { state.cart = state.cart.filter(x => cartKey(x) !== key); saveCart(); }
  function openCart() { $('#overlay').hidden = false; requestAnimationFrame(() => $('#overlay').classList.add('visible')); $('#cartDrawer').classList.add('open'); $('#cartDrawer').setAttribute('aria-hidden','false'); document.body.classList.add('lock-scroll'); }
  function closeCart() { $('#cartDrawer').classList.remove('open'); $('#cartDrawer').setAttribute('aria-hidden','true'); $('#overlay').hidden = true; document.body.classList.remove('lock-scroll'); }
  function openProduct(id) {
    const p = state.products.find(x => x.id === id); if (!p) return;
    state.activeProduct = p; state.activeImage = 0; state.selectedSize = Array.isArray(p.sizes) && p.sizes.length ? String(p.sizes[0]) : '';
    $('#modalTitle').textContent = p.title; $('#modalCode').textContent = `CODE / ${p.code}`; $('#modalPrice').textContent = money(p.price); $('#modalDescription').textContent = p.description || 'اختيار مميز من P90 SHOP.'; $('#modalQty').value = '1';
    updateModalImage();
    const sizeWrap = $('#sizePickerWrap'); sizeWrap.hidden = !(Array.isArray(p.sizes) && p.sizes.length);
    $('#sizePicker').innerHTML = (p.sizes || []).map(size => `<button type="button" data-size="${esc(size)}" class="${String(size) === state.selectedSize ? 'selected' : ''}">${esc(size)}</button>`).join('');
    $('#productModal').hidden = false; document.body.classList.add('lock-scroll');
  }
  function updateModalImage() {
    const p = state.activeProduct; if (!p) return; const images = Array.isArray(p.images) && p.images.length ? p.images : [placeholderImage];
    state.activeImage = Math.max(0, Math.min(state.activeImage, images.length - 1)); $('#modalImage').src = images[state.activeImage]; $('#modalImage').alt = p.title; $('#modalImageIndex').textContent = `${state.activeImage + 1} / ${images.length}`;
    $('#modalThumbs').innerHTML = images.length > 1 ? images.map((src,i) => `<button type="button" data-image-index="${i}" class="${i === state.activeImage ? 'active' : ''}" aria-label="الصورة ${i+1}"><img src="${esc(src)}" alt="" onerror="this.onerror=null;this.src='${placeholderImage}'"></button>`).join('') : '';
  }
  function closeProduct() { $('#productModal').hidden = true; if ($('#checkoutModal').hidden && !$('#cartDrawer').classList.contains('open')) document.body.classList.remove('lock-scroll'); }
  function openCheckout() { if (!cartEntries().length) { showToast('السلة فاضية، اختار منتج الأول.'); return; } closeCart(); $('#checkoutError').hidden = true; $('#checkoutModal').hidden = false; document.body.classList.add('lock-scroll'); setTimeout(() => $('#customerName').focus(), 80); }
  function closeCheckout() { $('#checkoutModal').hidden = true; if ($('#productModal').hidden && !$('#cartDrawer').classList.contains('open')) document.body.classList.remove('lock-scroll'); }

  $('#searchInput').addEventListener('input', renderProducts); $('#sortSelect').addEventListener('change', renderProducts);
  $('#openCart').addEventListener('click', openCart); $('#closeCart').addEventListener('click', closeCart); $('#overlay').addEventListener('click', closeCart);
  $('#productGrid').addEventListener('click', (event) => {
    const quick = event.target.closest('[data-quick-add]'); if (quick) { event.stopPropagation(); const p = state.products.find(x => x.id === quick.dataset.quickAdd); if (!p) return; if (Array.isArray(p.sizes) && p.sizes.length) openProduct(p.id); else addToCart(p, 1); return; }
    const opener = event.target.closest('[data-open-product]'); if (opener) openProduct(opener.dataset.openProduct);
  });
  $('#productGrid').addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open-product][role="button"]')) { event.preventDefault(); openProduct(event.target.dataset.openProduct); } });
  $('#cartItems').addEventListener('click', event => { const change = event.target.closest('[data-cart-change]'); if (change) { changeCart(change.dataset.cartKey, Number(change.dataset.cartChange)); return; } const remove = event.target.closest('[data-remove-cart]'); if (remove) removeCart(remove.dataset.removeCart); });
  $('#productModal').addEventListener('click', event => { if (event.target.closest('[data-close-modal]')) { closeProduct(); return; } const sizeButton = event.target.closest('[data-size]'); if (sizeButton) { state.selectedSize = sizeButton.dataset.size; $('#sizePicker').querySelectorAll('button').forEach(button => button.classList.toggle('selected', button === sizeButton)); return; } const thumb = event.target.closest('[data-image-index]'); if (thumb) { state.activeImage = Number(thumb.dataset.imageIndex); updateModalImage(); } });
  $('#qtyMinus').addEventListener('click', () => $('#modalQty').value = String(Math.max(1, (Number($('#modalQty').value) || 1) - 1)));
  $('#qtyPlus').addEventListener('click', () => $('#modalQty').value = String(Math.min(10, (Number($('#modalQty').value) || 1) + 1)));
  $('#modalQty').addEventListener('change', () => $('#modalQty').value = String(Math.max(1, Math.min(10, Number($('#modalQty').value) || 1))));
  $('#addFromModal').addEventListener('click', () => { if (!state.activeProduct) return; if (state.activeProduct.sizes?.length && !state.selectedSize) { showToast('اختار المقاس الأول.'); return; } addToCart(state.activeProduct, Number($('#modalQty').value) || 1, state.selectedSize); closeProduct(); });
  $('#goCheckout').addEventListener('click', openCheckout);
  $('#checkoutModal').addEventListener('click', event => { if (event.target.closest('[data-close-checkout]')) closeCheckout(); });
  $('#checkoutForm').addEventListener('submit', async event => {
    event.preventDefault(); const error = $('#checkoutError'); error.hidden = true;
    const name = $('#customerName').value.trim(); const phone = $('#customerPhone').value.trim(); const email = $('#customerEmail').value.trim(); const entries = cartEntries();
    if (name.length < 2) { error.textContent = 'اكتب الاسم بالكامل.'; error.hidden = false; $('#customerName').focus(); return; }
    if (phone.replace(/\D/g,'').length < 8) { error.textContent = 'اكتب رقم هاتف صحيحًا للتواصل معاك.'; error.hidden = false; $('#customerPhone').focus(); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error.textContent = 'راجع البريد الإلكتروني أو اتركه فارغًا.'; error.hidden = false; $('#customerEmail').focus(); return; }
    if (!entries.length) { error.textContent = 'السلة فاضية. أضف منتجًا قبل إتمام الطلب.'; error.hidden = false; return; }
    const button = $('#submitOrder'); button.disabled = true; button.innerHTML = '<span class="loader" aria-hidden="true"></span> جاري تسجيل الطلب…';
    try {
      const response = await fetch('/api/orders', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify({ name, phone, email, items:entries.map(item => ({ id:item.id, quantity:item.quantity, size:item.size || '' })) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'لم نتمكن من تسجيل الطلب. حاول مرة أخرى.');
      state.cart = []; saveCart(); closeCheckout();
      if (body.whatsappUrl) { window.location.href = body.whatsappUrl; } else { showToast(`تم تسجيل طلبك بالكود ${body.orderCode}`); }
    } catch (err) { error.textContent = err.message || 'حدث خطأ أثناء تسجيل الطلب. حاول مجددًا.'; error.hidden = false; }
    finally { button.disabled = false; button.innerHTML = '<svg class="whatsapp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.8a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.3-4.9a8.4 8.4 0 1 1 16.2-3.8Z"></path><path d="M8.4 7.7c.2-.4.4-.4.7-.4h.4c.2 0 .3.1.4.4l.8 1.8c.1.2.1.4 0 .5l-.5.6c-.2.2-.2.4 0 .6.7 1.2 1.5 1.9 2.7 2.5.2.1.4.1.6-.1l.8-.9c.2-.2.4-.2.6-.1l1.7.8c.3.1.4.3.4.5s-.1 1-.7 1.4c-.5.4-1.1.6-1.8.5-1.1-.1-2.7-.8-4.2-2.2-1.4-1.3-2.3-2.9-2.5-4-.1-.7.2-1.4.6-1.9Z"></path></svg>تسجيل الطلب والانتقال لواتساب <span>↗</span>'; }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeProduct(); closeCheckout(); closeCart(); } });
  $('#yearNow').textContent = String(new Date().getFullYear());
  loadProducts();
})();
