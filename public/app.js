const STATUS_STEPS = [
  { key: 'new', label: 'Order mil gaya', note: 'Restaurant ne order accept kar liya hai.' },
  { key: 'preparing', label: 'Kitchen me ban raha hai', note: 'Aapka khana taiyaar ho raha hai.' },
  { key: 'served', label: 'Serve ho gaya', note: 'Table par khana pahunch gaya.' },
  { key: 'paid', label: 'Bill paid', note: 'Dhanyavaad! Dobara aayein.' }
];

const state = {
  currency: '₹',
  tables: 12,
  items: [],
  categories: [],
  table: '',
  cart: {},
  category: 'All',
  search: '',
  activeOrder: null,
  pollTimer: null
};

const $ = (id) => document.getElementById(id);

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function money(value) {
  return `${state.currency}${Number(value || 0).toLocaleString('en-IN')}`;
}

function itemById(id) {
  return state.items.find((item) => item.id === id);
}

/* ------------------------------- bootstrap ------------------------------- */

async function boot() {
  const params = new URLSearchParams(location.search);
  const qrTable = params.get('table');
  if (qrTable) {
    state.table = qrTable.trim();
    localStorage.setItem('mds.table', state.table);
  } else {
    state.table = localStorage.getItem('mds.table') || '';
  }

  state.cart = JSON.parse(localStorage.getItem('mds.cart') || '{}');
  $('custName').value = localStorage.getItem('mds.name') || '';

  await loadMenu();
  renderTable();
  renderCats();
  renderMenu();
  renderCart();

  const lastCode = localStorage.getItem('mds.lastOrder');
  if (lastCode && params.get('order') === lastCode) {
    openTrack(lastCode);
  } else if (!state.table) {
    openTableSheet();
  }

  $('search').addEventListener('input', (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderMenu();
  });
  $('tableBtn').addEventListener('click', openTableSheet);
  $('closeTable').addEventListener('click', () => $('tableSheet').classList.add('hidden'));
  $('takeawayBtn').addEventListener('click', () => setTable('Takeaway'));
  $('openCart').addEventListener('click', openCart);
  $('closeCart').addEventListener('click', () => $('cartSheet').classList.add('hidden'));
  $('placeOrder').addEventListener('click', placeOrder);
  $('backToMenu').addEventListener('click', () => {
    $('trackView').classList.add('hidden');
    $('menuView').classList.remove('hidden');
    stopPolling();
  });
  $('cartSheet').addEventListener('click', (event) => {
    if (event.target.id === 'cartSheet') $('cartSheet').classList.add('hidden');
  });
  $('tableSheet').addEventListener('click', (event) => {
    if (event.target.id === 'tableSheet') $('tableSheet').classList.add('hidden');
  });
}

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('menu');
    const data = await res.json();
    state.items = data.items;
    state.categories = data.categories;
    state.currency = data.restaurant?.currency || '₹';
    state.tables = Number(data.restaurant?.tables) || 12;
    $('restName').textContent = data.restaurant?.restaurantName || 'Munger Digital Services';
    $('tagline').textContent = data.restaurant?.tagline || 'Restaurant QR Ordering';
    const available = data.items.filter((item) => item.available).length;
    $('menuMeta').textContent = `${available} dishes available`;
  } catch (err) {
    $('menuMeta').textContent = 'Menu load nahi hua. Page refresh karein.';
  }
}

/* --------------------------------- render -------------------------------- */

function renderTable() {
  $('tableBtn').textContent = state.table ? `Table ${state.table}` : 'Table chunein';
}

function openTableSheet() {
  const grid = $('tableGrid');
  grid.innerHTML = Array.from({ length: state.tables }, (_, i) => {
    const label = String(i + 1).padStart(2, '0');
    return `<button type="button" data-table="${label}">Table ${label}</button>`;
  }).join('');
  grid.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => setTable(btn.dataset.table));
  });
  $('tableSheet').classList.remove('hidden');
}

function setTable(value) {
  state.table = value;
  localStorage.setItem('mds.table', value);
  renderTable();
  $('tableSheet').classList.add('hidden');
  toast(`Table ${value} set ho gaya`);
}

function renderCats() {
  const cats = ['All', ...state.categories];
  $('cats').innerHTML = cats
    .map((cat) => `<button type="button" data-cat="${cat}" class="${state.category === cat ? 'active' : ''}">${cat === 'All' ? 'Sab kuch' : cat}</button>`)
    .join('');
  $('cats').querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.cat;
      renderCats();
      renderMenu();
    });
  });
}

function renderMenu() {
  const list = state.items.filter((item) => {
    if (state.category !== 'All' && item.category !== state.category) return false;
    if (state.search && !item.name.toLowerCase().includes(state.search)) return false;
    return true;
  });

  $('menuEmpty').classList.toggle('hidden', list.length > 0);
  $('menuList').innerHTML = list.map((item) => {
    const qty = state.cart[item.id] || 0;
    const control = !item.available
      ? '<div class="soldout">Abhi available nahi</div>'
      : qty > 0
        ? `<div class="qty"><button type="button" data-dec="${item.id}" aria-label="Kam karein">−</button><span>${qty}</span><button type="button" data-inc="${item.id}" aria-label="Zyada karein">+</button></div>`
        : `<button class="btn small full add" type="button" data-inc="${item.id}">Add</button>`;
    return `
      <article class="card dish">
        <div class="emoji">${item.emoji || '🍽️'}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="cat">${escapeHtml(item.category)}</div>
        <span class="veg-dot ${item.veg ? '' : 'nonveg'}">${item.veg ? 'Veg' : 'Non-veg'}</span>
        <div class="price">${money(item.price)}</div>
        ${control}
      </article>`;
  }).join('');

  $('menuList').querySelectorAll('[data-inc]').forEach((btn) => {
    btn.addEventListener('click', () => changeQty(btn.dataset.inc, 1));
  });
  $('menuList').querySelectorAll('[data-dec]').forEach((btn) => {
    btn.addEventListener('click', () => changeQty(btn.dataset.dec, -1));
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/* ---------------------------------- cart --------------------------------- */

function changeQty(id, delta) {
  const item = itemById(id);
  if (!item || !item.available) return;
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) delete state.cart[id];
  else state.cart[id] = Math.min(next, 20);
  persistCart();
  renderMenu();
  renderCart();
  if (!$('cartSheet').classList.contains('hidden')) renderCartSheet();
}

function persistCart() {
  localStorage.setItem('mds.cart', JSON.stringify(state.cart));
}

function cartLines() {
  return Object.entries(state.cart)
    .map(([id, qty]) => {
      const item = itemById(id);
      return item ? { item, qty } : null;
    })
    .filter(Boolean);
}

function cartTotals() {
  const lines = cartLines();
  return {
    lines,
    qty: lines.reduce((sum, line) => sum + line.qty, 0),
    total: lines.reduce((sum, line) => sum + line.qty * line.item.price, 0)
  };
}

function renderCart() {
  const { qty, total } = cartTotals();
  $('cartBar').classList.toggle('hidden', qty === 0);
  $('cartQty').textContent = `${qty} item${qty === 1 ? '' : 's'}`;
  $('cartTotal').textContent = money(total);
  $('sheetTotal').textContent = money(total);
}

function openCart() {
  if (cartTotals().qty === 0) {
    toast('Cart khali hai');
    return;
  }
  renderCartSheet();
  $('cartSheet').classList.remove('hidden');
}

function renderCartSheet() {
  const { lines, total } = cartTotals();
  $('cartLines').innerHTML = lines.length
    ? lines.map(({ item, qty }) => `
        <div class="line">
          <div>
            <div class="name">${item.emoji || ''} ${escapeHtml(item.name)}</div>
            <div class="sub">${money(item.price)} × ${qty} = ${money(item.price * qty)}</div>
          </div>
          <div class="qty">
            <button type="button" data-dec="${item.id}">−</button><span>${qty}</span><button type="button" data-inc="${item.id}">+</button>
          </div>
        </div>`).join('')
    : '<p class="empty">Cart khali hai.</p>';
  $('sheetTotal').textContent = money(total);

  $('cartLines').querySelectorAll('[data-inc]').forEach((btn) => {
    btn.addEventListener('click', () => { changeQty(btn.dataset.inc, 1); });
  });
  $('cartLines').querySelectorAll('[data-dec]').forEach((btn) => {
    btn.addEventListener('click', () => { changeQty(btn.dataset.dec, -1); });
  });
}

/* ------------------------------- place order ----------------------------- */

async function placeOrder() {
  const { lines, total } = cartTotals();
  const hint = $('cartHint');
  hint.classList.remove('error');

  if (!lines.length) return toast('Cart khali hai');
  if (!state.table) {
    $('cartSheet').classList.add('hidden');
    openTableSheet();
    return toast('Pehle table select karein');
  }

  const name = $('custName').value.trim();
  if (!name) {
    hint.textContent = 'Naam likhna zaroori hai.';
    hint.classList.add('error');
    return;
  }

  $('placeOrder').disabled = true;
  $('placeOrder').textContent = 'Order bhej rahe hain…';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        table: state.table,
        name,
        phone: $('custPhone').value.trim(),
        note: $('custNote').value.trim(),
        items: lines.map(({ item, qty }) => ({ id: item.id, qty }))
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Order place nahi hua.');

    localStorage.setItem('mds.name', name);
    localStorage.setItem('mds.lastOrder', data.order.code);
    state.cart = {};
    persistCart();
    renderCart();
    renderMenu();
    $('cartSheet').classList.add('hidden');
    toast(`Order #${data.order.code} place ho gaya`);
    openTrack(data.order.code);
  } catch (err) {
    hint.textContent = err.message;
    hint.classList.add('error');
  } finally {
    $('placeOrder').disabled = false;
    $('placeOrder').textContent = 'Order place karein';
  }
}

/* -------------------------------- tracking ------------------------------- */

function openTrack(code) {
  $('menuView').classList.add('hidden');
  $('trackView').classList.remove('hidden');
  state.activeOrder = code;
  $('trackCard').innerHTML = '<p class="muted">Order status load ho raha hai…</p>';
  fetchOrder(code);
  startPolling(code);
}

function startPolling(code) {
  stopPolling();
  state.pollTimer = setInterval(() => fetchOrder(code), 8000);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function fetchOrder(code) {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(code)}`);
    if (!res.ok) throw new Error('Order nahi mila.');
    const { order } = await res.json();
    renderTrack(order);
    if (order.status === 'paid' || order.status === 'cancelled') stopPolling();
  } catch (err) {
    $('trackCard').innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
}

function renderTrack(order) {
  const cancelled = order.status === 'cancelled';
  const activeIndex = STATUS_STEPS.findIndex((step) => step.key === order.status);
  const steps = cancelled
    ? `<li class="current"><span class="dot">✕</span><div><div class="label">Order cancel ho gaya</div><div class="note">Restaurant se baat karein.</div></div></li>`
    : STATUS_STEPS.map((step, index) => {
        const cls = index < activeIndex ? 'done' : index === activeIndex ? 'current' : '';
        return `<li class="${cls}"><span class="dot">${index < activeIndex ? '✓' : index + 1}</span>
          <div><div class="label">${step.label}</div><div class="note">${step.note}</div></div></li>`;
      }).join('');

  const time = new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  $('trackCard').innerHTML = `
    <div class="track-head">
      <div>
        <h2>Table ${escapeHtml(order.table)}</h2>
        <p class="muted">${escapeHtml(order.name)} · ${time}</p>
      </div>
      <span class="code">#${escapeHtml(order.code)}</span>
    </div>
    <ul class="steps">${steps}</ul>
    <div class="summary">
      ${order.items.map((line) => `<div class="line"><span>${escapeHtml(line.name)} × ${line.qty}</span><b>${money(line.price * line.qty)}</b></div>`).join('')}
      <div class="total-row"><span>Total</span><b>${money(order.total)}</b></div>
      ${order.note ? `<p class="hint">Note: ${escapeHtml(order.note)}</p>` : ''}
      <p class="hint">Status khud update hota rehta hai. Page band karne ki zaroorat nahi.</p>
    </div>`;
}

boot();
