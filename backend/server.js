/* ===================================================================================
 * BroDrive booking API — Google Apps Script web app
 *  - Stores bookings, vehicles and pricing rules in a Google Sheet it creates for you
 *  - Emails booking confirmations from YOUR Gmail account
 *  - Serves the live fleet & prices to the website and the admin panel
 *
 * Setup (one time): see README.md → "Connect bookings & email".
 * Script properties used:  ADMIN_KEY (required, your admin password)
 *                          OWNER_EMAIL (optional, defaults to the Google account running the script)
 *                          SHEET_ID (set automatically)
 * =================================================================================== */

var TZ = 'Asia/Kolkata';
var CATALOG_KEY = 'catalog-v2'; // bump when the catalog shape changes so old cached copies are ignored
var STATUSES = ['New', 'Confirmed', 'Ongoing', 'Completed', 'Cancelled'];
var B_COLS = ['id', 'created', 'status', 'service', 'trip', 'pickup', 'address', 'destination', 'km', 'start', 'when', 'end', 'days',
  'carId', 'carName', 'estimate', 'fareDetail', 'name', 'mobile', 'email', 'notes',
  'vehicleNo', 'driverName', 'driverPhone', 'finalFare', 'adminNotes', 'updated', 'history', 'until', 'pickupGeo', 'dropGeo'];
var V_COLS = ['type', 'id', 'name', 'models', 'seats', 'bags', 'trans', 'fuel', 'icon', 'image', 'active', 'sort',
  'km', 'da', 'hr', 'transfer', 'local4h', 'local8h', 'day', 'half', 'xkm', 'dep', 'age', 'cityBase', 'cityKm', 'cityMin'];
var F_COLS = ['regNo', 'vehicleType', 'vehicleId', 'model', 'driverName', 'driverPhone', 'active', 'notes'];
var CITY_BOX = { minLat: 30.55, maxLat: 30.92, minLng: 76.55, maxLng: 77.05 }; // Chandigarh tricity + Zirakpur/Kharar/Pinjore
var ADMIN_EDITABLE = ['status', 'vehicleNo', 'driverName', 'driverPhone', 'finalFare', 'adminNotes'];

/* ---------- Run this once from the editor (it asks for permissions) ---------- */
function setup() {
  var ss = db_();
  seed_();
  var owner = ownerEmail_();
  MailApp.sendEmail({
    to: owner, name: 'BroDrive', subject: 'BroDrive booking system is connected',
    htmlBody: wrap_('You are all set', '<p>New website bookings will be saved to your Google Sheet and emailed here.</p>' +
      '<p><a href="' + ss.getUrl() + '">Open the bookings sheet</a></p>' +
      (prop_('ADMIN_KEY') ? '' : '<p style="color:#C2410C"><b>Next step:</b> add a Script property named ADMIN_KEY (your admin password).</p>'))
  });
  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('Owner email: ' + owner);
  Logger.log(prop_('ADMIN_KEY') ? 'ADMIN_KEY is set.' : 'WARNING: ADMIN_KEY is not set yet (Project Settings → Script properties).');
}

/* ---------- HTTP entry points ---------- */
function doGet(e) {
  var a = (e && e.parameter && e.parameter.action) || '';
  try {
    if (a === 'catalog') return json_(catalog_());
    return json_({ ok: true, service: 'BroDrive API' });
  } catch (x) { return json_({ ok: false, error: msg_(x) }); }
}

function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var a = b.action;
    if (a === 'book') return json_(book_(b));
    if (a === 'catalog') return json_(catalog_());
    var fn = ADMIN[a];
    if (!fn) throw new Error('Unknown action');
    auth_(b.key);
    return json_(fn(b));
  } catch (x) {
    return json_({ ok: false, error: msg_(x) });
  }
}

/* ---------- Admin actions (password protected) ---------- */
var ADMIN = {
  login: function () {
    return { ok: true, owner: ownerEmail_(), sheetUrl: db_().getUrl() };
  },
  bookings: function () {
    var list = rows_(sheet_('Bookings', B_COLS)).map(clean_);
    list.reverse();
    return { ok: true, bookings: list.slice(0, 1500), statuses: STATUSES };
  },
  updateBooking: function (b) {
    var lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      var sh = sheet_('Bookings', B_COLS), rec = null;
      rows_(sh).forEach(function (r) { if (String(r.id) === String(b.id)) rec = r; });
      if (!rec) throw new Error('Booking not found');
      var f = b.fields || {}, changes = [];
      ADMIN_EDITABLE.forEach(function (k) {
        if (!(k in f)) return;
        var v = str_(f[k], k === 'adminNotes' ? 1000 : 120);
        if (k === 'status' && STATUSES.indexOf(v) < 0) throw new Error('Invalid status');
        if (k === 'finalFare' && v !== '' && isNaN(Number(v))) throw new Error('Final fare must be a number');
        if (String(rec[k]) !== v) { changes.push(k + ': ' + (v || '—')); rec[k] = v; }
      });
      var now = stamp_(new Date());
      rec.updated = now;
      if (changes.length) rec.history = String(rec.history || '') + '\n' + now + ' – ' + changes.join(', ');
      write_(sh, rec, B_COLS);
      var emailed = false;
      if (b.notify && rec.email) { mailCustomerUpdate_(rec); emailed = true; }
      return { ok: true, booking: clean_(rec), emailed: emailed };
    } finally { lock.releaseLock(); }
  },
  vehicles: function () {
    seed_();
    return { ok: true, vehicles: rows_(sheet_('Vehicles', V_COLS)).map(veh_) };
  },
  saveVehicle: function (b) {
    var v = b.vehicle || {};
    var type = v.type === 'self' ? 'self' : v.type === 'cab' ? 'cab' : '';
    if (!type) throw new Error('Vehicle type must be cab or self');
    var name = str_(v.name, 60);
    if (!name) throw new Error('Vehicle name is required');
    var id = str_(v.id, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      var sh = sheet_('Vehicles', V_COLS), existing = null, maxSort = 0;
      rows_(sh).forEach(function (r) {
        if (String(r.type) === type && String(r.id) === id) existing = r;
        maxSort = Math.max(maxSort, Number(r.sort) || 0);
      });
      if (b.isNew && existing) throw new Error('A ' + type + ' vehicle with id "' + id + '" already exists');
      var rec = existing || { _row: 0 };
      rec.type = type; rec.id = id; rec.name = name;
      ['models', 'seats', 'bags', 'trans', 'fuel', 'icon', 'image'].forEach(function (k) { rec[k] = str_(v[k], k === 'image' ? 500 : 80); });
      rec.active = v.active === false || v.active === 'false' ? 'FALSE' : 'TRUE';
      rec.sort = v.sort !== undefined && v.sort !== '' ? Number(v.sort) || 0 : (existing ? existing.sort : maxSort + 1);
      var nums = type === 'cab' ? ['km', 'da', 'hr', 'transfer', 'local4h', 'local8h', 'cityBase', 'cityKm', 'cityMin'] : ['day', 'half', 'xkm', 'dep', 'age'];
      if (type === 'cab') ['cityBase', 'cityKm', 'cityMin'].forEach(function (k) { if (v[k] === '' || v[k] === undefined) v[k] = 0; });
      nums.forEach(function (k) {
        var n = Number(v[k]);
        if (v[k] === '' || v[k] === undefined || isNaN(n) || n < 0) throw new Error('Please enter a valid number for ' + k);
        rec[k] = n;
      });
      write_(sh, rec, V_COLS);
      CacheService.getScriptCache().remove(CATALOG_KEY);
      return { ok: true, vehicle: veh_(rec) };
    } finally { lock.releaseLock(); }
  },
  deleteVehicle: function (b) {
    var lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      var sh = sheet_('Vehicles', V_COLS), row = 0;
      rows_(sh).forEach(function (r) { if (String(r.type) === b.type && String(r.id) === b.id) row = r._row; });
      if (!row) throw new Error('Vehicle not found');
      sh.deleteRow(row);
      CacheService.getScriptCache().remove(CATALOG_KEY);
      return { ok: true };
    } finally { lock.releaseLock(); }
  },
  fleet: function () {
    return { ok: true, fleet: rows_(sheet_('Fleet', F_COLS)).map(fleet_) };
  },
  saveFleet: function (b) {
    var f = b.car || {};
    var reg = str_(f.regNo, 20).toUpperCase().replace(/\s+/g, ' ');
    if (!reg) throw new Error('Registration number is required');
    var original = str_(b.original || reg, 20).toUpperCase().replace(/\s+/g, ' ');
    var lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      var sh = sheet_('Fleet', F_COLS), list = rows_(sh), rec = null;
      list.forEach(function (r) { if (String(r.regNo).toUpperCase() === original) rec = r; });
      if (b.isNew && rec) throw new Error(reg + ' is already in your fleet');
      if (reg !== original && list.some(function (r) { return String(r.regNo).toUpperCase() === reg; })) throw new Error(reg + ' is already in your fleet');
      rec = rec || { _row: 0 };
      rec.regNo = reg;
      rec.vehicleType = f.vehicleType === 'self' ? 'self' : 'cab';
      ['vehicleId', 'model', 'driverName', 'driverPhone', 'notes'].forEach(function (k) { rec[k] = str_(f[k], k === 'notes' ? 300 : 80); });
      rec.active = f.active === false ? 'FALSE' : 'TRUE';
      write_(sh, rec, F_COLS);
      return { ok: true, car: fleet_(rec) };
    } finally { lock.releaseLock(); }
  },
  deleteFleet: function (b) {
    var lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      var sh = sheet_('Fleet', F_COLS), row = 0;
      rows_(sh).forEach(function (r) { if (String(r.regNo).toUpperCase() === String(b.regNo).toUpperCase()) row = r._row; });
      if (!row) throw new Error('Car not found');
      sh.deleteRow(row);
      return { ok: true };
    } finally { lock.releaseLock(); }
  },
  saveRules: function (b) {
    var input = b.rules || {}, sh = sheet_('Settings', ['key', 'value']);
    var current = {};
    rows_(sh).forEach(function (r) { current[r.key] = r; });
    Object.keys(DEFAULTS.rules).forEach(function (k) {
      if (!(k in input)) return;
      var n = Number(input[k]);
      if (isNaN(n) || n < 0) throw new Error('Invalid value for ' + k);
      if (current[k]) sh.getRange(current[k]._row, 2).setValue(n);
      else sh.appendRow([k, n]);
    });
    CacheService.getScriptCache().remove(CATALOG_KEY);
    return { ok: true, rules: rules_() };
  }
};

/* ---------- Public: catalog ---------- */
function catalog_() {
  var cache = CacheService.getScriptCache(), hit = cache.get(CATALOG_KEY);
  if (hit) return JSON.parse(hit);
  seed_();
  var vs = rows_(sheet_('Vehicles', V_COLS)).map(veh_).filter(function (v) { return v.active; });
  vs.sort(function (a, b) { return a.sort - b.sort; });
  var out = {
    ok: true,
    cab: vs.filter(function (v) { return v.type === 'cab'; }),
    self: vs.filter(function (v) { return v.type === 'self'; }),
    rules: rules_(),
    updated: stamp_(new Date())
  };
  try { cache.put(CATALOG_KEY, JSON.stringify(out), 300); } catch (e) {}
  return out;
}

/* ---------- Public: create booking ---------- */
function book_(b) {
  if (b.website) return { ok: true, id: 'BD-OK' }; // honeypot: silently ignore bots
  var name = str_(b.name, 80);
  var mobile = String(b.mobile || '').replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
  var email = str_(b.email, 120);
  if (!name) throw new Error('Please enter your name.');
  if (!/^[6-9]\d{9}$/.test(mobile)) throw new Error('Please enter a valid 10-digit mobile number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');

  var cache = CacheService.getScriptCache(), rk = 'rl' + mobile, n = Number(cache.get(rk) || 0);
  if (n >= 6) throw new Error('Too many bookings from this number. Please call us instead.');
  cache.put(rk, String(n + 1), 3600);

  var cat = catalog_(), R = cat.rules, now = new Date(), res, car;
  var rec = {
    id: newId_(now), created: stamp_(now), status: 'New', name: name, mobile: mobile, email: email,
    address: str_(b.address, 250), notes: str_(b.notes, 400), history: stamp_(now) + ' – Booked on website'
  };

  if (b.service === 'city') {
    car = pick_(cat.cab, b.carId);
    if (!(car.cityKm > 0)) throw new Error('This car is not available for city rides. Please choose another.');
    var pg = geo_(b.pickupGeo), dg = geo_(b.dropGeo);
    if (!pg || !dg) throw new Error('Please set both pickup and drop locations.');
    if (!inCity_(pg) || !inCity_(dg)) throw new Error('City rides are available within Chandigarh, Mohali, Panchkula and Zirakpur. For other places please book Outstation.');
    var hv = hav_(pg, dg), ckm = Number(b.km) || 0;
    if (!(ckm >= hv * 0.9 && ckm <= hv * 3 + 3)) ckm = hv * 1.35;
    ckm = Math.max(1, Math.round(ckm * 10) / 10);
    if (ckm > R.cityMaxKm) throw new Error('This trip is longer than a city ride. Please book Outstation.');
    var st = b.when === 'later' ? parse_(b.date + 'T' + (b.time || '09:00')) : new Date(now.getTime() + 20 * 6e4);
    if (!st) throw new Error('Please choose the ride date and time.');
    if (st < new Date(now.getTime() - 2 * 36e5)) throw new Error('Pickup time is in the past.');
    res = BroFare.city(car, ckm, Number(Utilities.formatDate(st, TZ, 'HH')), R);
    rec.service = 'City ride';
    rec.trip = b.when === 'later' ? 'City ride (scheduled)' : 'City ride (ride now)';
    rec.pickup = str_(b.pickup, 150) || 'Pinned on map';
    rec.destination = str_(b.drop, 150) || 'Pinned on map';
    rec.km = ckm; rec.days = 1;
    rec.start = fmt_(st); rec.when = stamp_(st); rec.until = stamp_(new Date(st.getTime() + 2 * 36e5));
    rec.pickupGeo = pg.join(','); rec.dropGeo = dg.join(',');
  } else if (b.service === 'self') {
    car = pick_(cat.self, b.carId);
    var s = parse_(b.start), en = parse_(b.end);
    if (!s || !en) throw new Error('Please choose pickup and return date & time.');
    if (s < new Date(now.getTime() - 2 * 36e5)) throw new Error('Pickup time is in the past.');
    res = BroFare.self(car, s, en, { delivery: !!b.delivery, unlimited: !!b.unlimited }, R);
    if (res.error) throw new Error(res.error);
    rec.service = 'Self drive';
    rec.trip = 'Self drive' + (b.delivery ? ' + doorstep delivery' : '') + (b.unlimited ? ' + unlimited km' : '');
    rec.pickup = 'Chandigarh';
    rec.start = fmt_(s); rec.when = stamp_(s); rec.end = fmt_(en); rec.until = stamp_(en); rec.days = res.days;
    rec.km = res.freeKm + (res.freeKm === 'Unlimited' ? '' : ' km free');
  } else {
    car = pick_(cat.cab, b.carId);
    var trip = ['oneway', 'round', 'local'].indexOf(b.trip) >= 0 ? b.trip : 'oneway';
    var km = Math.round(Number(b.km) || 0);
    if (trip !== 'local' && !(km > 0 && km <= 5000)) throw new Error('Please choose a destination or enter the distance.');
    var d1 = parse_(b.date + 'T' + (b.time || '09:00'));
    if (!d1) throw new Error('Please choose a pickup date.');
    if (d1 < new Date(now.getTime() - 2 * 36e5)) throw new Error('Pickup time is in the past.');
    var days = 1;
    if (trip === 'round') {
      var d2 = parse_((b.rdate || b.date) + 'T00:00'), d0 = parse_(b.date + 'T00:00');
      if (d2 < d0) throw new Error('Return date can’t be before the pickup date.');
      days = Math.round((d2 - d0) / 864e5) + 1;
      rec.end = Utilities.formatDate(d2, TZ, 'EEE, d MMM yyyy');
      rec.until = stamp_(new Date(d2.getTime() + 24 * 36e5 - 6e4));
    } else {
      var hrs = trip === 'local' ? (b.pkg === '4h' ? 4 : 8) : Math.ceil(km / 40 * 2) + 1; // one way: driver's return included
      rec.until = stamp_(new Date(d1.getTime() + hrs * 36e5));
    }
    res = BroFare.cab(car, trip, km, days, b.pkg === '4h' ? '4h' : '8h', R);
    rec.service = 'Cab with driver';
    rec.trip = trip === 'oneway' ? 'One way' : trip === 'round' ? 'Round trip (' + days + ' day' + (days > 1 ? 's' : '') + ')' : 'Local ' + (b.pkg === '4h' ? '4 hrs / 40 km' : '8 hrs / 80 km');
    rec.pickup = str_(b.pickup, 80) || 'Chandigarh';
    rec.destination = trip === 'local' ? '' : str_(b.destination, 80);
    rec.km = trip === 'local' ? '' : km;
    rec.start = fmt_(d1); rec.when = stamp_(d1); rec.days = days;
  }
  rec.carId = car.id;
  rec.carName = car.name + (car.models ? ' (' + car.models + ')' : '');
  rec.estimate = res.total;
  rec.fareDetail = res.lines.map(function (l) { return l[0] + ': ' + BroFare.inr(l[1]); }).join('\n') + '\n' + res.note;
  rec.updated = rec.created;

  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { write_(sheet_('Bookings', B_COLS), rec, B_COLS); } finally { lock.releaseLock(); }

  try { mailOwnerNew_(rec); } catch (e) { console.error('owner mail failed', e); }
  var emailed = false;
  if (email) { try { mailCustomerNew_(rec); emailed = true; } catch (e) { console.error('customer mail failed', e); } }
  return { ok: true, id: rec.id, total: rec.estimate, emailed: emailed };
}

/* ---------- Emails ---------- */
function rowsHtml_(rec) {
  var rows = [
    ['Booking ID', '<b>' + esc_(rec.id) + '</b>'], ['Status', esc_(rec.status)], ['Service', esc_(rec.service)], ['Trip', esc_(rec.trip)],
    ['Pickup', esc_(rec.pickup) + (rec.address ? '<br><span style="color:#5C6578">' + esc_(rec.address) + '</span>' : '')],
    ['Drop', esc_(rec.destination) + (rec.km && rec.destination ? ' (~' + esc_(rec.km) + ' km)' : '')],
    ['Route map', rec.pickupGeo && rec.dropGeo ? '<a href="https://www.google.com/maps/dir/?api=1&origin=' + esc_(rec.pickupGeo) + '&destination=' + esc_(rec.dropGeo) + '">Open in Google Maps</a>' : ''],
    [rec.service === 'Self drive' ? 'Pickup time' : 'Date & time', esc_(rec.start)],
    [rec.service === 'Self drive' ? 'Return time' : 'Return date', esc_(rec.end)],
    ['Car', esc_(rec.carName)],
    ['Estimated fare', '<b>' + BroFare.inr(Number(rec.estimate) || 0) + '</b><br><span style="color:#5C6578;font-size:13px">' + esc_(rec.fareDetail).replace(/\n/g, '<br>') + '</span>'],
    ['Final fare', rec.finalFare ? '<b>' + BroFare.inr(Number(rec.finalFare)) + '</b>' : ''],
    ['Vehicle no.', esc_(rec.vehicleNo)], ['Driver', esc_(rec.driverName) + (rec.driverPhone ? ' · ' + esc_(rec.driverPhone) : '')],
    ['Customer', esc_(rec.name) + ' · ' + esc_(rec.mobile) + (rec.email ? ' · ' + esc_(rec.email) : '')],
    ['Notes', esc_(rec.notes)]
  ];
  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">' + rows.filter(function (r) { return r[1]; }).map(function (r) {
    return '<tr><td style="padding:8px 12px 8px 0;color:#5C6578;vertical-align:top;white-space:nowrap;border-bottom:1px solid #EEE">' + r[0] + '</td><td style="padding:8px 0;border-bottom:1px solid #EEE">' + r[1] + '</td></tr>';
  }).join('') + '</table>';
}

function wrap_(title, inner) {
  return '<div style="background:#F6F5F1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#161B26">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">' +
    '<div style="background:#0B0F17;padding:18px 24px"><span style="font:800 24px Arial,sans-serif;color:#fff">Bro<span style="color:#FFB703">Drive</span></span></div>' +
    '<div style="height:4px;background:#FFB703"></div>' +
    '<div style="padding:24px"><h2 style="margin:0 0 12px;font-size:20px">' + title + '</h2>' + inner + '</div>' +
    '<div style="padding:16px 24px;background:#FAFAF7;color:#5C6578;font-size:12px">BroDrive · Cab service &amp; self-drive cars, Chandigarh · 24×7 · Call/WhatsApp ' + esc_(DEFAULTS.phone) + '</div>' +
    '</div></div>';
}

function mailOwnerNew_(rec) {
  MailApp.sendEmail({
    to: ownerEmail_(), name: 'BroDrive Website', replyTo: rec.email || undefined,
    subject: 'New booking ' + rec.id + ' – ' + rec.name + ' – ' + rec.service + ' – ' + rec.start,
    htmlBody: wrap_('New booking received', '<p>Call the customer to confirm, then update the status in the admin panel.</p>' + rowsHtml_(rec) +
      '<p style="margin-top:18px"><a href="tel:+91' + rec.mobile + '" style="background:#FFB703;color:#0B0F17;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:bold">Call ' + esc_(rec.name) + '</a> &nbsp; ' +
      '<a href="https://wa.me/91' + rec.mobile + '" style="background:#1FAF54;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:bold">WhatsApp</a></p>')
  });
}

function mailCustomerNew_(rec) {
  MailApp.sendEmail({
    to: rec.email, name: 'BroDrive', replyTo: ownerEmail_(),
    subject: 'Booking received – ' + rec.id + ' | BroDrive',
    htmlBody: wrap_('Thanks ' + esc_(rec.name.split(' ')[0]) + ', your booking is received!',
      '<p>We’ll call you on <b>' + esc_(rec.mobile) + '</b> shortly to confirm the car and driver details. Keep your booking ID handy.</p>' +
      rowsHtml_(rec) + '<p style="color:#5C6578;font-size:13px;margin-top:16px">The fare shown is an estimate. Toll, parking, state tax and GST (cabs) are extra. Self-drive bookings need an original driving licence, Aadhaar and a refundable security deposit at pickup.</p>')
  });
}

function mailCustomerUpdate_(rec) {
  var heads = {
    Confirmed: 'Your booking is confirmed ✅', Ongoing: 'Your trip is on', Completed: 'Thanks for riding with BroDrive',
    Cancelled: 'Your booking has been cancelled', New: 'Booking update'
  };
  var intro = {
    Confirmed: '<p>Great news – your ride is confirmed. Details are below; we’ll share anything else on call/WhatsApp before pickup.</p>',
    Completed: '<p>Hope you enjoyed the ride! We’d love a quick Google review – it really helps a small business.</p>',
    Cancelled: '<p>Your booking has been cancelled. If this is unexpected, please call or WhatsApp us.</p>'
  };
  MailApp.sendEmail({
    to: rec.email, name: 'BroDrive', replyTo: ownerEmail_(),
    subject: (rec.status === 'Confirmed' ? 'Booking confirmed' : 'Booking ' + String(rec.status).toLowerCase()) + ' – ' + rec.id + ' | BroDrive',
    htmlBody: wrap_(heads[rec.status] || 'Booking update', (intro[rec.status] || '<p>Here are the latest details of your booking.</p>') + rowsHtml_(rec))
  });
}

/* ---------- Storage helpers ---------- */
function db_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { } }
  var ss = SpreadsheetApp.create('BroDrive – Bookings & Fleet');
  ss.setSpreadsheetTimeZone(TZ);
  p.setProperty('SHEET_ID', ss.getId());
  var first = ss.getSheets()[0];
  first.setName('Bookings');
  head_(first, B_COLS);
  return ss;
}

function sheet_(name, cols) {
  var ss = db_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); head_(sh, cols); return sh; }
  // Add any new columns (from app updates) to an existing sheet
  var w = sh.getLastColumn(), have = w ? sh.getRange(1, 1, 1, w).getValues()[0].map(String) : [];
  var missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
  if (missing.length) {
    sh.getRange(1, w + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#FFB703');
    sh.getRange(1, w + 1, sh.getMaxRows(), missing.length).setNumberFormat('@');
  }
  return sh;
}

function head_(sh, cols) {
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#FFB703');
  sh.setFrozenRows(1);
  sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
}

function rows_(sh) {
  var v = sh.getDataRange().getValues(), h = v.shift() || [];
  return v.map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { var x = r[j]; o[k] = x instanceof Date ? stamp_(x) : x; });
    return o;
  }).filter(function (o) { return String(o[h[0]] || o[h[1]] || '') !== ''; });
}

function write_(sh, rec, cols) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var row = head.map(function (k) { return rec[k] === undefined || rec[k] === null ? '' : rec[k]; });
  if (rec._row) sh.getRange(rec._row, 1, 1, head.length).setValues([row]);
  else { sh.appendRow(row); rec._row = sh.getLastRow(); }
}

function seed_() {
  var vs = sheet_('Vehicles', V_COLS);
  if (vs.getLastRow() < 2) {
    var rows = [], i = 0;
    DEFAULTS.cab.forEach(function (c) {
      i++; rows.push(V_COLS.map(function (k) {
        var m = { type: 'cab', active: 'TRUE', sort: i, local4h: c.local['4h'], local8h: c.local['8h'] };
        return k in m ? m[k] : (c[k] !== undefined ? c[k] : '');
      }));
    });
    DEFAULTS.self.forEach(function (c) {
      i++; rows.push(V_COLS.map(function (k) {
        var m = { type: 'self', active: 'TRUE', sort: i };
        return k in m ? m[k] : (c[k] !== undefined ? c[k] : '');
      }));
    });
    vs.getRange(2, 1, rows.length, V_COLS.length).setValues(rows);
  }
  if (!prop_('MIGRATED_CITY')) {
    var byId = {};
    DEFAULTS.cab.forEach(function (c) { byId[c.id] = c; });
    rows_(vs).forEach(function (r) {
      var d = byId[r.id];
      if (r.type === 'cab' && d && (r.cityKm === '' || r.cityKm === undefined)) {
        r.cityBase = d.cityBase; r.cityKm = d.cityKm; r.cityMin = d.cityMin; write_(vs, r, V_COLS);
      }
    });
    PropertiesService.getScriptProperties().setProperty('MIGRATED_CITY', '1');
  }
  var st = sheet_('Settings', ['key', 'value']);
  if (st.getLastRow() < 2) {
    var kv = Object.keys(DEFAULTS.rules).map(function (k) { return [k, DEFAULTS.rules[k]]; });
    st.getRange(2, 1, kv.length, 2).setValues(kv);
  }
}

function veh_(r) {
  var n = function (k) { return Number(r[k]) || 0; };
  var v = {
    type: String(r.type), id: String(r.id), name: String(r.name), models: String(r.models || ''), seats: String(r.seats || ''),
    icon: String(r.icon || 'sedan'), image: String(r.image || ''), active: String(r.active).toUpperCase() !== 'FALSE', sort: n('sort')
  };
  if (v.type === 'cab') {
    v.bags = String(r.bags || ''); v.km = n('km'); v.da = n('da'); v.hr = n('hr'); v.transfer = n('transfer');
    v.local = { '4h': n('local4h'), '8h': n('local8h') };
    v.cityBase = n('cityBase'); v.cityKm = n('cityKm'); v.cityMin = n('cityMin');
  } else {
    v.trans = String(r.trans || ''); v.fuel = String(r.fuel || ''); v.day = n('day'); v.half = n('half');
    v.xkm = n('xkm'); v.dep = n('dep'); v.age = n('age');
  }
  return v;
}

function rules_() {
  var out = JSON.parse(JSON.stringify(DEFAULTS.rules));
  rows_(sheet_('Settings', ['key', 'value'])).forEach(function (r) {
    if (r.key in out && r.value !== '' && !isNaN(Number(r.value))) out[r.key] = Number(r.value);
  });
  return out;
}

/* ---------- Small utils ---------- */
function auth_(key) {
  var k = prop_('ADMIN_KEY');
  if (!k) throw new Error('Admin password not set. In Apps Script: Project Settings → Script properties → add ADMIN_KEY.');
  if (String(key || '') !== k) { Utilities.sleep(1500); throw new Error('Wrong password'); }
}
function fleet_(r) {
  return { regNo: String(r.regNo), vehicleType: String(r.vehicleType || 'cab'), vehicleId: String(r.vehicleId || ''), model: String(r.model || ''),
    driverName: String(r.driverName || ''), driverPhone: String(r.driverPhone || ''), active: String(r.active).toUpperCase() !== 'FALSE', notes: String(r.notes || '') };
}
function geo_(s) {
  var m = String(s || '').split(',').map(Number);
  return m.length === 2 && isFinite(m[0]) && isFinite(m[1]) && Math.abs(m[0]) <= 90 && Math.abs(m[1]) <= 180 ? [Math.round(m[0] * 1e5) / 1e5, Math.round(m[1] * 1e5) / 1e5] : null;
}
function inCity_(g) { return g[0] >= CITY_BOX.minLat && g[0] <= CITY_BOX.maxLat && g[1] >= CITY_BOX.minLng && g[1] <= CITY_BOX.maxLng; }
function hav_(a, b) {
  var R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function ownerEmail_() { return prop_('OWNER_EMAIL') || Session.getEffectiveUser().getEmail(); }
function pick_(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  throw new Error('That vehicle is no longer available. Please refresh and choose again.');
}
function parse_(s) {
  s = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  var d = new Date(s + ':00+05:30');
  return isNaN(d) ? null : d;
}
function fmt_(d) { return Utilities.formatDate(d, TZ, 'EEE, d MMM yyyy, h:mm a'); }
function stamp_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm'); }
function newId_(d) {
  var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 4; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return 'BD' + Utilities.formatDate(d, TZ, 'yyMMdd') + '-' + s;
}
function str_(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max || 200); }
function esc_(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function clean_(r) { var o = {}; B_COLS.forEach(function (k) { o[k] = r[k] === undefined ? '' : r[k]; }); return o; }
function msg_(x) { return String((x && x.message) || x); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
