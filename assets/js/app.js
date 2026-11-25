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
      return '<li' + (l[2] ? ' class="' + l[2] + '"' : '') + '><span>' + esc(l[0]) + '</span><span>' + (l[1] === null ? '' : l[1] < 0 ? '\u2212' + inr(-l[1]) : inr(l[1])) + '</span></li>';
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

  /* ---------- City ride: map (OpenStreetMap + Leaflet), place search (Photon), road distance (OSRM) ---------- */
  var CITY = { lat: 30.7333, lng: 76.7794, box: [76.55, 30.55, 77.05, 30.92] };
  var leafletP = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!leafletP) leafletP = new Promise(function (res, rej) {
      var css = document.createElement('link'); css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      var js = document.createElement('script'); js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      js.onload = function () { res(window.L); }; js.onerror = rej; document.head.appendChild(js);
    });
    return leafletP;
  }
  function inBox(lat, lng) { return lng >= CITY.box[0] && lng <= CITY.box[2] && lat >= CITY.box[1] && lat <= CITY.box[3]; }
  function hav(a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 12742 * Math.asin(Math.sqrt(x));
  }
  function placeName(ft) {
    var pr = ft.properties || {};
    var main = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(' ') || pr.district || pr.city || 'Pinned location';
    var sub = [pr.street && pr.name ? pr.street : '', pr.district || pr.locality, pr.city || pr.county]
      .filter(function (x, i, a) { return x && x !== main && a.indexOf(x) === i; }).join(', ');
    return main + (sub ? ', ' + sub : '');
  }
  function reverseGeo(lat, lng) {
    return fetch('https://photon.komoot.io/reverse?lat=' + lat + '&lon=' + lng + '&lang=en').then(function (r) { return r.json(); })
      .then(function (j) { return j.features && j.features[0] ? placeName(j.features[0]) : 'Pinned location'; })
      .catch(function () { return 'Pinned location (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')'; });
  }

  function initCity(root, f) {
    var e = f.elements, mapEl = $('[data-map]', f), rides = $('[data-rides]', f), box = $('.estimate', f), err = $('.book-error', f);
    var pts = { pickup: null, drop: null }, map = null, markers = {}, line = null, routeKm = 0, seq = 0;
    var today = new Date(); e.date.value = dateStr(today); e.date.min = dateStr(today);
    function val(n) { var x = f.querySelector('input[name=' + n + ']:checked'); return x ? x.value : ''; }
    function showErr(m) { err.textContent = m; }
    function cityCars() { return B.cab.filter(function (c) { return c.cityKm > 0; }); }

    function renderRides() {
      var cur = val('car') || 'hatch', list = cityCars();
      rides.innerHTML = list.map(function (c) {
        return '<label class="ride"><input type="radio" name="car" value="' + esc(c.id) + '"' + (c.id === cur ? ' checked' : '') + '>' +
          '<svg viewBox="0 0 120 52" aria-hidden="true"><use href="#car-' + esc(c.icon || 'sedan') + '"/></svg>' +
          '<span><b>' + esc(c.name) + '</b><small>' + esc(c.seats) + ' seats · ' + esc(c.models) + '</small></span><span class="rf" data-rf="' + esc(c.id) + '">—</span></label>';
      }).join('');
      if (!val('car') && list.length) rides.querySelector('input').checked = true;
      calc();
    }
    function hour() {
      if (val('when') === 'later') return +((e.time.value || '09:00').split(':')[0]);
      return new Date(Date.now() + 20 * 6e4).getHours();
    }
    function calc() {
      $$('[data-later]', f).forEach(function (el) { el.classList.toggle('is-hidden', val('when') !== 'later'); });
      if (!(pts.pickup && pts.drop && routeKm > 0)) {
        f._res = null; $$('[data-rf]', f).forEach(function (el) { el.textContent = '—'; });
        return renderEstimate(box, null, 'Set pickup and drop to see your fare.');
      }
      if (routeKm > B.rules.cityMaxKm) {
        f._res = { error: 'That’s ' + routeKm + ' km – longer than a city ride. Please use the Outstation tab.' };
        return renderEstimate(box, f._res);
      }
      var h = hour();
      cityCars().forEach(function (c) { var el = f.querySelector('[data-rf="' + c.id + '"]'); if (el) el.textContent = inr(F.city(c, routeKm, h, B.rules).total); });
      var car = find(B.cab, val('car'));
      f._res = F.city(car, routeKm, h, B.rules);
      f._res.lines.unshift(['Distance ' + routeKm + ' km', null]);
      renderEstimate(box, f._res);
    }

    function drawMarker(k) {
      var L = window.L, p = pts[k];
      if (!map || !p) return;
      if (markers[k]) { markers[k].setLatLng([p.lat, p.lng]); return; }
      markers[k] = L.marker([p.lat, p.lng], { draggable: true, keyboard: false,
        icon: L.divIcon({ className: '', html: '<div class="pin ' + (k === 'pickup' ? 'a' : 'b') + '"></div>', iconSize: [26, 26], iconAnchor: [13, 26] }) }).addTo(map);
      markers[k].on('dragend', function (ev) { var ll = ev.target.getLatLng(); setPoint(k, ll.lat, ll.lng, null); });
    }
    function fit() {
      if (!map) return;
      var ll = ['pickup', 'drop'].filter(function (k) { return pts[k]; }).map(function (k) { return [pts[k].lat, pts[k].lng]; });
      if (ll.length === 2) map.fitBounds(ll, { padding: [36, 36], maxZoom: 15 }); else if (ll.length === 1) map.setView(ll[0], 14);
    }
    function route() {
      fit();
      if (line) { line.remove(); line = null; }
      if (!(pts.pickup && pts.drop)) { routeKm = 0; return calc(); }
      var id = ++seq, a = pts.pickup, b = pts.drop;
      routeKm = Math.max(1, Math.round(hav([a.lat, a.lng], [b.lat, b.lng]) * 13.5) / 10); // provisional: straight line x1.35
      calc();
      fetch('https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat + '?overview=simplified&geometries=geojson')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (id !== seq || !j.routes || !j.routes[0]) return;
          routeKm = Math.max(1, Math.round(j.routes[0].distance / 100) / 10);
          if (map) line = window.L.geoJSON(j.routes[0].geometry, { style: { color: '#0B0F17', weight: 4, opacity: 0.75 } }).addTo(map);
          calc();
        }).catch(function () { /* keep the straight-line estimate */ });
    }
    function setPoint(k, lat, lng, label) {
      if (!inBox(lat, lng)) { showErr('That spot is outside the tricity. For trips beyond Chandigarh, Mohali, Panchkula & Zirakpur, use the Outstation tab.'); return; }
      showErr('');
      pts[k] = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
      var mine = pts[k];
      e[k].value = label || 'Finding address…';
      if (!label) reverseGeo(lat, lng).then(function (n) { if (pts[k] === mine) e[k].value = n; });
      drawMarker(k);
      route();
    }
    function ensureMap() {
      if (map) { map.invalidateSize(); return; }
      if (f._mapLoading) return;
      f._mapLoading = true;
      loadLeaflet().then(function (L) {
        mapEl.innerHTML = '';
        map = L.map(mapEl, { scrollWheelZoom: false }).setView([CITY.lat, CITY.lng], 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
        map.on('click', function (ev) { setPoint(!pts.pickup ? 'pickup' : 'drop', ev.latlng.lat, ev.latlng.lng, null); });
        drawMarker('pickup'); drawMarker('drop'); route();
      }).catch(function () { mapEl.innerHTML = '<p class="map-hint">Map unavailable – search for places below.</p>'; });
    }
    root._ensureMap = ensureMap;

    ['pickup', 'drop'].forEach(function (k) {
      var list = $('[data-sugg="' + k + '"]', f), t, q = 0;
      e[k].addEventListener('input', function () {
        pts[k] = null; if (markers[k]) { markers[k].remove(); markers[k] = null; } route();
        clearTimeout(t);
        t = setTimeout(function () {
          var text = e[k].value.trim(), id = ++q;
          if (text.length < 3) { list.innerHTML = ''; return; }
          fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(text) + '&limit=6&lang=en&lat=' + CITY.lat + '&lon=' + CITY.lng + '&bbox=' + CITY.box.join(','))
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (id !== q) return;
              var items = (j.features || []).filter(function (ft) { var c = ft.geometry.coordinates; return inBox(c[1], c[0]); });
              list._items = items;
              list.innerHTML = items.length ? items.map(function (ft, i) {
                var n = placeName(ft).split(', '), main = n.shift();
                return '<li role="option" data-i="' + i + '">' + esc(main) + (n.length ? '<small>' + esc(n.join(', ')) + '</small>' : '') + '</li>';
              }).join('') : '<li aria-disabled="true"><small>No matches in the tricity – try a nearby landmark or tap the map</small></li>';
            }).catch(function () { list.innerHTML = ''; });
        }, 350);
      });
      list.addEventListener('click', function (ev) {
        var li = ev.target.closest('li[data-i]'); if (!li) return;
        var ft = list._items[+li.getAttribute('data-i')], c = ft.geometry.coordinates;
        list.innerHTML = ''; ensureMap(); setPoint(k, c[1], c[0], placeName(ft));
      });
      e[k].addEventListener('blur', function () { setTimeout(function () { list.innerHTML = ''; }, 250); });
    });

    $('[data-locate]', f).addEventListener('click', function () {
      var btn = this;
      if (!navigator.geolocation) return showErr('Location isn’t available on this device – please search instead.');
      btn.classList.add('busy');
      navigator.geolocation.getCurrentPosition(function (pos) {
        btn.classList.remove('busy'); ensureMap(); setPoint('pickup', pos.coords.latitude, pos.coords.longitude, null);
      }, function () {
        btn.classList.remove('busy'); showErr('Couldn’t get your location. Please allow location access, or search / tap the map.');
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });

    f.addEventListener('change', calc);
    e.time.addEventListener('input', calc);

    function message() {
      var car = find(B.cab, val('car'));
      var whenTxt = val('when') === 'later' ? nice(new Date(e.date.value + 'T' + (e.time.value || '09:00'))) : 'Now (as soon as possible)';
      var summary = [['Ride', car.name], ['Pickup', e.pickup.value], ['Drop', e.drop.value], ['Distance', routeKm + ' km'], ['When', whenTxt]];
      var m = ['Hi BroDrive! I want a CITY RIDE.', ''].concat(summary.map(function (x) { return x[0] + ': ' + x[1]; }));
      if (pts.pickup && pts.drop) m.push('Route: https://www.google.com/maps/dir/?api=1&origin=' + pts.pickup.lat + ',' + pts.pickup.lng + '&destination=' + pts.drop.lat + ',' + pts.drop.lng);
      if (f._res && !f._res.error) m.push('Website estimate: ' + inr(f._res.total));
      if (e.name.value) m.push('Name: ' + e.name.value);
      if (e.mobile.value) m.push('Mobile: ' + e.mobile.value);
      return { text: m.join('\n'), summary: summary, car: car };
    }
    $$('[data-wa-alt]', f).forEach(function (b) { b.addEventListener('click', function () { openWhatsApp(message().text); }); });

    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!(pts.pickup && pts.drop)) { showErr('Please set both pickup and drop (search, use your location, or tap the map).'); return; }
      if (!f._res || f._res.error) return;
      if (val('when') === 'later' && !e.date.value) { e.date.closest('.fld').classList.add('invalid'); return; }
      if (API && !checkContact(f)) { var bad = $('.fld.invalid input', f); if (bad) bad.focus(); return; }
      var msg = message();
      submitBooking(f, {
        service: 'city', pickup: e.pickup.value, drop: e.drop.value,
        pickupGeo: pts.pickup.lat + ',' + pts.pickup.lng, dropGeo: pts.drop.lat + ',' + pts.drop.lng, km: routeKm,
        when: val('when'), date: e.date.value, time: e.time.value || '09:00', carId: msg.car.id,
        name: e.name.value, mobile: e.mobile.value, email: e.email.value, website: e.website.value
      }, msg.text, msg.summary);
    });

    root._renderRides = renderRides;
    renderRides();
    if (!f.hidden) {
      var go = function () { setTimeout(ensureMap, 400); };
      if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
    }
  }

  /* ---------- Booking widget ---------- */
  var widgets = $$('[data-booking]');
  function initBooking(root) {
    var tabs = $$('[data-tab]', root), panes = $$('[data-pane]', root);
    function show(name) {
      tabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === name ? 'true' : 'false'); });
      panes.forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== name; });
      $$('.book-done', root).forEach(function (d) { d.parentNode.removeChild(d); });
      if (name === 'city' && root._ensureMap) root._ensureMap();
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.getAttribute('data-tab')); }); });
    root._show = show;
    show(root.getAttribute('data-tab-default') || 'cab');

    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
    var today = dateStr(new Date());
    var submitLabel = API ? 'Confirm booking' : 'Book on WhatsApp';
    $$('[data-submit-label]', root).forEach(function (s) { s.textContent = submitLabel; });
    $$('[data-wa-alt]', root).forEach(function (el) { el.classList.toggle('is-hidden', !API); });

    var cityPane = $('[data-pane="city"]', root);
    if (cityPane) initCity(root, cityPane);

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
    var old = {}; B.cab.forEach(function (v) { old[v.id] = v; });
    c.cab.forEach(function (v) { ['cityBase', 'cityKm', 'cityMin'].forEach(function (k) { if (v[k] === undefined && old[v.id]) v[k] = old[v.id][k]; }); });
    B.cab = c.cab; B.self = c.self;
    for (var k in c.rules) B.rules[k] = c.rules[k];
    widgets.forEach(function (w) {
      var cf = $('[data-pane="cab"]', w), sf = $('[data-pane="self"]', w);
      if (cf) cabOptions(cf.elements.car);
      if (sf) selfOptions(sf.elements.car);
      if (w._calcCab) w._calcCab();
      if (w._calcSelf) w._calcSelf();
      if (w._renderRides) w._renderRides();
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
