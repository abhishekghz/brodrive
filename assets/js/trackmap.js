/* Shared helpers for the BroDrive tracking pages. Needs Leaflet (window.L) and rates.js (window.BRO). */
window.BroTrack = (function () {
  'use strict';
  var B = window.BRO, API = B.site.api;
  var CAR = '<svg viewBox="0 0 24 24" fill="#FFB703" aria-hidden="true"><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zm2.2-1h9.6l-1-3H8.2zM7.5 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm9 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function params() { var q = new URLSearchParams(location.search); return { id: q.get('id') || '', k: q.get('k') || '' }; }
  function geo(s) { var m = String(s || '').split(',').map(Number); return m.length === 2 && isFinite(m[0]) && isFinite(m[1]) && (m[0] || m[1]) ? m : null; }
  function hav(a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 12742 * Math.asin(Math.sqrt(x));
  }
  function ago(sec) {
    if (sec < 45) return 'just now';
    if (sec < 3600) return Math.round(sec / 60) + ' min ago';
    if (sec < 86400) return Math.round(sec / 3600) + ' h ago';
    return Math.round(sec / 86400) + ' d ago';
  }
  function mins(s) { var m = Math.round(s / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }

  function map(el) {
    var L = window.L;
    var m = L.map(el, { zoomControl: true }).setView([30.7333, 76.7794], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
    return m;
  }
  function icon(kind) {
    var L = window.L;
    if (kind === 'car') return L.divIcon({ className: '', html: '<div class="carpin">' + CAR + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
    if (kind === 'me') return L.divIcon({ className: '', html: '<div class="mepin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    return L.divIcon({ className: '', html: '<div class="pin ' + kind + '"></div>', iconSize: [22, 22], iconAnchor: [11, 22] });
  }
  /* Find coordinates for a place name (outstation drops have no pin). */
  function geocode(text) {
    if (!text) return Promise.resolve(null);
    return fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(text + ', India') + '&limit=1&lang=en&lat=30.73&lon=76.78')
      .then(function (r) { return r.json(); })
      .then(function (j) { var f = j.features && j.features[0]; return f ? [f.geometry.coordinates[1], f.geometry.coordinates[0]] : null; })
      .catch(function () { return null; });
  }
  function route(a, b) {
    return fetch('https://router.project-osrm.org/route/v1/driving/' + a[1] + ',' + a[0] + ';' + b[1] + ',' + b[0] + '?overview=simplified&geometries=geojson')
      .then(function (r) { return r.json(); })
      .then(function (j) { var r0 = j.routes && j.routes[0]; return r0 ? { km: r0.distance / 1000, sec: r0.duration, geometry: r0.geometry } : null; })
      .catch(function () { return null; });
  }
  function get(id, k, after) {
    return fetch(API + '?action=track&id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(k) + '&after=' + (after || 0))
      .then(function (r) { return r.json(); });
  }
  function post(data) {
    return fetch(API, { method: 'POST', body: JSON.stringify(data) }).then(function (r) { return r.json(); });
  }
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    return new Promise(function (res, rej) {
      var css = document.createElement('link'); css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      var js = document.createElement('script'); js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      js.onload = function () { res(window.L); }; js.onerror = rej; document.head.appendChild(js);
    });
  }
  /* Draw the travelled path: dashed amber before the trip, solid dark during it. */
  function drawPath(m, layers, pts) {
    var L = window.L;
    if (layers.pre) layers.pre.remove();
    if (layers.trip) layers.trip.remove();
    var pre = [], trip = [];
    pts.forEach(function (p, i) {
      (p[4] ? trip : pre).push([p[1], p[2]]);
      if (p[4] && pts[i - 1] && !pts[i - 1][4]) pre.push([p[1], p[2]]); // join the two lines
    });
    layers.pre = pre.length > 1 ? L.polyline(pre, { color: '#E08A00', weight: 4, opacity: 0.8, dashArray: '6 8' }).addTo(m) : null;
    layers.trip = trip.length > 1 ? L.polyline(trip, { color: '#0B0F17', weight: 5, opacity: 0.85 }).addTo(m) : null;
  }
  return { API: API, B: B, esc: esc, params: params, geo: geo, hav: hav, ago: ago, mins: mins, map: map, icon: icon,
    geocode: geocode, route: route, get: get, post: post, loadLeaflet: loadLeaflet, drawPath: drawPath };
})();
