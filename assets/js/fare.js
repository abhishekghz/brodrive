/* BroDrive shared fare engine.
 * Used by the website (browser) AND the booking API (copied into backend/Code.gs by tools/build.py),
 * so the customer and the server always agree on the price. Plain ES5 on purpose. */
var BroFare = (function () {
  'use strict';

  function inr(n) {
    var neg = n < 0, s = String(Math.round(Math.abs(n)));
    if (s.length > 3) {
      var head = s.slice(0, -3), tail = s.slice(-3), parts = [];
      while (head.length > 2) { parts.unshift(head.slice(-2)); head = head.slice(0, -2); }
      if (head) parts.unshift(head);
      s = parts.join(',') + ',' + tail;
    }
    return (neg ? '-' : '') + '₹' + s;
  }

  /* Cab with driver. trip: oneway | round | local. km = one-way distance. days = calendar days (round trip). */
  function cab(car, trip, km, days, pkg, R) {
    var lines = [], total = 0, note = '';
    if (trip === 'local') {
      var p = car.local[pkg];
      lines.push([pkg === '4h' ? '4 hrs / 40 km package' : '8 hrs / 80 km package', p]);
      total = p;
      note = 'Beyond package: ' + inr(car.km) + '/km and ' + inr(car.hr) + '/hour.';
    } else if (trip === 'oneway') {
      if (km < R.transferMaxKm) {
        lines.push(['City transfer (first ' + R.transferIncludedKm + ' km)', car.transfer]);
        var extraKm = Math.max(0, km - R.transferIncludedKm);
        if (extraKm) lines.push([extraKm + ' extra km × ' + inr(car.km), extraKm * car.km]);
        total = car.transfer + extraKm * car.km;
        note = 'Tricity & airport transfers. Waiting beyond 30 min: ' + inr(car.hr) + '/hour.';
      } else {
        var bill = Math.max(km, R.oneWayMinKm);
        lines.push([bill + ' km × ' + inr(car.km) + (km < R.oneWayMinKm ? ' (min ' + R.oneWayMinKm + ' km)' : ''), bill * car.km]);
        lines.push(['Driver allowance', car.da]);
        total = bill * car.km + car.da;
        note = 'One-way drop. Only the distance you travel is charged — no return fare.';
      }
    } else {
      var travelled = km * 2, minKm = days * R.roundMinKmPerDay, billR = Math.max(travelled, minKm);
      lines.push([billR + ' km × ' + inr(car.km) + (minKm > travelled ? ' (min ' + R.roundMinKmPerDay + ' km/day)' : ''), billR * car.km]);
      lines.push(['Driver allowance × ' + days + ' day' + (days > 1 ? 's' : ''), days * car.da]);
      total = billR * car.km + days * car.da;
      note = 'Round trip: ' + R.roundMinKmPerDay + ' km/day minimum billing. Local sightseeing at destination included in km.';
    }
    return { total: total, lines: lines, note: note };
  }

  /* Self drive. start/end are Date objects. opts: {delivery, unlimited} */
  function self(car, start, end, opts, R) {
    opts = opts || {};
    var h = (end - start) / 36e5;
    if (!(h > 0)) return { error: 'Return time must be after pickup time.' };
    if (h < R.selfMinHours) h = R.selfMinHours;
    var full = Math.floor(h / 24), rem = h - full * 24, half = 0;
    if (rem > R.graceHours) { if (rem <= 12) half = 1; else full += 1; }
    if (!full && !half) half = 1;
    var days = full + half * 0.5;
    var rent = full * car.day + half * car.half;
    var lines = [];
    var label = (full ? full + ' day' + (full > 1 ? 's' : '') : '') + (full && half ? ' + ' : '') + (half ? '12 hrs' : '');
    lines.push([label + ' rental', rent]);
    var total = rent;
    if (opts.unlimited) { var u = Math.round(rent * R.unlimitedPct / 100); lines.push(['Unlimited km (+' + R.unlimitedPct + '%)', u]); total += u; }
    var pct = days >= 30 ? R.disc30 : days >= 7 ? R.disc7 : 0;
    if (pct) { var d = Math.round(total * pct / 100); lines.push(['Long rental discount (' + pct + '%)', -d, 'disc']); total -= d; }
    if (opts.delivery) {
      var fee = days >= R.freeDeliveryDays ? 0 : R.deliveryFee;
      lines.push(['Doorstep delivery & pickup' + (fee ? '' : ' (FREE)'), fee]);
      total += fee;
    }
    var freeKm = full * R.selfKmPerDay + half * R.selfKmHalf;
    return {
      total: total, lines: lines, days: days, freeKm: opts.unlimited ? 'Unlimited' : freeKm,
      note: (opts.unlimited ? 'Unlimited km included. ' : freeKm + ' km free, then ' + inr(car.xkm) + '/km. ') +
        'Refundable security deposit ' + inr(car.dep) + '. Fuel not included (return at same level).'
    };
  }

  return { inr: inr, cab: cab, self: self };
})();
