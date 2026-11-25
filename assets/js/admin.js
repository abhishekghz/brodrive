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
  const ACTIVE = ['New', 'Confirmed', 'Ongoing'];
  const ICONS = ['hatch', 'sedan', 'suv', 'jeep', 'van', 'bike'];
  const TZ = 'Asia/Kolkata';
  const PHONE = String(B.site.phone || '').replace(/^\+91/, '+91 ');

  const state = { key: '', bookings: [], vehicles: [], fleet: [], status: 'New', service: '', q: '', vtype: 'cab', current: null };

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
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3500);
  }

  /* ---------- Time helpers (all bookings are in IST) ---------- */
  const ist = s => s ? new Date(String(s).replace(' ', 'T') + ':00+05:30') : null;
  const istDay = d => d.toLocaleDateString('en-CA', { timeZone: TZ });
  const istTime = d => d.toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  function windowOf(b) {
    const s = ist(b.when); if (!s || isNaN(s)) return null;
    let e = ist(b.until);
    if (!e || isNaN(e) || e <= s) e = new Date(s.getTime() + 12 * 36e5);
    return [s, e];
  }
  const normReg = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function clashes(b, reg) {
    const w = windowOf(b), r = normReg(reg);
    if (!w || !r) return [];
    return state.bookings.filter(o => o.id !== b.id && ACTIVE.includes(o.status) && normReg(o.vehicleNo) === r)
      .filter(o => { const x = windowOf(o); return x && x[0] < w[1] && w[0] < x[1]; });
  }

  /* ---------- Views ---------- */
  function show(view) {
    $$('[data-section]').forEach(s => { s.hidden = s.dataset.section !== view; });
    $$('[data-view]').forEach(b => b.toggleAttribute('aria-current', b.dataset.view === view));
    if (view === 'vehicles') loadVehicles();
    if (view === 'rules') loadRules();
    if (view === 'schedule') renderSchedule();
    if (view === 'fleet') renderFleet();
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
    $('[data-sheet]').href = j.sheetUrl;
    $('.adm-tabs').hidden = false; $('[data-logout]').hidden = false;
    show('bookings'); loadBookings(); loadFleet(true); loadVehicles(true);
    clearInterval(enter._t);
    enter._t = setInterval(() => {
      const busy = $('[data-booking-dialog]').open || $('[data-car-dialog]').open || $('[data-vehicle-dialog]').open;
      if (!document.hidden && !busy) loadBookings(true);
    }, 60000);
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
      state.bookings = (await call('bookings')).bookings;
      renderBookings();
      if (!$('[data-section=schedule]').hidden) renderSchedule();
      $('[data-updated]').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) + ' · refreshes every minute';
    } catch (x) { if (!quiet) toast(x.message, true); }
    btn.disabled = false; btn.textContent = 'Refresh';
  }
  $('[data-refresh]').addEventListener('click', () => loadBookings());

  const fare = b => Number(b.finalFare) || Number(b.estimate) || 0;

  function renderBookings() {
    const all = state.bookings;
    const counts = Object.fromEntries(STATUSES.map(s => [s, all.filter(b => b.status === s).length]));
    const now = new Date(), week = new Date(now.getTime() + 7 * 864e5);
    const ym = istDay(now).slice(0, 7);
    const upcoming = all.filter(b => ACTIVE.includes(b.status) && (w => w && w[1] >= now && w[0] <= week)(windowOf(b)));
    const unassigned = upcoming.filter(b => !b.vehicleNo).length;
    const month = all.filter(b => String(b.created).startsWith(ym) && b.status !== 'Cancelled');
    $('[data-stats]').innerHTML = [
      ['New – approve or reject', counts.New, 'hot'], ['Upcoming 7 days', upcoming.length + (unassigned ? ` <small>(${unassigned} without car)</small>` : ''), ''],
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
      <td data-label="Trip / car">${esc(b.pickup)}${b.destination ? ' → ' + esc(b.destination) : ''}<small>${esc(b.carName)}${b.vehicleNo ? ' · <span class="reg">' + esc(b.vehicleNo) + '</span>' : ''}</small></td>
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
  const FIELDS_B = ['status', 'vehicleNo', 'finalFare', 'driverName', 'driverPhone', 'adminNotes'];
  bf.status.innerHTML = STATUSES.map(s => `<option>${s}</option>`).join('');

  const mapLink = b => b.pickupGeo && b.dropGeo ? `https://www.google.com/maps/dir/?api=1&origin=${b.pickupGeo}&destination=${b.dropGeo}` : '';
  const formView = () => { const b = { ...state.current }; FIELDS_B.forEach(k => { b[k] = bf[k].value.trim(); }); return b; };

  function waText(b, kind) {
    const first = String(b.name).split(' ')[0];
    if (kind === 'reject') {
      return [`Hi ${first}, this is BroDrive. Sorry – we're unable to take your booking ${b.id} (${b.trip}, ${b.start}).`,
        b.reason ? `Reason: ${b.reason}` : '', `Please call or WhatsApp us on ${PHONE} and we'll try to arrange an alternative. 🙏`].filter(Boolean).join('\n');
    }
    const head = kind === 'approve' ? `Hi ${first}, your BroDrive booking *${b.id}* is CONFIRMED ✅` : `Hi ${first}, update on your BroDrive booking *${b.id}* (${b.status}).`;
    const lines = [head, '', `${b.service} – ${b.trip}`, `Pickup: ${b.pickup}${b.address ? ', ' + b.address : ''}`];
    if (b.destination) lines.push(`Drop: ${b.destination}`);
    lines.push(`Time: ${b.start}`);
    if (b.end) lines.push(`${b.service === 'Self drive' ? 'Return' : 'Return date'}: ${b.end}`);
    lines.push(`Car: ${b.carName}`);
    if (b.vehicleNo) lines.push(`Vehicle no: *${b.vehicleNo}*`);
    if (b.driverName) lines.push(`Driver: ${b.driverName}${b.driverPhone ? ' (' + b.driverPhone + ')' : ''}`);
    lines.push(`Fare: ${inr(fare(b))}${b.finalFare ? '' : ' (estimate)'}${b.service === 'Self drive' ? ' + refundable deposit' : ' + toll/parking if any'}`);
    if (mapLink(b)) lines.push(`Route: ${mapLink(b)}`);
    if (b.service === 'Self drive') lines.push('', 'Please bring your original driving licence and Aadhaar at pickup.');
    lines.push('', `Questions? Call/WhatsApp ${PHONE}. Thank you for choosing BroDrive! 🚗`);
    return lines.join('\n');
  }
  const waUrl = (b, kind) => `https://wa.me/91${String(b.mobile).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(waText(b, kind))}`;

  function fillAssign(b) {
    const want = b.service === 'Self drive' ? 'self' : 'cab';
    const cars = state.fleet.filter(c => c.active).map(c => ({ c, score: (c.vehicleType === want ? 2 : 0) + (c.vehicleId === b.carId ? 1 : 0), busy: clashes(b, c.regNo).length > 0 }))
      .sort((x, y) => (x.busy - y.busy) || (y.score - x.score) || x.c.regNo.localeCompare(y.c.regNo));
    bf.assign.innerHTML = `<option value="">${state.fleet.length ? '— choose a car (fills the fields below) —' : '— add your cars under “My cars” first —'}</option>` +
      cars.map(({ c, busy, score }) => `<option value="${esc(c.regNo)}">${esc(c.regNo)} – ${esc(c.model)}${c.driverName ? ' · ' + esc(c.driverName) : ''}${busy ? ' ⚠ busy' : score >= 3 ? ' ★ matches' : ''}</option>`).join('');
    bf.assign.value = state.fleet.some(c => normReg(c.regNo) === normReg(b.vehicleNo)) ? state.fleet.find(c => normReg(c.regNo) === normReg(b.vehicleNo)).regNo : '';
  }
  function checkClash() {
    const el = $('[data-clash]'), b = state.current, reg = bf.vehicleNo.value.trim();
    if (!b || !reg) { el.hidden = true; return; }
    const hit = clashes(b, reg);
    el.hidden = false;
    el.className = 'clash ' + (hit.length ? 'bad' : 'ok');
    el.innerHTML = hit.length ? `⚠ ${esc(reg)} is already booked: ` + hit.map(o => `${esc(o.id)} (${esc(o.name)}, ${esc(o.start)})`).join('; ')
      : `✓ ${esc(reg)} is free for this booking’s time.`;
  }
  bf.assign.addEventListener('change', () => {
    const c = state.fleet.find(x => x.regNo === bf.assign.value); if (!c) return;
    bf.vehicleNo.value = c.regNo;
    if (c.driverName || state.current.service !== 'Self drive') { bf.driverName.value = c.driverName; bf.driverPhone.value = c.driverPhone; }
    checkClash();
  });
  bf.vehicleNo.addEventListener('input', checkClash);

  function openBooking(id) {
    const b = state.bookings.find(x => x.id === id); if (!b) return;
    state.current = b;
    $('[data-b-title]').textContent = b.id;
    $('[data-b-sub]').innerHTML = `Booked ${esc(b.created)} · <span class="pill s-${esc(String(b.status).toLowerCase())}">${esc(b.status)}</span>`;
    $('[data-b-decide]').hidden = !['New', 'Confirmed'].includes(b.status);
    $('[data-approve]').textContent = b.status === 'Confirmed' ? '✓ Re-send confirmation' : '✓ Approve & notify';
    $('[data-b-quick]').innerHTML = `<a class="btn btn-primary btn-sm" href="tel:+91${esc(String(b.mobile).slice(-10))}">Call ${esc(String(b.name).split(' ')[0])}</a>
      ${b.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(b.email)}?subject=${encodeURIComponent('Your BroDrive booking ' + b.id)}">Email</a>` : ''}
      ${mapLink(b) ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(mapLink(b))}">Route map</a>` : ''}`;
    const rows = [['Customer', `${b.name}\n${b.mobile}${b.email ? '\n' + b.email : ''}`], ['Service', b.service], ['Trip', b.trip],
      ['Pickup', b.pickup], ['Address', b.address], ['Drop', b.destination ? `${b.destination}${b.km ? ' (~' + b.km + ' km)' : ''}` : (b.service === 'Self drive' ? b.km : '')],
      ['Pickup time', b.start], ['Return', b.end], ['Car type', b.carName], ['Estimate', inr(Number(b.estimate) || 0)],
      ['Fare breakdown', b.fareDetail], ['Customer notes', b.notes]];
    $('[data-b-details]').innerHTML = rows.filter(r => r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v).replace(/\n/g, '<br>')}</dd>`).join('');
    FIELDS_B.forEach(k => { bf[k].value = b[k] ?? ''; });
    fillAssign(b); checkClash();
    $('[data-save=email]').disabled = !b.email;
    $('[data-save=email]').title = b.email ? '' : 'Customer did not give an email';
    $('[data-b-history]').textContent = b.history || '';
    $('[data-b-error]').textContent = '';
    dlg.showModal();
  }

  async function save(fields, notify) {
    const b = state.current;
    if (fields.finalFare && isNaN(Number(fields.finalFare))) throw new Error('Final fare must be a number.');
    const j = await call('updateBooking', { id: b.id, fields, notify: notify && !!b.email });
    Object.assign(b, j.booking);
    renderBookings();
    return j;
  }
  const collect = () => Object.fromEntries(FIELDS_B.map(k => [k, bf[k].value.trim()]));

  $$('[data-save]').forEach(btn => btn.addEventListener('click', async () => {
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const j = await save(collect(), btn.dataset.save === 'email');
      dlg.close(); toast(j.emailed ? `Saved and emailed ${state.current.email}` : 'Booking saved');
    } catch (x) { $('[data-b-error]').textContent = x.message; }
    btn.disabled = btn.dataset.save === 'email' && !state.current.email; btn.textContent = label;
  }));

  $('[data-send-wa]').addEventListener('click', () => {
    const b = formView();
    window.open(waUrl(b, b.status === 'Confirmed' ? 'approve' : 'update'), '_blank', 'noopener');
  });

  $('[data-approve]').addEventListener('click', async ev => {
    const b0 = formView();
    if (!b0.vehicleNo && !confirm('No car is assigned yet. Approve anyway? (You can send car details later.)')) return;
    const hit = clashes(state.current, b0.vehicleNo);
    if (hit.length && !confirm(`${b0.vehicleNo} is already booked at this time (${hit.map(o => o.id).join(', ')}). Approve anyway?`)) return;
    const btn = ev.currentTarget, w = window.open('', '_blank'); // open now so the browser doesn't block it
    btn.disabled = true;
    try {
      const fields = { ...collect(), status: 'Confirmed' };
      const j = await save(fields, true);
      const url = waUrl(state.current, 'approve');
      if (w) w.location.href = url; else window.open(url, '_blank');
      dlg.close();
      toast('Approved' + (j.emailed ? ` · emailed ${state.current.email}` : '') + ' · WhatsApp opened');
    } catch (x) { if (w) w.close(); $('[data-b-error]').textContent = x.message; }
    btn.disabled = false;
  });

  $('[data-reject]').addEventListener('click', async ev => {
    const reason = prompt('Reject this booking? Optional reason for the customer (e.g. "No car available at that time"):', '');
    if (reason === null) return;
    const btn = ev.currentTarget, w = window.open('', '_blank');
    btn.disabled = true;
    try {
      const notes = [bf.adminNotes.value.trim(), reason ? 'Rejected: ' + reason : 'Rejected'].filter(Boolean).join('\n');
      const j = await save({ ...collect(), status: 'Cancelled', adminNotes: notes }, true);
      const url = waUrl({ ...state.current, reason }, 'reject');
      if (w) w.location.href = url; else window.open(url, '_blank');
      dlg.close();
      toast('Rejected' + (j.emailed ? ` · emailed ${state.current.email}` : '') + ' · WhatsApp opened');
    } catch (x) { if (w) w.close(); $('[data-b-error]').textContent = x.message; }
    btn.disabled = false;
  });

  /* ---------- Schedule ---------- */
  $('[data-sched-days]').addEventListener('change', renderSchedule);
  function renderSchedule() {
    const n = +$('[data-sched-days]').value, out = [];
    const active = state.bookings.filter(b => ACTIVE.includes(b.status)).map(b => ({ b, w: windowOf(b) })).filter(x => x.w);
    const fleetActive = state.fleet.filter(c => c.active);
    for (let i = 0; i < n; i++) {
      const day = istDay(new Date(Date.now() + i * 864e5));
      const d0 = new Date(day + 'T00:00:00+05:30'), d1 = new Date(d0.getTime() + 864e5);
      const items = active.filter(x => x.w[0] < d1 && d0 < x.w[1]).sort((a, b) => a.w[0] - b.w[0]);
      const used = new Set(items.map(x => normReg(x.b.vehicleNo)).filter(Boolean));
      const free = fleetActive.filter(c => !used.has(normReg(c.regNo)));
      const label = new Date(day + 'T12:00:00+05:30').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
      out.push(`<div class="sched-day"><h3>${i === 0 ? 'Today · ' : i === 1 ? 'Tomorrow · ' : ''}${label}<small>${items.length} booking${items.length === 1 ? '' : 's'}${items.some(x => !x.b.vehicleNo) ? ' · ⚠ needs a car' : ''}</small></h3>` +
        (items.length ? items.map(({ b, w }) => `<div class="sched-row" data-id="${esc(b.id)}">
          <div><b>${w[0] >= d0 ? istTime(w[0]) : 'continues'}</b><small>${w[1] <= d1 ? 'till ' + istTime(w[1]) : 'multi-day'}</small></div>
          <div><b>${esc(b.name)}</b><small>${esc(b.mobile)} · ${esc(b.id)}</small></div>
          <div>${esc(b.service)} – ${esc(b.trip)}<small>${esc(b.pickup)}${b.destination ? ' → ' + esc(b.destination) : ''}</small></div>
          <div>${b.vehicleNo ? `<span class="reg">${esc(b.vehicleNo)}</span>` : '<span class="pill unassigned">No car yet</span>'} <span class="pill s-${esc(b.status.toLowerCase())}">${esc(b.status)}</span></div>
        </div>`).join('') : '<div class="empty-day">No bookings.</div>') +
        (fleetActive.length ? `<div class="sched-free">Free cars: ${free.length ? free.map(c => `<b>${esc(c.regNo)}</b> (${esc(c.model)})`).join(', ') : 'none – all cars booked'}</div>` : '') +
        '</div>');
    }
    $('[data-schedule]').innerHTML = out.join('');
  }
  $('[data-schedule]').addEventListener('click', ev => { const r = ev.target.closest('[data-id]'); if (r) openBooking(r.dataset.id); });

  /* ---------- My cars (fleet register) ---------- */
  async function loadFleet(quiet) {
    try { state.fleet = (await call('fleet')).fleet; if (!$('[data-section=fleet]').hidden) renderFleet(); }
    catch (x) { if (!quiet) toast(x.message, true); }
  }
  const catName = c => { const v = state.vehicles.find(x => x.type === c.vehicleType && x.id === c.vehicleId); return (c.vehicleType === 'self' ? 'Self drive' : 'Cab') + (v ? ' – ' + v.name : ''); };
  function renderFleet() {
    const now = new Date();
    $('[data-fleet]').innerHTML = state.fleet.length ? state.fleet.slice().sort((a, b) => a.regNo.localeCompare(b.regNo)).map(c => {
      const next = state.bookings.filter(b => ACTIVE.includes(b.status) && normReg(b.vehicleNo) === normReg(c.regNo))
        .map(b => ({ b, w: windowOf(b) })).filter(x => x.w && x.w[1] >= now).sort((a, b) => a.w[0] - b.w[0])[0];
      return `<article class="vcard${c.active ? '' : ' off'}">
        <div class="vtop"><span class="reg">${esc(c.regNo)}</span><span class="pill ${c.active ? 's-confirmed' : 's-cancelled'}">${c.active ? 'Available' : 'Off road'}</span></div>
        <h3>${esc(c.model)}</h3><p class="muted">${esc(catName(c))}</p>
        <ul class="specs"><li>Driver <b>${esc(c.driverName || '—')}</b></li><li>Phone <b>${esc(c.driverPhone || '—')}</b></li>
          <li>Next booking <b>${next ? esc(next.b.start) : 'none'}</b></li>${c.notes ? `<li>Notes <b>${esc(c.notes)}</b></li>` : ''}</ul>
        <div class="vact"><button type="button" class="btn btn-dark btn-sm" data-car-edit="${esc(c.regNo)}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm danger" data-car-del="${esc(c.regNo)}">Delete</button></div></article>`;
    }).join('') : '<p class="muted">No cars yet. Click “Add car” and enter each car’s registration number, model and regular driver.</p>';
  }
  const cdlg = $('[data-car-dialog]'), cf = $('[data-car-form]');
  $$('[data-close]', cdlg).forEach(b => b.addEventListener('click', () => cdlg.close()));
  $('[data-add-car]').addEventListener('click', () => openCar(null));
  $('[data-fleet]').addEventListener('click', async ev => {
    const ed = ev.target.closest('[data-car-edit]'), del = ev.target.closest('[data-car-del]');
    if (ed) openCar(state.fleet.find(c => c.regNo === ed.dataset.carEdit));
    if (del) {
      if (!confirm(`Remove ${del.dataset.carDel} from your fleet? Past bookings keep the number.`)) return;
      try { await call('deleteFleet', { regNo: del.dataset.carDel }); toast('Car removed'); await loadFleet(); renderFleet(); } catch (x) { toast(x.message, true); }
    }
  });
  function openCar(c) {
    cf.dataset.original = c ? c.regNo : '';
    $('[data-c-title]').textContent = c ? 'Edit ' + c.regNo : 'Add car';
    cf.category.innerHTML = state.vehicles.slice().sort((a, b) => a.type.localeCompare(b.type) || a.sort - b.sort)
      .map(v => `<option value="${v.type}:${esc(v.id)}">${v.type === 'self' ? 'Self drive' : 'Cab with driver'} – ${esc(v.name)}</option>`).join('');
    cf.regNo.value = c ? c.regNo : ''; cf.model.value = c ? c.model : '';
    cf.category.value = c ? `${c.vehicleType}:${c.vehicleId}` : (cf.category.options[0] || {}).value || '';
    cf.driverName.value = c ? c.driverName : ''; cf.driverPhone.value = c ? c.driverPhone : ''; cf.notes.value = c ? c.notes : '';
    cf.active.checked = c ? c.active : true;
    $('[data-c-error]').textContent = '';
    cdlg.showModal();
  }
  cf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const [vehicleType, vehicleId] = (cf.category.value || 'cab:').split(':');
    if (!cf.regNo.value.trim() || !cf.model.value.trim()) { $('[data-c-error]').textContent = 'Registration number and model are required.'; return; }
    const btn = $('button[type=submit]', cf); btn.disabled = true;
    try {
      await call('saveFleet', { isNew: !cf.dataset.original, original: cf.dataset.original, car: {
        regNo: cf.regNo.value, model: cf.model.value, vehicleType, vehicleId, driverName: cf.driverName.value,
        driverPhone: cf.driverPhone.value, notes: cf.notes.value, active: cf.active.checked } });
      cdlg.close(); toast('Car saved'); await loadFleet(); renderFleet();
    } catch (x) { $('[data-c-error]').textContent = x.message; }
    btn.disabled = false;
  });

  /* ---------- Prices & vehicles ---------- */
  async function loadVehicles(quiet) {
    if (!quiet) $('[data-vehicles]').innerHTML = '<p class="muted">Loading…</p>';
    try { state.vehicles = (await call('vehicles')).vehicles; renderVehicles(); }
    catch (x) { if (!quiet) toast(x.message, true); }
  }
  $$('input[name=vtype]').forEach(r => r.addEventListener('change', () => { state.vtype = r.value; renderVehicles(); }));

  function renderVehicles() {
    const list = state.vehicles.filter(v => v.type === state.vtype).sort((a, b) => a.sort - b.sort);
    $('[data-vehicles]').innerHTML = list.length ? list.map(v => {
      const specs = v.type === 'cab'
        ? [['City ride', v.cityKm ? `${inr(v.cityBase)} + ${inr(v.cityKm)}/km (min ${inr(v.cityMin)})` : 'not offered'], ['Outstation', inr(v.km) + '/km'], ['Driver allowance', inr(v.da) + '/day'],
          ['Transfer', inr(v.transfer)], ['Local 4h / 8h', inr(v.local['4h']) + ' / ' + inr(v.local['8h'])], ['Extra hour', inr(v.hr)]]
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
    cab: [['cityBase', 'City ride base fare ₹', 'number', '0 = no city rides'], ['cityKm', 'City ride ₹ per km', 'number', '0 = no city rides'], ['cityMin', 'City ride minimum fare ₹', 'number'],
      ['km', 'Outstation ₹ per km *', 'number'], ['da', 'Driver allowance ₹/day *', 'number'], ['transfer', 'Airport / city transfer ₹ *', 'number'],
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
      : `<label class="fld${full ? ' full' : ''}"><span>${label}</span><input name="${k}" type="${kind === 'number' ? 'text' : kind}" ${kind === 'number' ? 'inputmode="decimal"' : ''} value="${esc(data[k] ?? '')}" placeholder="${esc(ph || '')}"></label>`;
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
    ['City rides', [['cityNightPct', 'Night charge % (10 PM–6 AM)'], ['cityMaxKm', 'Longest city ride (km) – longer must book Outstation']]],
    ['Outstation & hourly', [['oneWayMinKm', 'One-way minimum billing (km)'], ['roundMinKmPerDay', 'Round trip minimum km per day'],
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
      const rules = { ...B.rules, ...(r.rules || {}) };
      rf.innerHTML = RULE_GROUPS.map(([title, items]) => `<fieldset class="adm-card"><legend>${title}</legend><div class="grid2">` +
        items.map(([k, l]) => `<label class="fld"><span>${l}</span><input name="${k}" inputmode="decimal" value="${esc(rules[k])}"></label>`).join('') +
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

  /* ---------- Car icons sprite (reused from the website) ---------- */
  fetch('../index.html').then(r => r.text()).then(t => {
    const m = t.match(/<svg width="0" height="0"[\s\S]*?<\/svg>\s*(?=<a class="skip")/);
    if (m) document.body.insertAdjacentHTML('afterbegin', m[0]);
  }).catch(() => { });

  /* ---------- Auto login ---------- */
  state.key = store.get();
  if (state.key && API) call('login').then(enter).catch(() => { state.key = ''; store.clear(); show('login'); });
  else show('login');
})();
