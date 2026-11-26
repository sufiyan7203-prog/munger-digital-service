const STATUS_LABEL = {
  new: 'Naya',
  preparing: 'Ban raha',
  served: 'Served',
  paid: 'Paid',
  cancelled: 'Cancelled'
};

const ACTION_LABEL = {
  preparing: 'Banana shuru',
  served: 'Serve ho gaya',
  paid: 'Payment mila',
  cancelled: 'Cancel',
  new: 'Reopen'
};

const state = {
  pin: sessionStorage.getItem('mds.ownerPin') || '',
  currency: '₹',
  filter: 'active',
  tab: 'orders',
  orders: [],
  stats: null,
  menu: [],
  timer: null
};

const $ = (id) => document.getElementById(id);

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2400);
}

function money(value) {
  return `${state.currency}${Number(value || 0).toLocaleString('en-IN')}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-owner-pin': state.pin, ...(options.headers || {}) }
  });
  if (res.status === 401) {
    lock('Session khatam. PIN dobara daalein.');
    throw new Error('PIN galat hai.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request fail hui.');
  return data;
}

/* --------------------------------- gate ---------------------------------- */

function lock(message) {
  state.pin = '';
  sessionStorage.removeItem('mds.ownerPin');
  stopRefresh();
  $('dash').classList.add('hidden');
  $('gate').classList.remove('hidden');
  if (message) {
    $('gateErr').textContent = message;
    $('gateErr').classList.remove('hidden');
  }
}

async function unlock() {
  const pin = $('pin').value.trim();
  if (!pin) return;
  $('gateErr').classList.add('hidden');
  $('unlock').disabled = true;
  try {
    const res = await fetch('/api/owner/session', { headers: { 'x-owner-pin': pin } });
    if (!res.ok) throw new Error('Galat PIN. Dobara try karein.');
    const data = await res.json();
    state.pin = pin;
    sessionStorage.setItem('mds.ownerPin', pin);
    state.currency = data.settings?.currency || '₹';
    $('ownerMeta').textContent = `${data.settings?.restaurantName || 'Restaurant'} · ${data.settings?.tables || 0} tables`;
    $('gate').classList.add('hidden');
    $('dash').classList.remove('hidden');
    $('pin').value = '';
    await Promise.all([loadStats(), loadOrders(), loadMenu(), loadQr()]);
    startRefresh();
  } catch (err) {
    $('gateErr').textContent = err.message;
    $('gateErr').classList.remove('hidden');
  } finally {
    $('unlock').disabled = false;
  }
}

function startRefresh() {
  stopRefresh();
  state.timer = setInterval(async () => {
    try {
      await Promise.all([loadStats(), loadOrders()]);
    } catch (err) {
      /* 401 gate already handled */
    }
  }, 6000);
}

function stopRefresh() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

/* --------------------------------- stats --------------------------------- */

async function loadStats() {
  const stats = await api('/api/owner/stats');
  state.stats = stats;
  state.currency = stats.currency || state.currency;
  $('stats').innerHTML = [
    ['Aaj ke orders', stats.ordersToday],
    ['Active orders', stats.activeOrders],
    ['Aaj ki sale', money(stats.revenue)],
    ['Collected', money(stats.collected)],
    ['Avg order', money(stats.avgOrderValue)]
  ].map(([label, value]) => `<div class="stat"><div class="k">${label}</div><div class="v">${value}</div></div>`).join('');
}

/* --------------------------------- orders -------------------------------- */

async function loadOrders() {
  const { orders } = await api('/api/owner/orders?today=1');
  state.orders = orders;
  renderOrders();
}

function visibleOrders() {
  if (state.filter === 'active') {
    return state.orders.filter((order) => ['new', 'preparing', 'served'].includes(order.status));
  }
  if (state.filter === 'all') return state.orders;
  return state.orders.filter((order) => order.status === state.filter);
}

function renderOrders() {
  const orders = visibleOrders();
  $('orderEmpty').classList.toggle('hidden', orders.length > 0);
  $('orderList').innerHTML = orders.map((order) => {
    const time = new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const actions = (order.canMoveTo || []).map((status) => {
      const cls = status === 'cancelled' ? 'danger' : status === 'paid' || status === 'served' ? 'ok' : status === 'preparing' ? 'warn' : 'ghost';
      return `<button class="btn small ${cls}" type="button" data-move="${order.id}" data-status="${status}">${ACTION_LABEL[status] || status}</button>`;
    }).join('');
    return `
      <article class="card order-card">
        <div class="order-top">
          <span class="tbl">Table ${escapeHtml(order.table)} · #${escapeHtml(order.code)}</span>
          <span class="badge-status ${order.status}">${STATUS_LABEL[order.status] || order.status}</span>
        </div>
        <div class="order-meta">${escapeHtml(order.name)}${order.phone ? ` · ${escapeHtml(order.phone)}` : ''} · ${time}</div>
        <div class="order-items">
          ${order.items.map((line) => `${escapeHtml(line.name)} × ${line.qty}`).join('<br>')}
        </div>
        ${order.note ? `<p class="hint">📝 ${escapeHtml(order.note)}</p>` : ''}
        <div class="order-top" style="margin-top:8px">
          <span class="order-total">${money(order.total)}</span>
        </div>
        <div class="order-actions">${actions}</div>
      </article>`;
  }).join('');

  $('orderList').querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => moveOrder(btn.dataset.move, btn.dataset.status, btn));
  });
}

async function moveOrder(id, status, btn) {
  btn.disabled = true;
  try {
    await api(`/api/owner/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    toast(`Order ${STATUS_LABEL[status] || status}`);
    await Promise.all([loadOrders(), loadStats()]);
  } catch (err) {
    toast(err.message);
    btn.disabled = false;
  }
}

/* ---------------------------------- menu --------------------------------- */

async function loadMenu() {
  const { items } = await api('/api/menu');
  state.menu = items;
  const cats = [...new Set(items.map((item) => item.category))];
  $('catList').innerHTML = cats.map((cat) => `<option value="${escapeHtml(cat)}"></option>`).join('');
  $('menuRows').innerHTML = items.map((item) => `
    <div class="menu-row">
      <div>
        <div class="nm">${item.emoji || ''} ${escapeHtml(item.name)} ${item.available ? '' : '<span class="badge-status cancelled">Off</span>'}</div>
        <div class="sub">${escapeHtml(item.category)} · ${money(item.price)}</div>
      </div>
      <div class="actions">
        <button class="btn small ghost" type="button" data-toggle="${item.id}">${item.available ? 'Off karein' : 'On karein'}</button>
        <button class="btn small" type="button" data-price="${item.id}">Price</button>
      </div>
    </div>`).join('');

  $('menuRows').querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = state.menu.find((row) => row.id === btn.dataset.toggle);
      btn.disabled = true;
      try {
        await api(`/api/owner/menu/${item.id}`, { method: 'PATCH', body: JSON.stringify({ available: !item.available }) });
        await loadMenu();
        toast(`${item.name} ${item.available ? 'off' : 'on'} ho gaya`);
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
    });
  });

  $('menuRows').querySelectorAll('[data-price]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = state.menu.find((row) => row.id === btn.dataset.price);
      const input = prompt(`${item.name} ka naya price (₹)`, String(item.price));
      if (input === null) return;
      try {
        await api(`/api/owner/menu/${item.id}`, { method: 'PATCH', body: JSON.stringify({ price: Number(input) }) });
        await loadMenu();
        toast('Price update ho gaya');
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

async function addDish() {
  const hint = $('menuHint');
  hint.classList.remove('error');
  const payload = {
    name: $('newName').value.trim(),
    price: Number($('newPrice').value),
    category: $('newCategory').value.trim() || 'Main Course',
    emoji: $('newEmoji').value.trim() || '🍽️'
  };
  if (!payload.name) {
    hint.textContent = 'Dish ka naam likhein.';
    hint.classList.add('error');
    return;
  }
  if (!Number.isFinite(payload.price) || payload.price < 1) {
    hint.textContent = 'Sahi price likhein.';
    hint.classList.add('error');
    return;
  }
  $('addDish').disabled = true;
  try {
    await api('/api/owner/menu', { method: 'POST', body: JSON.stringify(payload) });
    $('newName').value = '';
    $('newPrice').value = '';
    $('newEmoji').value = '';
    hint.textContent = `${payload.name} menu me add ho gaya.`;
    await loadMenu();
    toast('Dish add ho gaya');
  } catch (err) {
    hint.textContent = err.message;
    hint.classList.add('error');
  } finally {
    $('addDish').disabled = false;
  }
}

/* ----------------------------------- QR ---------------------------------- */

async function loadQr() {
  const { tables } = await api('/api/owner/tables');
  $('qrGrid').innerHTML = tables.map((row) => `
    <div class="qr-card">
      <img src="/api/qr/${encodeURIComponent(row.table)}.svg" alt="Table ${escapeHtml(row.table)} QR" loading="lazy">
      <div class="tbl-label">Table ${escapeHtml(row.table)}</div>
      <div class="link">${escapeHtml(row.url)}</div>
    </div>`).join('');
}

/* --------------------------------- wiring -------------------------------- */

$('unlock').addEventListener('click', unlock);
$('pin').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') unlock();
});
$('addDish').addEventListener('click', addDish);
$('printQr').addEventListener('click', () => window.print());

$('tabs').querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    $('tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    ['orders', 'menu', 'qr'].forEach((tab) => $('tab-' + tab).classList.toggle('hidden', tab !== state.tab));
  });
});

$('filters').querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    $('filters').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    renderOrders();
  });
});

if (state.pin) {
  $('pin').value = state.pin;
  unlock();
}
