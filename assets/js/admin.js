/* BroDrive admin panel — talks to the Google Apps Script booking API. */
(() => {
  'use strict';
  const B = window.BRO, inr = window.BroFare.inr;
  const API = B.site.api;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY_NAME = 'bro_admin_key';
  const STATUSES = ['New', 'Confirmed', 'Ongoing', 'Completed', 'Cancelled'];
  const ICONS = ['hatch', 'sedan', 'suv', 'jeep', 'van', 'bike'];

  const state = { key: '', bookings: [], vehicles: [], rules: {}, status: 'New', service: '', q: '', vtype: 'cab', current: null, sheetUrl: '' };

  const store = {
    get() { try { return sessionStorage.getItem(KEY_NAME) || localStorage.getItem(KEY_NAME) || ''; } catch { return ''; } },
    set(k, remember) { try { (remember ? localStorage : sessionStorage).setItem(KEY_NAME, k); } catch { } },
    clear() { try { sessionStorage.removeItem(KEY_NAME); localStorage.removeItem(KEY_NAME); } catch { } }
  };

  async function call(action, data = {}) {
    const r = await fetch(API, { method: 'POST', body: JSON.stringify({ ...data, action, key: state.key }) });
    const j = await r.json();
    if (!j.ok) {
      if (/wrong password/i.test(j.error || '') && action !== 'login') logout();
      throw new Error(j.error || 'Request failed');
    }
    return j;
  }

  function toast(msg, bad) {
    const t = $('[data-toast]');
    t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---------- Views ---------- */
  function show(view) {
    $$('[data-section]').forEach(s => { s.hidden = s.dataset.section !== view; });
    $$('[data-view]').forEach(b => b.toggleAttribute('aria-current', b.dataset.view === view));
    if (view === 'vehicles') loadVehicles();
    if (view === 'rules') loadRules();
    window.scrollTo(0, 0);
  }
  $$('[data-view]').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

  /* ---------- Login ---------- */
  const loginForm = $('[data-login]');
  if (!API) { $('[data-no-api]').hidden = false; $$('input,button', loginForm).forEach(x => x.disabled = true); }
  loginForm.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('[data-login-error]'), btn = $('button[type=submit]', loginForm);
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Checking…';
    state.key = loginForm.key.value;
    try {
      const j = await call('login');
      store.set(state.key, loginForm.remember.checked);
      enter(j);
    } catch (x) { err.textContent = x.message; state.key = ''; }
    btn.disabled = false; btn.textContent = 'Log in';
  });
  function enter(j) {
    state.sheetUrl = j.sheetUrl;
    $('[data-sheet]').href = j.sheetUrl;
    $('.adm-tabs').hidden = false; $('[data-logout]').hidden = false;
    show('bookings'); loadBookings();
    clearInterval(enter._t);
    enter._t = setInterval(() => { if (!document.hidden && !$('[data-section=bookings]').hidden && !$('[data-booking-dialog]').open) loadBookings(true); }, 60000);
  }
  function logout() {
    store.clear(); state.key = ''; clearInterval(enter._t);
    $('.adm-tabs').hidden = true; $('[data-logout]').hidden = true;
    loginForm.reset(); show('login'); document.title = 'BroDrive Admin';
  }
  $('[data-logout]').addEventListener('click', logout);

  /* ---------- Bookings ---------- */
  async function loadBookings(quiet) {
    const btn = $('[data-refresh]');
    if (!quiet) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      const j = await call('bookings');
      state.bookings = j.bookings;
      renderBookings();
      $('[data-updated]').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) + ' · refreshes every minute';
    } catch (x) { if (!quiet) toast(x.message, true); }
    btn.disabled = false; btn.textContent = 'Refresh';
  }
  $('[data-refresh]').addEventListener('click', () => loadBookings());

  const fare = b => Number(b.finalFare) || Number(b.estimate) || 0;
  const whenDate = b => b.when ? new Date(String(b.when).replace(' ', 'T') + ':00+05:30') : null;

  function renderBookings() {
    const all = state.bookings;
    const counts = Object.fromEntries(STATUSES.map(s => [s, all.filter(b => b.status === s).length]));
    const now = new Date(), week = new Date(now.getTime() + 7 * 864e5);
    const ym = now.toISOString().slice(0, 7);
    const upcoming = all.filter(b => ['New', 'Confirmed'].includes(b.status) && (d => d && d >= new Date(now.getTime() - 6 * 36e5) && d <= week)(whenDate(b))).length;
    const month = all.filter(b => String(b.created).startsWith(ym) && b.status !== 'Cancelled');
    $('[data-stats]').innerHTML = [
      ['New – call to confirm', counts.New, 'hot'], ['Upcoming 7 days', upcoming, ''],
      ['Bookings this month', month.length, ''], ['Value this month', inr(month.reduce((t, b) => t + fare(b), 0)), '']
    ].map(([l, v, c]) => `<div class="stat ${c}"><span>${l}</span><b>${v}</b></div>`).join('');
    $('[data-new-count]').textContent = counts.New || '';
    document.title = (counts.New ? `(${counts.New}) ` : '') + 'BroDrive Admin';

    $('[data-status-filter]').innerHTML = [['', 'All', all.length], ...STATUSES.map(s => [s, s, counts[s]])]
      .map(([v, l, n]) => `<button type="button" role="tab" data-st="${v}" aria-selected="${state.status === v}">${l} <span>${n}</span></button>`).join('');

    const q = state.q.toLowerCase();
    const list = all.filter(b => (!state.status || b.status === state.status) && (!state.service || b.service === state.service) &&
      (!q || [b.id, b.name, b.mobile, b.email, b.pickup, b.destination, b.carName, b.vehicleNo, b.driverName].join(' ').toLowerCase().includes(q)));
    $('[data-bookings-empty]').hidden = list.length > 0;
    $('[data-bookings]').innerHTML = list.map(b => `<tr data-id="${esc(b.id)}" tabindex="0">
      <td data-label="Booking"><b>${esc(b.id)}</b><small>${esc(b.created)}</small></td>
      <td data-label="Customer"><b>${esc(b.name)}</b><small>${esc(b.mobile)}</small></td>
      <td data-label="Service">${esc(b.service)}<small>${esc(b.trip)}</small></td>
      <td data-label="Trip / car">${esc(b.pickup)}${b.destination ? ' → ' + esc(b.destination) : ''}<small>${esc(b.carName)}</small></td>
      <td data-label="Pickup time">${esc(b.start)}</td>
      <td data-label="Fare" class="num"><b>${inr(fare(b))}</b><small>${b.finalFare ? 'final' : 'estimate'}</small></td>
      <td data-label="Status"><span class="pill s-${esc(String(b.status).toLowerCase())}">${esc(b.status)}</span></td></tr>`).join('');
  }
  $('[data-status-filter]').addEventListener('click', ev => {
    const b = ev.target.closest('[data-st]'); if (!b) return;
    state.status = b.dataset.st; renderBookings();
  });
  $('[data-service-filter]').addEventListener('change', ev => { state.service = ev.target.value; renderBookings(); });
  $('[data-search]').addEventListener('input', ev => { state.q = ev.target.value.trim(); renderBookings(); });
  const tbody = $('[data-bookings]');
  tbody.addEventListener('click', ev => { const tr = ev.target.closest('tr[data-id]'); if (tr) openBooking(tr.dataset.id); });
  tbody.addEventListener('keydown', ev => { if (ev.key === 'Enter') { const tr = ev.target.closest('tr[data-id]'); if (tr) openBooking(tr.dataset.id); } });

  /* ---------- Booking dialog ---------- */
  const dlg = $('[data-booking-dialog]'), bf = $('[data-booking-form]');
  bf.status.innerHTML = STATUSES.map(s => `<option>${s}</option>`).join('');

  function waText(b) {
    const lines = [`Hi ${b.name}, this is BroDrive. Your booking ${b.id} is ${String(b.status).toLowerCase()}.`, '',
      `${b.service} – ${b.trip}`, `Pickup: ${b.pickup}${b.address ? ', ' + b.address : ''}`];
    if (b.destination) lines.push(`Drop: ${b.destination}`);
    lines.push(`Time: ${b.start}`, `Car: ${b.carName}${b.vehicleNo ? ' – ' + b.vehicleNo : ''}`);
    if (b.driverName) lines.push(`Driver: ${b.driverName}${b.driverPhone ? ' (' + b.driverPhone + ')' : ''}`);
    lines.push(`Fare: ${inr(fare(b))}${b.finalFare ? '' : ' (estimate)'}`);
    return lines.join('\n');
  }

  function openBooking(id) {
    const b = state.bookings.find(x => x.id === id); if (!b) return;
    state.current = b;
    $('[data-b-title]').textContent = b.id;
    $('[data-b-sub]').innerHTML = `Booked ${esc(b.created)} · <span class="pill s-${esc(String(b.status).toLowerCase())}">${esc(b.status)}</span>`;
    $('[data-b-quick]').innerHTML = `<a class="btn btn-primary btn-sm" href="tel:+91${esc(b.mobile)}">Call ${esc(b.name.split(' ')[0])}</a>
      <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/91${esc(b.mobile)}?text=${encodeURIComponent(waText(b))}">WhatsApp details</a>
      ${b.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(b.email)}?subject=${encodeURIComponent('Your BroDrive booking ' + b.id)}">Email</a>` : ''}`;
    const rows = [['Customer', `${b.name}<br>${b.mobile}${b.email ? '<br>' + b.email : ''}`, true], ['Service', b.service], ['Trip', b.trip],
      ['Pickup', b.pickup], ['Address', b.address], ['Drop', b.destination ? `${b.destination}${b.km ? ' (~' + b.km + ' km)' : ''}` : (b.service === 'Self drive' ? b.km : '')],
      ['Pickup time', b.start], ['Return', b.end], ['Car', b.carName], ['Estimate', inr(Number(b.estimate) || 0)],
      ['Fare breakdown', String(b.fareDetail || '').replace(/\n/g, '<br>'), true], ['Customer notes', b.notes]];
    $('[data-b-details]').innerHTML = rows.filter(r => r[1]).map(([k, v, raw]) => `<dt>${k}</dt><dd>${raw ? v.split('<br>').map(esc).join('<br>') : esc(v)}</dd>`).join('');
    ['status', 'vehicleNo', 'finalFare', 'driverName', 'driverPhone', 'adminNotes'].forEach(k => { bf[k].value = b[k] ?? ''; });
    $('[data-save=email]').disabled = !b.email;
    $('[data-save=email]').title = b.email ? '' : 'Customer did not give an email';
    $('[data-b-history]').textContent = b.history || '';
    $('[data-b-error]').textContent = '';
    dlg.showModal();
  }

  $$('[data-save]').forEach(btn => btn.addEventListener('click', async () => {
    const b = state.current; if (!b) return;
    const fields = {};
    ['status', 'vehicleNo', 'finalFare', 'driverName', 'driverPhone', 'adminNotes'].forEach(k => { fields[k] = bf[k].value.trim(); });
    if (fields.finalFare && isNaN(Number(fields.finalFare))) { $('[data-b-error]').textContent = 'Final fare must be a number.'; return; }
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const j = await call('updateBooking', { id: b.id, fields, notify: btn.dataset.save === 'email' });
      Object.assign(b, j.booking);
      renderBookings();
      dlg.close();
      toast(j.emailed ? `Saved and emailed ${b.email}` : 'Booking saved');
    } catch (x) { $('[data-b-error]').textContent = x.message; }
    btn.disabled = btn.dataset.save === 'email' && !b.email; btn.textContent = label;
  }));

  /* ---------- Vehicles ---------- */
  async function loadVehicles() {
    $('[data-vehicles]').innerHTML = '<p class="muted">Loading…</p>';
    try { state.vehicles = (await call('vehicles')).vehicles; renderVehicles(); }
    catch (x) { toast(x.message, true); }
  }
  $$('input[name=vtype]').forEach(r => r.addEventListener('change', () => { state.vtype = r.value; renderVehicles(); }));

  function renderVehicles() {
    const list = state.vehicles.filter(v => v.type === state.vtype).sort((a, b) => a.sort - b.sort);
    $('[data-vehicles]').innerHTML = list.length ? list.map(v => {
      const specs = v.type === 'cab'
        ? [['Per km', inr(v.km)], ['Driver allowance', inr(v.da) + '/day'], ['Transfer', inr(v.transfer)], ['Local 4h / 8h', inr(v.local['4h']) + ' / ' + inr(v.local['8h'])], ['Extra hour', inr(v.hr)]]
        : [['24 hrs', inr(v.day)], ['12 hrs', inr(v.half)], ['Extra km', inr(v.xkm)], ['Deposit', inr(v.dep)], ['Min age', v.age + '+']];
      return `<article class="vcard${v.active ? '' : ' off'}">
        <div class="vtop"><svg viewBox="0 0 120 52" aria-hidden="true"><use href="#car-${esc(v.icon)}"/></svg>
          <span class="pill ${v.active ? 's-confirmed' : 's-cancelled'}">${v.active ? 'Live' : 'Hidden'}</span></div>
        <h3>${esc(v.name)}</h3><p class="muted">${esc(v.models)}${v.seats ? ' · ' + esc(v.seats) + ' seats' : ''}</p>
        <ul class="specs">${specs.map(([k, x]) => `<li>${k} <b>${x}</b></li>`).join('')}</ul>
        <div class="vact"><button type="button" class="btn btn-dark btn-sm" data-edit="${esc(v.id)}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm" data-toggle="${esc(v.id)}">${v.active ? 'Hide' : 'Show'}</button>
          <button type="button" class="btn btn-ghost btn-sm danger" data-del="${esc(v.id)}">Delete</button></div>
      </article>`;
    }).join('') : '<p class="muted">No vehicles yet. Click “Add vehicle”.</p>';
  }

  $('[data-vehicles]').addEventListener('click', async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    const id = t.dataset.edit || t.dataset.toggle || t.dataset.del;
    const v = state.vehicles.find(x => x.type === state.vtype && x.id === id); if (!v) return;
    if (t.dataset.edit) return openVehicle(v);
    if (t.dataset.del) {
      if (!confirm(`Delete “${v.name}” permanently? Past bookings keep their details. To remove it temporarily, use Hide instead.`)) return;
      try { await call('deleteVehicle', { type: v.type, id: v.id }); toast('Vehicle deleted'); loadVehicles(); } catch (x) { toast(x.message, true); }
      return;
    }
    try { await call('saveVehicle', { vehicle: { ...flat(v), active: !v.active } }); toast(v.active ? 'Hidden from website' : 'Now live on website'); loadVehicles(); }
    catch (x) { toast(x.message, true); }
  });

  const flat = v => ({ ...v, local4h: v.local?.['4h'], local8h: v.local?.['8h'] });

  const FIELDS = {
    common: [['name', 'Vehicle name *', 'text', 'e.g. Sedan, Thar 4x4, Activa'], ['models', 'Models / description', 'text', 'Dzire, Aura or similar'],
      ['seats', 'Seats', 'text', '4+1'], ['icon', 'Icon', 'icon'], ['image', 'Photo URL (optional)', 'url', 'https://…', true], ['sort', 'Display order', 'number', '1']],
    cab: [['km', '₹ per km (outstation) *', 'number'], ['da', 'Driver allowance ₹/day *', 'number'], ['transfer', 'City / airport transfer ₹ *', 'number'],
      ['hr', 'Extra hour / waiting ₹ *', 'number'], ['local4h', 'Local 4 hrs / 40 km ₹ *', 'number'], ['local8h', 'Local 8 hrs / 80 km ₹ *', 'number'], ['bags', 'Luggage', 'text', '3 bags']],
    self: [['day', 'Price per 24 hrs ₹ *', 'number'], ['half', 'Price per 12 hrs ₹ *', 'number'], ['xkm', 'Extra km ₹ *', 'number'],
      ['dep', 'Security deposit ₹ *', 'number'], ['age', 'Minimum driver age *', 'number'], ['trans', 'Gearbox', 'text', 'Manual / Auto'], ['fuel', 'Fuel', 'text', 'Petrol']]
  };
  const vdlg = $('[data-vehicle-dialog]'), vf = $('[data-vehicle-form]');
  $$('[data-close]', vdlg).forEach(b => b.addEventListener('click', () => vdlg.close()));
  $('[data-add-vehicle]').addEventListener('click', () => openVehicle(null));

  function openVehicle(v) {
    const type = v ? v.type : state.vtype, data = v ? flat(v) : { icon: type === 'self' ? 'hatch' : 'sedan', active: true };
    vf.dataset.type = type; vf.dataset.id = v ? v.id : ''; vf.dataset.isNew = v ? '' : '1';
    $('[data-v-title]').textContent = (v ? 'Edit ' : 'Add ') + (type === 'cab' ? 'cab with driver' : 'self-drive vehicle');
    const field = ([k, label, kind, ph, full]) => kind === 'icon'
      ? `<label class="fld"><span>${label}</span><select name="${k}">${ICONS.map(i => `<option${data[k] === i ? ' selected' : ''}>${i}</option>`).join('')}</select></label>`
      : `<label class="fld${full ? ' full' : ''}"><span>${label}</span><input name="${k}" type="${kind === 'number' ? 'text' : kind}" ${kind === 'number' ? 'inputmode="numeric"' : ''} value="${esc(data[k] ?? '')}" placeholder="${esc(ph || '')}"></label>`;
    $('[data-v-fields]').innerHTML = FIELDS.common.map(field).join('') + FIELDS[type].map(field).join('') +
      `<label class="chk fld full"><input type="checkbox" name="active"${data.active ? ' checked' : ''}> Show on website (live)</label>` +
      (v ? `<p class="muted fld full" style="margin:0">ID: <code>${esc(v.id)}</code></p>` : '');
    $('[data-v-error]').textContent = '';
    vdlg.showModal();
  }

  vf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const type = vf.dataset.type, v = { type, id: vf.dataset.id };
    [...FIELDS.common, ...FIELDS[type]].forEach(([k]) => { v[k] = vf.elements[k].value.trim(); });
    v.active = vf.elements.active.checked;
    const btn = $('button[type=submit]', vf); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await call('saveVehicle', { vehicle: v, isNew: !!vf.dataset.isNew });
      vdlg.close(); toast('Vehicle saved'); loadVehicles();
    } catch (x) { $('[data-v-error]').textContent = x.message; }
    btn.disabled = false; btn.textContent = 'Save vehicle';
  });

  /* ---------- Pricing rules ---------- */
  const RULE_GROUPS = [
    ['Cab with driver', [['oneWayMinKm', 'One-way minimum billing (km)'], ['roundMinKmPerDay', 'Round trip minimum km per day'],
      ['transferMaxKm', 'Trips shorter than this are flat transfers (km)'], ['transferIncludedKm', 'Km included in transfer price'],
      ['nightCharge', 'Night charge ₹ (10 PM–6 AM)'], ['gst', 'GST % (shown to customers)']]],
    ['Self drive', [['selfMinHours', 'Minimum rental (hours)'], ['selfKmPerDay', 'Free km per 24 hrs'], ['selfKmHalf', 'Free km per 12 hrs'],
      ['graceHours', 'Grace period before next slot (hours)'], ['unlimitedPct', 'Unlimited km add-on (%)'], ['disc7', 'Discount for 7+ days (%)'],
      ['disc30', 'Discount for 30+ days (%)'], ['deliveryFee', 'Doorstep delivery fee ₹'], ['freeDeliveryDays', 'Free delivery from (days)'],
      ['lateFeePerHour', 'Late return ₹ per hour'], ['cleaningFee', 'Cleaning fee ₹'], ['smokingFee', 'Smoking fine ₹'], ['refuelFee', 'Refuel service fee ₹']]]
  ];
  const rf = $('[data-rules-form]');
  async function loadRules() {
    rf.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const r = await fetch(API + '?action=catalog').then(x => x.json());
      state.rules = r.rules || B.rules;
      rf.innerHTML = RULE_GROUPS.map(([title, items]) => `<fieldset class="adm-card"><legend>${title}</legend><div class="grid2">` +
        items.map(([k, l]) => `<label class="fld"><span>${l}</span><input name="${k}" inputmode="decimal" value="${esc(state.rules[k])}"></label>`).join('') +
        '</div></fieldset>').join('') + '<p class="book-error" data-r-error role="alert"></p><button type="submit" class="btn btn-primary">Save pricing rules</button>';
    } catch (x) { toast(x.message, true); }
  }
  rf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const rules = {};
    for (const el of $$('input', rf)) {
      if (el.value.trim() === '' || isNaN(Number(el.value))) { $('[data-r-error]').textContent = 'Please enter a number for every field.'; el.focus(); return; }
      rules[el.name] = Number(el.value);
    }
    const btn = $('button[type=submit]', rf); btn.disabled = true;
    try { await call('saveRules', { rules }); toast('Pricing rules saved'); $('[data-r-error]').textContent = ''; }
    catch (x) { $('[data-r-error]').textContent = x.message; }
    btn.disabled = false;
  });

  /* ---------- Car icons sprite (reused from website) ---------- */
  fetch('../index.html').then(r => r.text()).then(t => {
    const m = t.match(/<svg width="0" height="0"[\s\S]*?<\/svg>\s*(?=<a class="skip")/);
    if (m) document.body.insertAdjacentHTML('afterbegin', m[0]);
  }).catch(() => { });

  /* ---------- Auto login ---------- */
  state.key = store.get();
  if (state.key && API) call('login').then(enter).catch(() => { state.key = ''; store.clear(); show('login'); });
  else show('login');
})();
