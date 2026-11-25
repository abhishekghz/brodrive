/* BroDrive partner portal: register, upload papers, cars, rides & earnings. */
(() => {
  'use strict';
  const B = window.BRO, API = B.site.api, inr = window.BroFare.inr;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TOKEN = 'bro_partner';
  const DOCS_CAR = [['rcFile', 'RC (registration)', null], ['insFile', 'Insurance', 'insExp'], ['permitFile', 'Permit', 'permitExp'], ['pucFile', 'PUC', 'pucExp'], ['fitFile', 'Fitness certificate', 'fitExp'], ['photos', 'Car photos (front, side, inside)', null]];
  const DOCS_ME = [['dlFile', 'Driving licence'], ['aadhaarFile', 'Aadhaar'], ['photoFile', 'Your photo']];
  let token = '', me = null;

  const store = { get() { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } }, set(v) { try { v ? localStorage.setItem(TOKEN, v) : localStorage.removeItem(TOKEN); } catch { } } };
  async function call(action, data = {}) {
    if (!API) throw new Error('Partner registration opens soon. Please call BroDrive.');
    const r = await fetch(API, { method: 'POST', body: JSON.stringify({ ...data, action, token }) });
    const j = await r.json();
    if (!j.ok) { if (/log in again/i.test(j.error || '')) logout(); throw new Error(j.error || 'Something went wrong'); }
    return j;
  }
  function toast(msg, bad) { const t = $('[data-toast]'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3500); }

  /* ---------- Auth ---------- */
  $$('[data-atab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-atab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-form]').forEach(f => { f.hidden = f.dataset.form !== b.dataset.atab; });
  }));
  const rf = $('[data-form=register]'), lf = $('[data-form=login]');
  rf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const e = rf.elements, err = $('.book-error', rf);
    if (e.password.value !== e.password2.value) { err.textContent = 'The two passwords don’t match.'; return; }
    if (!e.agree.checked) { err.textContent = 'Please confirm the papers declaration.'; return; }
    const btn = $('button[type=submit]', rf); btn.disabled = true; err.textContent = '';
    try {
      const j = await call('pRegister', { name: e.name.value, mobile: e.mobile.value, email: e.email.value, city: e.city.value, kind: e.kind.value, upi: e.upi.value, password: e.password.value, website: e.website.value });
      token = j.token; store.set(token); await load(); show('cars'); toast('Welcome! Now add your car and upload its papers.');
    } catch (x) { err.textContent = x.message; }
    btn.disabled = false;
  });
  lf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('.book-error', lf), btn = $('button[type=submit]', lf); btn.disabled = true; err.textContent = '';
    try { const j = await call('pLogin', { mobile: lf.elements.mobile.value, password: lf.elements.password.value }); token = j.token; store.set(token); await load(); }
    catch (x) { err.textContent = x.message; }
    btn.disabled = false;
  });
  function logout() {
    if (token) fetch(API, { method: 'POST', body: JSON.stringify({ action: 'pLogout', token }) }).catch(() => { });
    token = ''; store.set(''); me = null;
    $('[data-dash]').hidden = true; $('[data-auth]').hidden = false; $('[data-intro]').hidden = false; $('[data-logout]').hidden = true;
  }
  $('[data-logout]').addEventListener('click', logout);
  $('[data-reload]').addEventListener('click', () => load().then(() => toast('Updated')));

  /* ---------- Dashboard ---------- */
  async function load() {
    me = await call('pMe');
    $('[data-auth]').hidden = true; $('[data-intro]').hidden = true; $('[data-dash]').hidden = false; $('[data-logout]').hidden = false;
    $('[data-hello]').textContent = 'Hi, ' + me.partner.name.split(' ')[0];
    $('[data-pid]').textContent = 'Partner ID ' + me.partner.id + ' · ' + me.partner.mobile;
    const s = me.partner.status;
    $('[data-status]').innerHTML = s === 'Approved' ? '<div class="status-note ok"><b>Verified partner.</b> Your approved cars can now be assigned to bookings.</div>'
      : s === 'Pending' ? '<div class="status-note pending"><b>Verification pending.</b> Add your car(s) and upload all papers below; BroDrive will check them and approve you, usually within a day.</div>'
      : '<div class="status-note bad"><b>Account ' + esc(s.toLowerCase()) + '.</b> Please call BroDrive on ' + esc(me.phone) + '.</div>';
    renderRides(); renderCars(); renderProfile();
  }
  function show(v) {
    $$('[data-ptab]').forEach(b => b.toggleAttribute('aria-current', b.dataset.ptab === v));
    $$('[data-pview]').forEach(x => { x.hidden = x.dataset.pview !== v; });
  }
  $$('[data-ptab]').forEach(b => b.addEventListener('click', () => show(b.dataset.ptab)));

  function renderRides() {
    const t = me.totals, rides = me.rides;
    const up = rides.filter(r => ['Confirmed', 'Ongoing'].includes(r.status));
    const done = rides.filter(r => r.status === 'Completed');
    let h = `<div class="stats">
      <div class="stat hot"><span>Upcoming rides</span><b>${t.upcoming}</b></div>
      <div class="stat"><span>Earned this month</span><b>${inr(t.month)}</b></div>
      <div class="stat"><span>Payout pending</span><b>${inr(t.pending)}</b></div>
      <div class="stat"><span>Rides completed</span><b>${t.completed}</b></div></div>`;
    h += '<h2 style="font-size:1.3rem;margin:22px 0 10px">Upcoming &amp; ongoing</h2>';
    h += up.length ? '<div class="rides">' + up.map(r => `<article class="ride">
        <h3>${esc(r.start)} <span class="pill s-${esc(r.status.toLowerCase())}">${esc(r.tripStatus || r.status)}</span></h3>
        <div class="meta">${esc(r.id)} · ${esc(r.service)} – ${esc(r.trip)} · <span class="reg">${esc(r.vehicleNo)}</span></div>
        <div><b>Pickup:</b> ${esc(r.pickup)}${r.address ? ', ' + esc(r.address) : ''}${r.destination ? `<br><b>Drop:</b> ${esc(r.destination)}` : ''}</div>
        <div><b>Customer:</b> ${esc(r.customerName)} · ${esc(r.customerMobile)} &nbsp; <b>Your payout:</b> ${r.payout ? inr(r.payout) : 'as agreed'}</div>
        <div class="acts">${r.driverUrl ? `<a class="btn btn-ok btn-sm" href="${esc(r.driverUrl)}">Start trip &amp; live tracking</a>` : ''}
          ${r.customerMobile ? `<a class="btn btn-ghost btn-sm" href="tel:+91${esc(r.customerMobile)}">Call customer</a>` : ''}
          ${r.pickupGeo ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${esc(r.pickupGeo)}">Directions to pickup</a>` : ''}</div>
      </article>`).join('') + '</div>' : '<p class="muted">No rides assigned right now. BroDrive will notify you when a booking is given to your car.</p>';
    h += '<h2 style="font-size:1.3rem;margin:26px 0 10px">Completed rides &amp; earnings</h2>';
    h += done.length ? `<div class="table-wrap adm-table"><table><thead><tr><th>Date</th><th>Ride</th><th>Car</th><th class="num">Km</th><th class="num">Your payout</th><th>Payment</th></tr></thead><tbody>${done.map(r => `<tr>
      <td data-label="Date">${esc(r.start)}</td><td data-label="Ride">${esc(r.pickup)}${r.destination ? ' → ' + esc(r.destination) : ''}<small>${esc(r.id)} · ${esc(r.trip)}</small></td>
      <td data-label="Car"><span class="reg">${esc(r.vehicleNo)}</span></td><td data-label="Km" class="num">${esc(r.kmCovered || r.km || '—')}</td>
      <td data-label="Payout" class="num"><b>${inr(r.payout)}</b></td><td data-label="Payment"><span class="pill ${r.payoutStatus === 'Paid' ? 's-confirmed' : 's-new'}">${esc(r.payoutStatus)}</span></td></tr>`).join('')}</tbody></table></div>
      <p class="muted-s" style="margin-top:8px">Total earned ${inr(t.earned)} · paid ${inr(t.paid)} · pending ${inr(t.pending)}. Payouts go to UPI ${esc(me.partner.upi || '(add your UPI ID in Profile)')}.</p>`
      : '<p class="muted">Completed rides and your earnings per ride will appear here.</p>';
    $('[data-pview=rides]').innerHTML = h;
  }

  /* ---------- Cars ---------- */
  const today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  function docRow(c, [f, label, exp]) {
    const has = f === 'photos' ? String(c.photos || '').split(',').filter(Boolean).length : !!c[f];
    const ex = exp ? c[exp] : '';
    const state = !has ? '<span class="miss">Missing</span>' : ex && ex < today ? '<span class="bad">Expired ' + esc(ex) + '</span>'
      : ex && ex < soon ? '<span class="miss">Expires ' + esc(ex) + '</span>' : '<span class="ok">✓ ' + (f === 'photos' ? has + ' uploaded' : 'Uploaded') + '</span>';
    return `<li><span>${label}<br>${state}</span><label class="btn btn-ghost btn-sm up">${has && f !== 'photos' ? 'Replace' : 'Upload'}<input type="file" accept="image/*,application/pdf" data-upload="car" data-field="${f}" data-reg="${esc(c.regNo)}"></label></li>`;
  }
  function renderCars() {
    const cars = me.cars;
    let h = '<div class="p-top"><p class="muted" style="margin:0">Add every car you want to attach. Each car is checked before it gets bookings.</p><button type="button" class="btn btn-primary btn-sm" data-add-car>+ Add car</button></div>';
    h += cars.length ? '<div class="vgrid">' + cars.map(c => {
      const pill = c.carStatus === 'Approved' ? 's-confirmed' : c.carStatus === 'Rejected' ? 's-cancelled' : 's-new';
      return `<article class="vcard"><div class="vtop"><span class="reg">${esc(c.regNo)}</span><span class="pill ${pill}">${esc(c.carStatus === 'Pending' ? 'Under review' : c.carStatus)}</span></div>
        <h3>${esc(c.model)}${c.year ? ' · ' + esc(c.year) : ''}</h3><p class="muted">${esc(catLabel(c))} · ${esc(c.seats || '?')} seats · ${esc(c.fuel)}${c.active ? '' : ' · <b>Not available</b>'}</p>
        <ul class="specs"><li>Per km <b>${c.perKm ? inr(+c.perKm) : '—'}</b></li><li>Daily (8h/80km) <b>${c.dayRate ? inr(+c.dayRate) : '—'}</b></li>
          <li>Driver allowance <b>${c.da ? inr(+c.da) + '/day' : '—'}</b></li><li>Toll <b>${esc(c.tollIncluded || 'Extra')}</b></li><li>Driver <b>${esc(c.driverName || '—')}</b></li></ul>
        <ul class="docs">${DOCS_CAR.map(d => docRow(c, d)).join('')}</ul>
        <div class="vact" style="margin-top:12px"><button type="button" class="btn btn-dark btn-sm" data-edit-car="${esc(c.regNo)}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm danger" data-del-car="${esc(c.regNo)}">Remove</button></div></article>`;
    }).join('') + '</div>' : '<p class="muted">No cars yet. Click “Add car”.</p>';
    $('[data-pview=cars]').innerHTML = h;
  }
  const cats = () => [...B.cab.map(v => ['cab:' + v.id, 'Cab – ' + v.name]), ...B.self.map(v => ['self:' + v.id, 'Self-drive – ' + v.name])];
  const catLabel = c => (cats().find(x => x[0] === c.vehicleType + ':' + c.vehicleId) || [0, c.vehicleType === 'self' ? 'Self-drive' : 'Cab'])[1];

  const dlg = $('[data-car-dlg]'), cf = $('[data-car-form]');
  $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
  function openCar(c) {
    cf.dataset.original = c ? c.regNo : '';
    $('[data-car-title]').textContent = c ? 'Edit ' + c.regNo : 'Add car';
    cf.category.innerHTML = cats().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    const e = cf.elements;
    ['regNo', 'model', 'year', 'seats', 'driverName', 'driverPhone', 'perKm', 'dayRate', 'da', 'nightCharge', 'insExp', 'permitExp', 'pucExp', 'fitExp', 'notes'].forEach(k => { e[k].value = c ? (c[k] || '') : ''; });
    ['fuel', 'ac', 'carrier', 'tollIncluded', 'permitType'].forEach(k => { if (c && c[k]) e[k].value = c[k]; });
    e.category.value = c ? c.vehicleType + ':' + c.vehicleId : 'cab:sedan';
    e.active.checked = c ? c.active : true;
    $('.book-error', cf).textContent = '';
    dlg.showModal();
  }
  cf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const e = cf.elements, [vehicleType, vehicleId] = e.category.value.split(':'), err = $('.book-error', cf);
    const car = { vehicleType, vehicleId, active: e.active.checked };
    ['regNo', 'model', 'year', 'seats', 'fuel', 'ac', 'carrier', 'driverName', 'driverPhone', 'perKm', 'dayRate', 'da', 'nightCharge', 'tollIncluded', 'insExp', 'permitType', 'permitExp', 'pucExp', 'fitExp', 'notes'].forEach(k => { car[k] = e[k].value.trim(); });
    const btn = $('button[type=submit]', cf); btn.disabled = true; err.textContent = '';
    try { await call('pSaveCar', { car, original: cf.dataset.original }); dlg.close(); await load(); show('cars'); toast('Car saved. Now upload its papers.'); }
    catch (x) { err.textContent = x.message; }
    btn.disabled = false;
  });
  document.addEventListener('click', async ev => {
    const add = ev.target.closest('[data-add-car]'), ed = ev.target.closest('[data-edit-car]'), del = ev.target.closest('[data-del-car]');
    if (add) openCar(null);
    if (ed) openCar(me.cars.find(c => c.regNo === ed.dataset.editCar));
    if (del && confirm('Remove ' + del.dataset.delCar + ' from BroDrive?')) {
      try { await call('pDeleteCar', { regNo: del.dataset.delCar }); await load(); show('cars'); toast('Car removed'); } catch (x) { toast(x.message, true); }
    }
  });

  /* ---------- Uploads (photos are shrunk on the phone first) ---------- */
  function shrink(file) {
    return new Promise((res, rej) => {
      if (file.type === 'application/pdf') {
        if (file.size > 6 * 1024 * 1024) return rej(new Error('PDF is larger than 6 MB. Please upload a photo instead.'));
        const fr = new FileReader(); fr.onload = () => res({ data: String(fr.result).split(',')[1], mime: 'application/pdf' }); fr.onerror = rej; fr.readAsDataURL(file); return;
      }
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res({ data: c.toDataURL('image/jpeg', 0.8).split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = () => rej(new Error('Couldn’t read that image. Please try a JPG or PNG photo.'));
      img.src = url;
    });
  }
  document.addEventListener('change', async ev => {
    const inp = ev.target.closest('input[data-upload]'); if (!inp || !inp.files[0]) return;
    const lbl = inp.closest('label'), old = lbl.firstChild.textContent;
    lbl.firstChild.textContent = 'Uploading…';
    try {
      const f = await shrink(inp.files[0]);
      await call('pUpload', { target: inp.dataset.upload, field: inp.dataset.field, regNo: inp.dataset.reg || '', mime: f.mime, data: f.data });
      const view = inp.dataset.upload === 'car' ? 'cars' : 'profile';
      await load(); show(view); toast('Uploaded');
    } catch (x) { toast(x.message, true); lbl.firstChild.textContent = old; }
    inp.value = '';
  });

  /* ---------- Profile ---------- */
  function renderProfile() {
    const p = me.partner;
    $('[data-pview=profile]').innerHTML = `<form class="adm-card" data-prof style="display:grid;gap:12px;max-width:720px">
      <div class="grid2">
        <label class="fld"><span>Full name</span><input name="name" id="p-name" value="${esc(p.name)}"></label>
        <label class="fld"><span>Mobile (login)</span><input value="${esc(p.mobile)}" disabled id="p-mobile"></label>
        <label class="fld"><span>Email</span><input name="email" id="p-email" type="email" value="${esc(p.email)}"></label>
        <label class="fld"><span>City</span><input name="city" id="p-city" value="${esc(p.city)}"></label>
        <label class="fld"><span>UPI ID for payouts</span><input name="upi" id="p-upi" value="${esc(p.upi)}"></label>
        <label class="fld"><span>Driving licence no.</span><input name="dlNo" id="p-dl" value="${esc(p.dlNo)}"></label>
        <label class="fld"><span>Licence valid till</span><input name="dlExp" id="p-dlexp" type="date" value="${esc(p.dlExp)}"></label>
        <label class="fld"><span>New password (optional)</span><input name="password" id="p-pw" type="password" autocomplete="new-password" placeholder="Leave empty to keep"></label>
      </div>
      <p class="book-error" role="alert"></p>
      <button class="btn btn-primary" type="submit" style="justify-self:start">Save profile</button>
    </form>
    <div class="adm-card" style="max-width:720px;margin-top:14px"><h3 style="margin-top:0">Your papers</h3><ul class="docs">${DOCS_ME.map(([f, label]) => `<li><span>${label}<br>${p[f] ? '<span class="ok">✓ Uploaded</span>' : '<span class="miss">Missing</span>'}</span>
      <label class="btn btn-ghost btn-sm up">${p[f] ? 'Replace' : 'Upload'}<input type="file" accept="image/*,application/pdf" data-upload="partner" data-field="${f}"></label></li>`).join('')}</ul>
      <p class="muted-s" style="margin-top:10px">Your papers are stored privately and only BroDrive can see them.</p></div>`;
    const f = $('[data-prof]');
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const e = f.elements, fields = {}; ['name', 'email', 'city', 'upi', 'dlNo', 'dlExp', 'password'].forEach(k => { fields[k] = e[k].value.trim(); });
      if (!fields.password) delete fields.password;
      try { await call('pSaveProfile', { fields }); await load(); show('profile'); toast('Profile saved'); } catch (x) { $('.book-error', f).textContent = x.message; }
    });
  }

  /* ---------- Start ---------- */
  token = store.get();
  if (token && API) load().catch(() => logout());
})();
