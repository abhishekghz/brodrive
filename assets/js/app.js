/* BroDrive — booking widget, live prices & on-site booking.
 * Needs: assets/js/rates.js (generated defaults) and assets/js/fare.js (shared fare engine). */
(function () {
  'use strict';
  var B = window.BRO, F = window.BroFare;
  if (!B || !F) return;
  var API = B.site.api || '';
  var inr = F.inr;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dtStr(d) { return dateStr(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nice(d) {
    try { return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return d.toString(); }
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- Mobile nav ---------- */
  var tgl = $('.nav-toggle');
  if (tgl) {
    tgl.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      tgl.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.site-nav a').forEach(function (a) {
      a.addEventListener('click', function () { document.body.classList.remove('nav-open'); tgl.setAttribute('aria-expanded', 'false'); });
    });
  }

  function renderEstimate(box, res, emptyMsg) {
    if (!res) { box.innerHTML = '<p class="est-empty">' + esc(emptyMsg) + '</p>'; return; }
    if (res.error) { box.innerHTML = '<p class="est-err">' + esc(res.error) + '</p>'; return; }
    var li = res.lines.map(function (l) {
      return '<li' + (l[2] ? ' class="' + l[2] + '"' : '') + '><span>' + esc(l[0]) + '</span><span>' + (l[1] < 0 ? '−' + inr(-l[1]) : inr(l[1])) + '</span></li>';
    }).join('');
    box.innerHTML = '<div class="est-total"><span>Estimated fare</span><strong>' + inr(res.total) + '</strong></div>' +
      '<ul class="est-lines">' + li + '</ul>' + (res.note ? '<p class="est-note">' + esc(res.note) + '</p>' : '');
  }

  function openWhatsApp(msg) {
    var url = 'https://wa.me/' + B.site.whatsapp + '?text=' + encodeURIComponent(msg);
    var w = window.open(url, '_blank', 'noopener');
    if (!w) location.href = url;
  }

  function cabOptions(sel) {
    var cur = sel.value;
    sel.innerHTML = B.cab.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name + ' · ' + c.seats + ' seats · ' + inr(c.km) + '/km') + '</option>'; }).join('');
    if (cur && B.cab.some(function (c) { return c.id === cur; })) sel.value = cur;
  }
  function selfOptions(sel) {
    var cur = sel.value;
    sel.innerHTML = B.self.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name + (c.models ? ' (' + c.models + ')' : '') + ' · ' + inr(c.day) + '/day') + '</option>'; }).join('');
    if (cur && B.self.some(function (c) { return c.id === cur; })) sel.value = cur;
  }

  /* ---------- Shared validation for name / mobile / email ---------- */
  function checkContact(form) {
    var e = form.elements, ok = true;
    function mark(name, bad) { var f = e[name].closest('.fld'); if (f) f.classList.toggle('invalid', bad); if (bad) ok = false; }
    var mob = String(e.mobile.value).replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
    mark('name', !e.name.value.trim());
    mark('mobile', !/^[6-9]\d{9}$/.test(mob));
    mark('email', !!e.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email.value.trim()));
    return ok;
  }

  /* ---------- Submit booking to the API (falls back to WhatsApp) ---------- */
  function submitBooking(form, payload, waMsg, summary) {
    var btn = $('button[type=submit]', form), err = $('.book-error', form);
    err.textContent = '';
    if (!API) { openWhatsApp(waMsg); return; }
    btn.disabled = true; var label = btn.innerHTML; btn.textContent = 'Booking…';
    payload.action = 'book';
    fetch(API, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Booking failed');
        showDone(form, j, payload, waMsg, summary);
      })
      .catch(function (x) {
        err.innerHTML = esc(x.message && x.message !== 'Failed to fetch' ? x.message : 'We couldn’t reach the booking server.') +
          ' <button type="button" class="linkish" data-wa-fallback>Send on WhatsApp instead</button>';
        $('[data-wa-fallback]', err).addEventListener('click', function () { openWhatsApp(waMsg); });
      })
      .then(function () { btn.disabled = false; btn.innerHTML = label; });
  }

  function showDone(form, j, payload, waMsg, summary) {
    var done = document.createElement('div');
    done.className = 'book-done';
    done.setAttribute('tabindex', '-1');
    done.innerHTML = '<div class="done-ic" aria-hidden="true">✓</div><h3>Booking received!</h3>' +
      '<p>Your booking ID is <b>' + esc(j.id) + '</b>. We’ll call you on <b>' + esc(payload.mobile) + '</b> shortly to confirm the car &amp; driver.' +
      (j.emailed ? ' A copy has been emailed to <b>' + esc(payload.email) + '</b>.' : '') + '</p>' +
      '<ul class="est-lines">' + summary.map(function (s) { return '<li><span>' + esc(s[0]) + '</span><span>' + esc(s[1]) + '</span></li>'; }).join('') +
      '<li><span>Estimated fare</span><span><b>' + inr(j.total) + '</b></span></li></ul>' +
      '<div class="book-actions"><a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/' + B.site.whatsapp + '?text=' +
      encodeURIComponent('Hi BroDrive! My booking ID is ' + j.id + '.') + '">WhatsApp us</a><button type="button" class="btn btn-ghost" data-again>New booking</button></div>';
    form.hidden = true;
    form.parentNode.insertBefore(done, form.nextSibling);
    var tabs = $('.book-tabs', form.parentNode); if (tabs) tabs.classList.add('is-hidden');
    done.focus();
    $('[data-again]', done).addEventListener('click', function () {
      done.parentNode.removeChild(done); form.hidden = false; if (tabs) tabs.classList.remove('is-hidden');
    });
  }

  /* ---------- Booking widget ---------- */
  var widgets = $$('[data-booking]');
  function initBooking(root) {
    var tabs = $$('[data-tab]', root), panes = $$('[data-pane]', root);
    function show(name) {
      tabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === name ? 'true' : 'false'); });
      panes.forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
      $$('.book-done', root).forEach(function (d) { d.parentNode.removeChild(d); });
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.getAttribute('data-tab')); }); });
    root._show = show;
    show(root.getAttribute('data-tab-default') || 'cab');

    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
    var today = dateStr(new Date());
    var submitLabel = API ? 'Confirm booking' : 'Book on WhatsApp';
    $$('[data-submit-label]', root).forEach(function (s) { s.textContent = submitLabel; });
    $$('[data-wa-alt]', root).forEach(function (el) { el.classList.toggle('is-hidden', !API); });

    /* Cab pane */
    var cf = $('[data-pane="cab"]', root);
    if (cf) {
      var e = cf.elements;
      e.date.value = dateStr(tomorrow); e.date.min = today;
      e.rdate.value = dateStr(tomorrow); e.rdate.min = today;
      var box = $('.estimate', cf), other = $('[data-other]', cf);
      var trip = function () { return (cf.querySelector('input[name=trip]:checked') || {}).value || 'oneway'; };
      var calcCab = function () {
        var t = trip();
        $$('[data-show]', cf).forEach(function (el) { el.classList.toggle('is-hidden', el.getAttribute('data-show').split(' ').indexOf(t) < 0); });
        var isOther = e.dest.value === 'other';
        other.classList.toggle('is-hidden', !(isOther && t !== 'local'));
        var car = find(B.cab, e.car.value);
        cf._km = 0; cf._days = 1;
        if (t === 'local') { cf._res = F.cab(car, t, 0, 1, e.pkg.value, B.rules); return renderEstimate(box, cf._res); }
        var opt = e.dest.options[e.dest.selectedIndex];
        var km = isOther ? parseFloat(e.km.value) : parseFloat(opt && opt.getAttribute('data-km'));
        if (!(km > 0)) { cf._res = null; return renderEstimate(box, null, isOther ? 'Enter the approximate one-way distance to see your fare.' : 'Choose a destination to see your fare.'); }
        var days = 1;
        if (t === 'round') {
          var d1 = new Date(e.date.value + 'T00:00'), d2 = new Date(e.rdate.value + 'T00:00');
          if (e.rdate.value && d2 < d1) { cf._res = { error: 'Return date can’t be before the pickup date.' }; return renderEstimate(box, cf._res); }
          if (e.rdate.value && !isNaN(d2)) days = Math.round((d2 - d1) / 864e5) + 1;
        }
        cf._km = Math.round(km); cf._days = days;
        cf._res = F.cab(car, t, cf._km, days, e.pkg.value, B.rules);
        renderEstimate(box, cf._res);
      };
      cf.addEventListener('input', calcCab);
      cf.addEventListener('change', calcCab);
      e.date.addEventListener('change', function () { if (e.rdate.value < e.date.value) e.rdate.value = e.date.value; e.rdate.min = e.date.value; calcCab(); });
      calcCab();
      root._calcCab = calcCab;

      var cabMessage = function () {
        var t = trip(), car = find(B.cab, e.car.value);
        var when = new Date(e.date.value + 'T' + (e.time.value || '09:00'));
        var tripName = { oneway: 'One Way', round: 'Round Trip (' + cf._days + ' day' + (cf._days > 1 ? 's' : '') + ')', local: 'Local (' + (e.pkg.value === '4h' ? '4 hrs/40 km' : '8 hrs/80 km') + ')' }[t];
        var dropName = e.dest.value === 'other' ? 'Other (~' + e.km.value + ' km)' : e.dest.value + ' (~' + cf._km + ' km)';
        var summary = [['Trip', tripName], ['Pickup', e.from.value || 'Chandigarh']];
        if (t !== 'local') summary.push(['Drop', dropName]);
        summary.push(['Date & time', nice(when)]);
        if (t === 'round') summary.push(['Return', e.rdate.value]);
        summary.push(['Car', car.name]);
        var m = ['Hi BroDrive! I want to book a cab.', ''].concat(summary.map(function (s) { return s[0] + ': ' + s[1]; }));
        if (e.address.value) m.push('Pickup address: ' + e.address.value);
        if (cf._res && !cf._res.error) m.push('Website estimate: ' + inr(cf._res.total) + ' + toll/parking/GST');
        if (e.name.value) m.push('Name: ' + e.name.value);
        if (e.mobile.value) m.push('Mobile: ' + e.mobile.value);
        return { text: m.join('\n'), summary: summary };
      };
      $$('[data-wa-alt]', cf).forEach(function (b) { b.addEventListener('click', function () { openWhatsApp(cabMessage().text); }); });

      cf.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var t = trip(), ok = true;
        [['date', !e.date.value], ['km', t !== 'local' && e.dest.value === 'other' && !(parseFloat(e.km.value) > 0)], ['dest', t !== 'local' && !e.dest.value]].forEach(function (c) {
          var f = e[c[0]].closest('.fld'); f.classList.toggle('invalid', c[1]); if (c[1]) ok = false;
        });
        if (API && !checkContact(cf)) ok = false;
        if (!ok) { var bad = $('.fld.invalid input, .fld.invalid select', cf); if (bad) bad.focus(); return; }
        if (cf._res && cf._res.error) return;
        var msg = cabMessage();
        submitBooking(cf, {
          service: 'cab', trip: t, pickup: e.from.value, address: e.address.value,
          destination: t === 'local' ? '' : (e.dest.value === 'other' ? 'Other' : e.dest.value), km: cf._km,
          date: e.date.value, time: e.time.value || '09:00', rdate: e.rdate.value, pkg: e.pkg.value, carId: e.car.value,
          name: e.name.value, mobile: e.mobile.value, email: e.email.value, website: e.website.value
        }, msg.text, msg.summary);
      });
    }

    /* Self-drive pane */
    var sf = $('[data-pane="self"]', root);
    if (sf) {
      var s = sf.elements;
      var ret = new Date(tomorrow); ret.setDate(ret.getDate() + 1);
      s.start.value = dtStr(tomorrow); s.end.value = dtStr(ret);
      s.start.min = dtStr(new Date());
      var sbox = $('.estimate', sf);
      var calcSelf = function () {
        var car = find(B.self, s.car.value);
        var a = new Date(s.start.value), b = new Date(s.end.value);
        if (isNaN(a) || isNaN(b)) { sf._res = null; return renderEstimate(sbox, null, 'Pick your dates to see the fare.'); }
        sf._res = F.self(car, a, b, { delivery: s.delivery.checked, unlimited: s.unlimited.checked }, B.rules);
        renderEstimate(sbox, sf._res);
      };
      sf.addEventListener('input', calcSelf);
      sf.addEventListener('change', calcSelf);
      s.start.addEventListener('change', function () {
        var a = new Date(s.start.value), b = new Date(s.end.value);
        if (!isNaN(a) && (isNaN(b) || b <= a)) { var n = new Date(a); n.setDate(n.getDate() + 1); s.end.value = dtStr(n); }
        calcSelf();
      });
      calcSelf();
      root._calcSelf = calcSelf;

      var selfMessage = function () {
        var car = find(B.self, s.car.value);
        var summary = [['Car', car.name], ['Pickup', nice(new Date(s.start.value))], ['Return', nice(new Date(s.end.value))],
          ['Delivery', s.delivery.checked ? 'Doorstep' : 'Self pickup'], ['Unlimited km', s.unlimited.checked ? 'Yes' : 'No']];
        var m = ['Hi BroDrive! I want to book a SELF-DRIVE car in Chandigarh.', ''].concat(summary.map(function (x) { return x[0] + ': ' + x[1]; }));
        if (s.address.value) m.push('Address: ' + s.address.value);
        if (sf._res && !sf._res.error) m.push('Website estimate: ' + inr(sf._res.total) + ' + refundable deposit ' + inr(car.dep));
        if (s.name.value) m.push('Name: ' + s.name.value);
        if (s.mobile.value) m.push('Mobile: ' + s.mobile.value);
        return { text: m.join('\n'), summary: summary };
      };
      $$('[data-wa-alt]', sf).forEach(function (b) { b.addEventListener('click', function () { openWhatsApp(selfMessage().text); }); });

      sf.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!sf._res || sf._res.error) return;
        if (API && !checkContact(sf)) { var bad = $('.fld.invalid input', sf); if (bad) bad.focus(); return; }
        var msg = selfMessage();
        submitBooking(sf, {
          service: 'self', carId: s.car.value, start: s.start.value, end: s.end.value,
          delivery: s.delivery.checked, unlimited: s.unlimited.checked, address: s.address.value,
          name: s.name.value, mobile: s.mobile.value, email: s.email.value, website: s.website.value
        }, msg.text, msg.summary);
      });
    }
  }
  widgets.forEach(initBooking);

  /* "Get fare" / "Book" buttons on cards pre-fill the first widget */
  $$('[data-pick]').forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      var w = widgets[0]; if (!w) return;
      ev.preventDefault();
      var parts = btn.getAttribute('data-pick').split(':');
      w._show(parts[0]);
      var form = $('[data-pane="' + parts[0] + '"]', w);
      if (form && form.elements.car) form.elements.car.value = parts[1];
      var dest = btn.getAttribute('data-dest');
      if (dest && form.elements.dest) form.elements.dest.value = dest;
      if (parts[0] === 'cab' && w._calcCab) w._calcCab();
      if (parts[0] === 'self' && w._calcSelf) w._calcSelf();
      w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* ---------- Live fleet & prices from the admin panel ---------- */
  function applyCatalog(c) {
    if (!c || !c.ok || c.empty || !c.cab || !c.self || !c.cab.length || !c.self.length) return;
    B.cab = c.cab; B.self = c.self;
    for (var k in c.rules) B.rules[k] = c.rules[k];
    widgets.forEach(function (w) {
      var cf = $('[data-pane="cab"]', w), sf = $('[data-pane="self"]', w);
      if (cf) cabOptions(cf.elements.car);
      if (sf) selfOptions(sf.elements.car);
      if (w._calcCab) w._calcCab();
      if (w._calcSelf) w._calcSelf();
    });
  }
  if (API) {
    try { var cached = JSON.parse(store('bro_catalog') || 'null'); if (cached && Date.now() - cached.t < 6e5) applyCatalog(cached.c); } catch (e) { }
    fetch(API + '?action=catalog').then(function (r) { return r.json(); }).then(function (c) {
      applyCatalog(c);
      store('bro_catalog', JSON.stringify({ t: Date.now(), c: c }));
    }).catch(function () { /* keep built-in prices */ });
  }

  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
