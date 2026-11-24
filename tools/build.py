#!/usr/bin/env python3
"""
BroDrive static site generator.

Everything you will want to change lives at the top of this file:
  SITE  – business name, phone/WhatsApp, address, live website URL
  CAB_CARS / SELF_CARS / RULES – every price on the site
  PLACES – destinations + distances shown in the fare calculator

After editing, run from the repo root:
    python3 tools/build.py
It rewrites every .html page, assets/js/rates.js, sitemap.xml and robots.txt.
No packages needed – plain Python 3.
"""
import json, os, html, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAY = datetime.date.today().isoformat()

# --------------------------------------------------------------------------------------
# 1. BUSINESS DETAILS  (replace the placeholders before you share the site!)
# --------------------------------------------------------------------------------------
SITE = {
    "name": "BroDrive",
    "tagline": "Cab service & self-drive cars in Chandigarh",
    # Live URL, no trailing slash. After moving to GoDaddy change to e.g. "https://www.brodrive.in"
    "base_url": "https://abhishekghz.github.io/brodrive",
    "phone_display": "+91 62021 23608",   # shown on the site
    "phone": "+916202123608",             # used for tel: links, format +91XXXXXXXXXX
    "whatsapp": "916202123608",           # WhatsApp number, digits only with 91 prefix
    # Booking API (Google Apps Script web app URL, ends in /exec). Empty = bookings go to WhatsApp only.
    "api_url": "",
    "email": "",                          # optional, e.g. "book@brodrive.in"
    "street": "",                         # optional office address, e.g. "SCO 12, Sector 22-C"
    "city": "Chandigarh",
    "region": "Chandigarh",
    "postal": "160022",
    "lat": 30.7333, "lng": 76.7794,
    "google_verification": "",            # paste the code from Google Search Console here
    "instagram": "", "facebook": "",
}

# --------------------------------------------------------------------------------------
# 2. RATE CARD  (benchmarked against Chandigarh operators, Nov 2026)
# --------------------------------------------------------------------------------------
# Cab with driver.  km = ₹ per km (outstation), da = driver allowance per day,
# hr = extra hour (local/waiting), transfer = flat city/airport transfer (first 25 km),
# local = hourly packages within tricity.
CAB_CARS = [
    dict(id="hatch",  name="Hatchback",       models="WagonR, Swift, Celerio",   seats="4+1",  bags="2 bags", icon="hatch", km=11, da=300, hr=130, transfer=549,  local={"4h": 999,  "8h": 1799}),
    dict(id="sedan",  name="Sedan",           models="Dzire, Aura, Etios",       seats="4+1",  bags="3 bags", icon="sedan", km=12, da=300, hr=150, transfer=649,  local={"4h": 1199, "8h": 1999}),
    dict(id="suv",    name="SUV / MUV",       models="Ertiga, Carens, Rumion",   seats="6+1",  bags="3 bags", icon="suv",   km=15, da=300, hr=200, transfer=899,  local={"4h": 1599, "8h": 2699}),
    dict(id="innova", name="Innova",          models="Toyota Innova",            seats="7+1",  bags="4 bags", icon="suv",   km=17, da=300, hr=250, transfer=1099, local={"4h": 1899, "8h": 3199}),
    dict(id="crysta", name="Innova Crysta",   models="Innova Crysta / Hycross",  seats="7+1",  bags="4 bags", icon="suv",   km=19, da=400, hr=275, transfer=1299, local={"4h": 2199, "8h": 3699}),
    dict(id="tempo",  name="Tempo Traveller", models="Force Traveller 12-seater", seats="12+1", bags="8 bags", icon="van",   km=26, da=500, hr=400, transfer=1999, local={"4h": 3299, "8h": 5499}),
]
# Self drive (Chandigarh only).  day = 24 hrs, half = 12 hrs, xkm = extra km beyond cap,
# dep = refundable security deposit, age = minimum driver age.
SELF_CARS = [
    dict(id="hatch",  name="Hatchback",     models="Swift, Baleno, i20",     seats="5",   trans="Manual",        fuel="Petrol",          icon="hatch", day=1799, half=1199, xkm=9,  dep=5000,  age=21),
    dict(id="sedan",  name="Sedan",         models="Dzire, Amaze, City",     seats="5",   trans="Manual / Auto", fuel="Petrol",          icon="sedan", day=2299, half=1499, xkm=10, dep=5000,  age=21),
    dict(id="csuv",   name="Compact SUV",   models="Brezza, Venue, Nexon",   seats="5",   trans="Manual / Auto", fuel="Petrol / Diesel", icon="suv",   day=2799, half=1799, xkm=11, dep=7500,  age=21),
    dict(id="suv",    name="SUV",           models="Creta, Seltos",          seats="5",   trans="Automatic",     fuel="Petrol / Diesel", icon="suv",   day=3499, half=2299, xkm=12, dep=10000, age=23),
    dict(id="thar",   name="Thar 4x4",      models="Mahindra Thar / Roxx",   seats="4–5", trans="Manual / Auto", fuel="Diesel",          icon="jeep",  day=4499, half=2999, xkm=14, dep=15000, age=23),
    dict(id="xuv",    name="7-Seater SUV",  models="XUV700, Scorpio-N",      seats="7",   trans="Manual / Auto", fuel="Diesel",          icon="suv",   day=4999, half=3299, xkm=14, dep=15000, age=23),
    dict(id="crysta", name="Innova Crysta", models="Toyota Innova Crysta",   seats="7",   trans="Manual",        fuel="Diesel",          icon="suv",   day=5499, half=3599, xkm=15, dep=15000, age=25),
]
RULES = dict(
    oneWayMinKm=130,        # outstation one-way minimum billing
    roundMinKmPerDay=250,   # round trip minimum km per calendar day
    transferMaxKm=40,       # below this a one-way is a city/airport transfer
    transferIncludedKm=25,  # km included in transfer price
    nightCharge=250,        # driving between 10 PM and 6 AM
    gst=5,                  # GST % on cab service
    selfMinHours=12, selfKmPerDay=240, selfKmHalf=120, graceHours=0.5,
    unlimitedPct=40,        # unlimited km add-on, % of rental
    disc7=10, disc30=20,    # long-rental discount %
    deliveryFee=399, freeDeliveryDays=3,
    lateFeePerHour=300, cleaningFee=500, smokingFee=2000, refuelFee=100,
)
# Destinations for the calculator: (name, approx road km from Chandigarh)
PLACES = [
    ("Mohali", 10), ("Panchkula", 10), ("Chandigarh Airport (IXC)", 15), ("Zirakpur", 15), ("Kharar", 20),
    ("Pinjore", 22), ("Kalka", 28), ("Ropar", 45), ("Ambala", 50), ("Kasauli", 60), ("Patiala", 70),
    ("Solan", 70), ("Kurukshetra", 90), ("Ludhiana", 100), ("Yamunanagar", 100), ("Shimla", 115),
    ("Karnal", 125), ("Anandpur Sahib", 85), ("Jalandhar", 150), ("Panipat", 160), ("Dehradun", 170),
    ("Mussoorie", 205), ("Haridwar", 205), ("Rishikesh", 220), ("Bathinda", 220), ("Amritsar", 230),
    ("Dharamshala", 240), ("Hisar", 250), ("Delhi", 250), ("Delhi Airport (IGI)", 255), ("Kullu", 260),
    ("Gurugram", 270), ("Noida", 270), ("Manali", 300), ("Katra", 330), ("Jaipur", 520),
]
PLACES.sort(key=lambda p: p[1])

# Snapshot of the defaults above (seeded into the booking API the first time it runs)
import copy
DEFAULTS = copy.deepcopy({"cab": CAB_CARS, "self": SELF_CARS, "rules": RULES})

def load_live():
    """If the booking API is connected, use the fleet & prices saved in the admin panel."""
    if not SITE["api_url"]:
        return
    try:
        import urllib.request
        with urllib.request.urlopen(SITE["api_url"] + "?action=catalog", timeout=30) as r:
            d = json.load(r)
        if d.get("ok") and d.get("cab") and d.get("self"):
            CAB_CARS[:] = d["cab"]; SELF_CARS[:] = d["self"]
            RULES.update({k: v for k, v in d.get("rules", {}).items() if k in RULES})
            print(f"Using live prices from admin panel ({len(CAB_CARS)} cab + {len(SELF_CARS)} self-drive vehicles)")
    except Exception as ex:
        print("Live prices unavailable, using defaults:", ex)

load_live()
# Cheapest / dearest values for "from ₹X" copy
CHEAP_CAB = {"km": min(c["km"] for c in CAB_CARS), "local": {k: min(c["local"][k] for c in CAB_CARS) for k in ("4h", "8h")}}
CHEAP_SELF = {k: min(c[k] for c in SELF_CARS) for k in ("day", "half", "xkm", "dep")}
TOP_SELF = {k: max(c[k] for c in SELF_CARS) for k in ("day", "xkm", "dep")}


# --------------------------------------------------------------------------------------
# Fare helpers (mirror of assets/js/app.js)
# --------------------------------------------------------------------------------------
def oneway(car, km):
    if km < RULES["transferMaxKm"]:
        return car["transfer"] + max(0, km - RULES["transferIncludedKm"]) * car["km"]
    return max(km, RULES["oneWayMinKm"]) * car["km"] + car["da"]

def roundtrip(car, km, days):
    return max(km * 2, days * RULES["roundMinKmPerDay"]) * car["km"] + days * car["da"]

def inr(n):
    s = str(int(round(n)))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:]); head = head[:-2]
        if head: parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return "₹" + s

def km_of(name):
    return dict(PLACES)[name]

e = html.escape
# Named lookups used in page copy; fall back to defaults if a vehicle was removed in the admin panel
CAB = {**{c["id"]: c for c in DEFAULTS["cab"]}, **{c["id"]: c for c in CAB_CARS}}
SELF = {**{c["id"]: c for c in DEFAULTS["self"]}, **{c["id"]: c for c in SELF_CARS}}


# --------------------------------------------------------------------------------------
# SVG bits
# --------------------------------------------------------------------------------------
MARK = ('<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#FFB703"/>'
        '<path d="M28 15h11.5a8.5 8.5 0 0 1 0 17H28zM28 32h13.5a8.5 8.5 0 0 1 0 17H28z" fill="none" stroke="#0B0F17" stroke-width="6.5" stroke-linejoin="round"/>'
        '<path d="M10 24h8M7 32h11M10 40h8" stroke="#0B0F17" stroke-width="4" stroke-linecap="round"/></svg>')

WHEELS = '<circle cx="{a}" cy="40" r="8.5" fill="#0B0F17"/><circle cx="{a}" cy="40" r="3.5" fill="#D9DDE4"/><circle cx="{b}" cy="40" r="8.5" fill="#0B0F17"/><circle cx="{b}" cy="40" r="3.5" fill="#D9DDE4"/>'
SPRITE = (
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true">'
    '<symbol id="car-hatch" viewBox="0 0 120 52"><path fill="currentColor" d="M10 40v-6c0-4 2-6 6-7l16-4 12-11c2-2 4-3 7-3h29c3 0 5 1 7 3l9 12 6 2c3 1 4 3 4 6v8z"/>'
    '<path fill="#0B0F17" opacity=".82" d="M47 13h15v11H36zM66 13h14c2 0 3 .5 4 2l6 9H66z"/>' + WHEELS.format(a=30, b=88) + '</symbol>'
    '<symbol id="car-sedan" viewBox="0 0 120 52"><path fill="currentColor" d="M5 40v-5c0-4 2-6 6-7l20-4 14-11c2-1.6 4-2.4 7-2.4h24c3 0 5 1 7 3l11 10 15 3c4 1 6 3 6 7v6z"/>'
    '<path fill="#0B0F17" opacity=".82" d="M49 14h12v10H37zM65 14h11c2 0 3 .5 4 1.5l8 8.5H65z"/>' + WHEELS.format(a=28, b=94) + '</symbol>'
    '<symbol id="car-suv" viewBox="0 0 120 52"><path fill="currentColor" d="M6 40v-9c0-3 2-5 5-6l18-4 11-12c2-2 4-3 7-3h45c3 0 5 1 6 3l7 13 7 2c3 1 4 3 4 6v10z"/>'
    '<path fill="#0B0F17" opacity=".82" d="M45 10h17v11H35zM66 10h20c2 0 3 1 4 2l5 9H66z"/>' + WHEELS.format(a=30, b=92) + '</symbol>'
    '<symbol id="car-jeep" viewBox="0 0 120 52"><path fill="currentColor" d="M8 40V27c0-2 1-3 3-3h22l7-14c1-2 2-3 4-3h44c2 0 3 1 3 3v14h20c2 0 3 1 3 3v13z"/>'
    '<rect x="108" y="22" width="7" height="16" rx="3" fill="#0B0F17"/><path fill="#0B0F17" opacity=".82" d="M45 11h17v11H38zM66 11h18v11H66z"/>' + WHEELS.format(a=28, b=90) + '</symbol>'
    '<symbol id="car-van" viewBox="0 0 120 52"><path fill="currentColor" d="M4 40v-9c0-3 1-5 3-7l12-14c2-2 4-3 7-3h83c4 0 7 3 7 7v26z"/>'
    '<path fill="#0B0F17" opacity=".82" d="M22 12h14v12H12zM40 12h16v12H40zM60 12h16v12H60zM80 12h16v12H80zM100 12h9v12h-9z"/>' + WHEELS.format(a=26, b=96) + '</symbol>'
    '<symbol id="car-bike" viewBox="0 0 120 52"><circle cx="28" cy="38" r="11" fill="none" stroke="#0B0F17" stroke-width="5"/><circle cx="92" cy="38" r="11" fill="none" stroke="#0B0F17" stroke-width="5"/>'
    '<path fill="currentColor" d="M40 34h28l10-14h10l-6-8h10l8 12-6 2-12 8H40c-4 0-6-2-6-4s2-4 6-4z"/><path fill="currentColor" d="M44 22h22l-4 10H40z"/><rect x="50" y="16" width="16" height="6" rx="3" fill="#0B0F17"/></symbol>'
    '</svg>'
)

def car_visual(c):
    if c.get("image"):
        return f'<img src="{e(c["image"])}" alt="{e(c["name"])}" loading="lazy">'
    return car_svg(c.get("icon") or "sedan")

def car_svg(icon, cls=""):
    return f'<svg class="{cls}" viewBox="0 0 120 52" aria-hidden="true"><use href="#car-{icon}"/></svg>'

ICONS = {
    "check": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    "phone": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    "wa": '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3c.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
    "shield": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    "tag": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/></svg>',
    "clock": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    "user": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    "spark": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
    "key": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/></svg>',
}


# --------------------------------------------------------------------------------------
# Shared components
# --------------------------------------------------------------------------------------
def tel():
    return "tel:" + SITE["phone"]

def wa(text="Hi BroDrive! I want to book a ride."):
    from urllib.parse import quote
    return f"https://wa.me/{SITE['whatsapp']}?text={quote(text)}"

NAV = [("self-drive-car-rental-chandigarh/", "Self Drive"), ("car-rental-with-driver/", "Cab with Driver"),
       ("rates/", "Rates"), ("#areas", "Areas"), ("#contact", "Contact")]

def header(p, path):
    links = []
    for href, label in NAV:
        url = (p + href) if not href.startswith("#") else (p + href if path == "" else p + href)
        cur = ' aria-current="page"' if href == path else ""
        links.append(f'<a href="{url}"{cur}>{label}</a>')
    return f'''<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="container hdr">
  <a class="brand" href="{p}" aria-label="BroDrive home">{MARK}<span class="brand-word">Bro<b>Drive</b></span></a>
  <nav class="site-nav" aria-label="Main">{"".join(links)}</nav>
  <a class="btn btn-primary btn-sm hdr-call" href="{tel()}">{ICONS["phone"]}Call 24×7</a>
  <button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false"><span></span></button>
</div></header>'''

def footer(p):
    cities = "".join(f'<li><a href="{p}{c["slug"]}/">{c["short"]}</a></li>' for c in CITIES)
    routes = "".join(f'<li><a href="{p}{r["slug"]}/">Chandigarh to {r["to"]}</a></li>' for r in ROUTES)
    contact = [f'<li><a href="{tel()}">{e(SITE["phone_display"])}</a></li>',
               f'<li><a href="{wa()}" rel="noopener">WhatsApp us</a></li>']
    if SITE["email"]:
        contact.append(f'<li><a href="mailto:{SITE["email"]}">{e(SITE["email"])}</a></li>')
    addr = ", ".join(x for x in [SITE["street"], SITE["city"]] if x)
    contact.append(f"<li>{e(addr)}</li><li>Open 24 hours, 7 days</li>")
    return f'''<footer class="site-footer" id="contact"><div class="container">
  <div class="ft-grid">
    <div class="ft-brand"><a class="brand" href="{p}" aria-label="BroDrive home">{MARK}<span class="brand-word">Bro<b>Drive</b></span></a>
      <p style="margin-top:14px">Cab service, outstation taxis and self-drive car rental in Chandigarh, Panchkula, Mohali, Punjab &amp; Haryana. Honest fares, clean cars, a bro on call 24×7.</p></div>
    <div><h4>Services</h4><ul>
      <li><a href="{p}self-drive-car-rental-chandigarh/">Self drive cars Chandigarh</a></li>
      <li><a href="{p}car-rental-with-driver/">Car rental with driver</a></li>
      <li><a href="{p}car-rental-with-driver/#oneway">One way cabs</a></li>
      <li><a href="{p}car-rental-with-driver/#local">Local hourly taxi</a></li>
      <li><a href="{p}rates/">Rate card</a></li>
      <li><a href="{p}terms/">Policies &amp; terms</a></li></ul></div>
    <div><h4>Areas we serve</h4><ul>{cities}</ul></div>
    <div><h4>Popular routes</h4><ul>{routes}</ul></div>
    <div><h4>Book a ride</h4><ul>{"".join(contact)}</ul></div>
  </div>
  <div class="ft-bottom"><span>© <span data-year>{datetime.date.today().year}</span> BroDrive. All rights reserved.</span><span>Fares are estimates; toll, parking, state tax &amp; GST extra.</span></div>
</div></footer>
<div class="mbar"><a class="btn btn-ghost" href="{tel()}">{ICONS["phone"]}Call</a><a class="btn btn-wa" href="{wa()}" rel="noopener">{ICONS["wa"]}WhatsApp</a><a class="btn btn-primary" href="#book">Get fare</a></div>'''

def booking(tab="cab", from_city="Chandigarh", dest=None, cab_car="sedan", self_car="sedan", trip="oneway"):
    dest_opts = ['<option value="">Select destination</option>']
    for name, km in PLACES:
        sel = " selected" if name == dest else ""
        dest_opts.append(f'<option value="{e(name)}" data-km="{km}"{sel}>{e(name)} · {km} km</option>')
    dest_opts.append('<option value="other">Other – enter distance</option>')
    cab_opts = "".join(f'<option value="{c["id"]}"{" selected" if c["id"] == cab_car else ""}>{c["name"]} · {c["seats"]} seats · ₹{c["km"]}/km</option>' for c in CAB_CARS)
    self_opts = "".join(f'<option value="{c["id"]}"{" selected" if c["id"] == self_car else ""}>{c["name"]} ({c["models"]}) · {inr(c["day"])}/day</option>' for c in SELF_CARS)
    def chk(v): return " checked" if v == trip else ""
    return f'''<div class="book-card" id="book" data-booking data-tab-default="{tab}">
  <div class="book-tabs" role="tablist" aria-label="Booking type">
    <button type="button" role="tab" data-tab="cab" aria-selected="true">Cab with Driver<small>One way · Round trip · Local</small></button>
    <button type="button" role="tab" data-tab="self" aria-selected="false">Self Drive<small>Chandigarh only</small></button>
  </div>
  <form class="book-pane" data-pane="cab" novalidate>
    <div class="seg" role="radiogroup" aria-label="Trip type">
      <label><input type="radio" name="trip" value="oneway"{chk("oneway")}><span>One Way</span></label>
      <label><input type="radio" name="trip" value="round"{chk("round")}><span>Round Trip</span></label>
      <label><input type="radio" name="trip" value="local"{chk("local")}><span>Local</span></label>
    </div>
    <div class="grid2">
      <label class="fld"><span>Pickup city</span><input name="from" value="{e(from_city)}" placeholder="Your city / area" autocomplete="address-level2"></label>
      <label class="fld" data-show="oneway round"><span>Drop / destination</span><select name="dest">{"".join(dest_opts)}</select></label>
      <label class="fld" data-show="local"><span>Package</span><select name="pkg"><option value="8h">8 hrs / 80 km</option><option value="4h">4 hrs / 40 km</option></select></label>
      <label class="fld full is-hidden" data-other><span>Approx. one-way distance (km)</span><input type="number" name="km" min="1" max="3000" inputmode="numeric" placeholder="e.g. 180"></label>
      <label class="fld"><span>Pickup date</span><input type="date" name="date" required></label>
      <label class="fld"><span>Pickup time</span><input type="time" name="time" value="09:00"></label>
      <label class="fld full" data-show="round"><span>Return date</span><input type="date" name="rdate"></label>
      <label class="fld full"><span>Car type</span><select name="car">{cab_opts}</select></label>
      <label class="fld full"><span>Pickup address</span><input name="address" autocomplete="street-address" placeholder="House / sector / landmark"></label>
      <label class="fld"><span>Your name *</span><input name="name" autocomplete="name" placeholder="Name" required></label>
      <label class="fld"><span>Mobile *</span><input type="tel" name="mobile" autocomplete="tel" inputmode="tel" placeholder="10-digit mobile" required></label>
      <label class="fld full"><span>Email (for booking confirmation)</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com"></label>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    </div>
    <div class="estimate" aria-live="polite"><p class="est-empty">Choose a destination to see your fare.</p></div>
    <p class="book-error" role="alert"></p>
    <div class="book-actions"><button type="submit" class="btn btn-primary"><span data-submit-label>{"Confirm booking" if SITE["api_url"] else "Book on WhatsApp"}</span></button><a class="btn btn-ghost" href="{tel()}" aria-label="Call BroDrive">{ICONS["phone"]}Call</a></div>
    <button type="button" class="linkish wa-alt{"" if SITE["api_url"] else " is-hidden"}" data-wa-alt>{ICONS["wa"]}Prefer WhatsApp? Send these details on WhatsApp</button>
    <p class="fineprint">Toll, parking, state entry tax &amp; {RULES["gst"]}% GST extra. Night driving (10 PM–6 AM) {inr(RULES["nightCharge"])}/night. Final fare confirmed on booking.</p>
  </form>
  <form class="book-pane" data-pane="self" hidden novalidate>
    <div class="grid2">
      <label class="fld full"><span>Choose car</span><select name="car">{self_opts}</select></label>
      <label class="fld"><span>Pickup date &amp; time</span><input type="datetime-local" name="start" required></label>
      <label class="fld"><span>Return date &amp; time</span><input type="datetime-local" name="end" required></label>
      <div class="fld full"><div class="checks">
        <label class="chk"><input type="checkbox" name="delivery"> Doorstep delivery in Chandigarh ({inr(RULES["deliveryFee"])}, free on {RULES["freeDeliveryDays"]}+ days)</label>
        <label class="chk"><input type="checkbox" name="unlimited"> Unlimited km (+{RULES["unlimitedPct"]}%)</label>
      </div></div>
      <label class="fld full"><span>Delivery address (if doorstep delivery)</span><input name="address" autocomplete="street-address" placeholder="House / sector, Chandigarh"></label>
      <label class="fld"><span>Your name *</span><input name="name" autocomplete="name" placeholder="Name" required></label>
      <label class="fld"><span>Mobile *</span><input type="tel" name="mobile" autocomplete="tel" inputmode="tel" placeholder="10-digit mobile" required></label>
      <label class="fld full"><span>Email (for booking confirmation)</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com"></label>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    </div>
    <div class="estimate" aria-live="polite"><p class="est-empty">Pick your dates to see the fare.</p></div>
    <p class="book-error" role="alert"></p>
    <div class="book-actions"><button type="submit" class="btn btn-primary"><span data-submit-label>{"Confirm booking" if SITE["api_url"] else "Book on WhatsApp"}</span></button><a class="btn btn-ghost" href="{tel()}" aria-label="Call BroDrive">{ICONS["phone"]}Call</a></div>
    <button type="button" class="linkish wa-alt{"" if SITE["api_url"] else " is-hidden"}" data-wa-alt>{ICONS["wa"]}Prefer WhatsApp? Send these details on WhatsApp</button>
    <p class="fineprint">Pickup &amp; return in Chandigarh. Original driving licence + Aadhaar required. Fuel not included. Refundable deposit collected at pickup.</p>
  </form>
</div>'''

def cab_cards(p, dest=None):
    out = []
    for c in CAB_CARS:
        extra = f'<li>Chandigarh → {e(dest)} one way <b>{inr(oneway(c, km_of(dest)))}</b></li>' if dest else ""
        out.append(f'''<article class="car">
  <div class="car-ico">{car_visual(c)}</div>
  <h3>{c["name"]}</h3><div class="models">{c["models"]} or similar</div>
  <div class="price">₹{c["km"]}<small>/km outstation</small></div>
  <ul class="specs">
    <li>Seats <b>{c["seats"]} · {c["bags"]}</b></li>
    <li>Local 8 hrs / 80 km <b>{inr(c["local"]["8h"])}</b></li>
    <li>Airport / city transfer <b>{inr(c["transfer"])}</b></li>
    <li>Driver allowance <b>{inr(c["da"])}/day</b></li>
    {extra}
  </ul>
  <a class="btn btn-dark" href="#book" data-pick="cab:{c["id"]}"{f' data-dest="{e(dest)}"' if dest else ""}>Get fare</a>
</article>''')
    return '<div class="fleet">' + "".join(out) + "</div>"

def self_cards(p):
    out = []
    for c in SELF_CARS:
        out.append(f'''<article class="car">
  <div class="car-ico">{car_visual(c)}</div>
  <h3>{c["name"]}</h3><div class="models">{c["models"]} or similar</div>
  <div class="price">{inr(c["day"])}<small>/24 hrs</small></div>
  <ul class="specs">
    <li>12 hrs <b>{inr(c["half"])}</b></li>
    <li>Free km <b>{RULES["selfKmPerDay"]} km/day</b></li>
    <li>Extra km <b>₹{c["xkm"]}/km</b></li>
    <li>Deposit (refundable) <b>{inr(c["dep"])}</b></li>
    <li>{c["trans"]} · {c["fuel"]} <b>{c["seats"]} seats</b></li>
  </ul>
  <a class="btn btn-primary" href="#book" data-pick="self:{c["id"]}">Book self drive</a>
</article>''')
    return '<div class="fleet">' + "".join(out) + "</div>"

def faq_html(faqs):
    return '<div class="faq">' + "".join(f"<details><summary>{e(q)}</summary><p>{a}</p></details>" for q, a in faqs) + "</div>"

def faq_schema(faqs):
    import re
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", a)}} for q, a in faqs]}

def crumbs_schema(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE["base_url"] + "/" + u} for i, (n, u) in enumerate(items)]}

def business_schema():
    addr = {"@type": "PostalAddress", "addressLocality": SITE["city"], "addressRegion": SITE["region"],
            "postalCode": SITE["postal"], "addressCountry": "IN"}
    if SITE["street"]: addr["streetAddress"] = SITE["street"]
    d = {
        "@context": "https://schema.org", "@type": "AutoRental", "@id": SITE["base_url"] + "/#business",
        "name": "BroDrive", "description": "Cab service, outstation taxi, one way cabs and self-drive car rental in Chandigarh, Panchkula, Mohali, Punjab and Haryana.",
        "url": SITE["base_url"] + "/", "logo": SITE["base_url"] + "/assets/img/logo.svg", "image": SITE["base_url"] + "/assets/img/og-image.png",
        "telephone": SITE["phone"], "priceRange": "₹₹", "address": addr,
        "geo": {"@type": "GeoCoordinates", "latitude": SITE["lat"], "longitude": SITE["lng"]},
        "openingHoursSpecification": {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], "opens": "00:00", "closes": "23:59"},
        "areaServed": [{"@type": "City", "name": n} for n in ["Chandigarh", "Panchkula", "Mohali", "Zirakpur", "Kharar"]] +
                      [{"@type": "State", "name": n} for n in ["Punjab", "Haryana", "Himachal Pradesh"]],
        "hasOfferCatalog": {"@type": "OfferCatalog", "name": "BroDrive rides", "itemListElement": [
            {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Self drive car rental in Chandigarh"}, "priceSpecification": {"@type": "UnitPriceSpecification", "price": CHEAP_SELF["day"], "priceCurrency": "INR", "unitText": "DAY"}},
            {"@type": "Offer", "itemOffered": {"@type": "TaxiService", "name": "Outstation cab with driver"}, "priceSpecification": {"@type": "UnitPriceSpecification", "price": CHEAP_CAB["km"], "priceCurrency": "INR", "unitText": "KMT"}},
            {"@type": "Offer", "itemOffered": {"@type": "TaxiService", "name": "Local cab 8 hrs / 80 km"}, "priceSpecification": {"@type": "UnitPriceSpecification", "price": CHEAP_CAB["local"]["8h"], "priceCurrency": "INR"}},
        ]},
    }
    same = [x for x in [SITE["instagram"], SITE["facebook"]] if x]
    if same: d["sameAs"] = same
    if SITE["email"]: d["email"] = SITE["email"]
    return d

def cta(p, title="Ready to roll, bro?", text="Get an instant fare and confirm on WhatsApp in under a minute."):
    return f'''<section><div class="container"><div class="cta">
  <div><h2>{title}</h2><p>{text}</p></div>
  <div class="btns"><a class="btn btn-dark" href="#book">Get fare</a><a class="btn btn-wa" href="{wa()}" rel="noopener">{ICONS["wa"]}WhatsApp</a><a class="btn btn-ghost" href="{tel()}">{ICONS["phone"]}Call 24×7</a></div>
</div></div></section>'''

def page(path, title, desc, body, schemas=(), og_type="website"):
    depth = path.count("/")
    p = "./" if depth == 0 else "../" * depth
    url = SITE["base_url"] + "/" + path
    gv = f'<meta name="google-site-verification" content="{e(SITE["google_verification"])}">' if SITE["google_verification"] else ""
    ld = "".join(f'<script type="application/ld+json">{json.dumps(s, ensure_ascii=False)}</script>' for s in [business_schema(), *schemas])
    doc = f'''<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="geo.region" content="IN-CH"><meta name="geo.placename" content="Chandigarh"><meta name="geo.position" content="{SITE["lat"]};{SITE["lng"]}"><meta name="ICBM" content="{SITE["lat"]}, {SITE["lng"]}">
<meta property="og:type" content="{og_type}"><meta property="og:site_name" content="BroDrive"><meta property="og:locale" content="en_IN">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE["base_url"]}/assets/img/og-image.png"><meta name="twitter:card" content="summary_large_image">
{gv}
<meta name="theme-color" content="#0B0F17">
<link rel="icon" href="{p}assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{p}assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{p}assets/css/style.css">
{ld}
</head>
<body>
{SPRITE}
{header(p, path)}
<main id="main">
{body(p)}
</main>
{footer(p)}
<script src="{p}assets/js/rates.js"></script>
<script src="{p}assets/js/fare.js"></script>
<script src="{p}assets/js/app.js" defer></script>
</body>
</html>
'''
    out = os.path.join(ROOT, path, "index.html") if path else os.path.join(ROOT, "index.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(doc)
    PAGES.append(path)

PAGES = []


# --------------------------------------------------------------------------------------
# Content: cities & routes
# --------------------------------------------------------------------------------------
CITIES = [
    dict(slug="cab-service-chandigarh", short="Chandigarh", name="Chandigarh", self_drive=True,
         title="Cab Service in Chandigarh | Taxi & Self Drive Car Rental – BroDrive",
         desc=f"Book a cab in Chandigarh for local trips, airport drops & outstation travel. Sedan from ₹{CAB['sedan']['km']}/km, local 8 hrs from {inr(CAB['hatch']['local']['8h'])}. Self drive cars from {inr(SELF['hatch']['day'])}/day. 24×7 on WhatsApp.",
         h1="Cab Service in Chandigarh",
         intro=["Need a taxi from Sector 17 to the airport at 5 AM, a full-day car for a wedding in Sector 35, or a weekend drive up to Shimla? BroDrive is a Chandigarh cab service built around clear per-km fares and drivers who actually know the city's roundabouts.",
                "Book a cab with driver for one-way drops, round trips and hourly local use, or grab a self-drive car with doorstep delivery anywhere in Chandigarh. Every car is checked, cleaned and GPS-tracked before your ride."],
         areas=["Sector 17 Plaza", "Sector 22 & 35", "Sector 43 ISBT", "Chandigarh Railway Station", "Chandigarh Airport (IXC)", "Elante Mall / Industrial Area", "IT Park & Manimajra", "PGIMER", "Panjab University", "Sukhna Lake & Rock Garden", "Sector 26 Grain Market", "New Chandigarh"],
         routes=["Shimla", "Kasauli", "Manali", "Delhi", "Amritsar", "Dharamshala"],
         faqs=[("How much does a taxi cost in Chandigarh for a full day?", f"A local 8 hrs / 80 km package starts at {inr(CAB['hatch']['local']['8h'])} for a hatchback and {inr(CAB['sedan']['local']['8h'])} for a sedan. Extra km and extra hours are charged at the rates on our rate card."),
               ("What is the taxi fare from Chandigarh to the airport?", f"A city or airport transfer within Chandigarh starts at {inr(CAB['hatch']['transfer'])} (hatchback) and {inr(CAB['sedan']['transfer'])} (sedan) for the first {RULES['transferIncludedKm']} km, including driver."),
               ("Can I get a self-drive car in Chandigarh?", f"Yes. Self-drive cars start at {inr(SELF['hatch']['day'])} per 24 hours with {RULES['selfKmPerDay']} free km a day. We deliver anywhere in Chandigarh."),
               ("Do you provide cabs late at night?", f"Yes, BroDrive runs 24×7. A night charge of {inr(RULES['nightCharge'])} applies when the driver is on duty between 10 PM and 6 AM.")]),
    dict(slug="cab-service-panchkula", short="Panchkula", name="Panchkula", self_drive=False,
         title="Cab Service in Panchkula | Taxi, Outstation & Local Cabs – BroDrive",
         desc=f"Reliable taxi service in Panchkula, Pinjore & Kalka. One way & round trip cabs from ₹{CAB['hatch']['km']}/km, Mansa Devi and Morni Hills trips, airport drops. Book 24×7 on WhatsApp.",
         h1="Cab Service in Panchkula",
         intro=["From Mansa Devi darshan at dawn to a late-night drop at Chandigarh Airport, BroDrive covers every corner of Panchkula — Sector 5's market, the MDC, Sector 20 and out to Pinjore and Kalka.",
                "Panchkula sits right on the Kalka–Shimla highway, so it is the perfect start for hill trips. Book a one-way cab to Shimla or Kasauli, or a round trip to Morni Hills with the driver waiting while you explore. Self-drive cars are available for pickup in neighbouring Chandigarh."],
         areas=["Sector 5 & 9", "Sector 20 & 21", "Mansa Devi Complex (MDC)", "Mata Mansa Devi Mandir", "Pinjore Gardens", "Kalka Railway Station", "Morni Hills", "Barwala", "Raipur Rani", "Amravati Enclave"],
         routes=["Shimla", "Kasauli", "Manali", "Delhi", "Haridwar", "Dehradun"],
         faqs=[("Do you pick up from Panchkula for outstation trips?", "Yes. Pickups anywhere in Panchkula, Pinjore and Kalka are charged at the same rates as Chandigarh – no extra pickup fee."),
               ("What does a cab from Panchkula to Shimla cost?", f"A one-way sedan from Panchkula to Shimla is about {inr(oneway(CAB['sedan'], 115))} including driver allowance; toll and parking are extra."),
               ("Can I hire a taxi for Mansa Devi and Morni Hills?", f"Yes – book a local 8 hrs / 80 km package from {inr(CAB['hatch']['local']['8h'])}. The driver waits while you visit."),
               ("Is self-drive available in Panchkula?", "Self-drive cars are picked up and returned in Chandigarh (doorstep delivery inside Chandigarh). Panchkula is a short 15-minute ride away.")]),
    dict(slug="cab-service-mohali", short="Mohali", name="Mohali", self_drive=False,
         title="Cab Service in Mohali | Airport Taxi & Outstation Cabs – BroDrive",
         desc=f"Taxi service in Mohali, Kharar & Aerocity. Chandigarh Airport transfers from {inr(CAB['hatch']['transfer'])}, outstation cabs from ₹{CAB['hatch']['km']}/km, Innova & Tempo Traveller on hire. 24×7 booking.",
         h1="Cab Service in Mohali",
         intro=["Mohali is home to Chandigarh International Airport, IT City and the busiest new sectors of the tricity — which makes a dependable cab essential. BroDrive picks up from every phase, Aerocity, Sector 70-plus and out to Kharar and Landran.",
                "Catching a 6 AM flight? Heading to Amritsar for a family visit? Book a flat-fare airport transfer or a per-km outstation taxi with an experienced driver, and get the total upfront on WhatsApp."],
         areas=["Phase 3B2, 5 & 7", "Sector 70 & 71", "Aerocity", "IT City", "Chandigarh International Airport", "Kharar", "Landran", "Sohana", "Mohali Stadium (PCA)", "Fortis Hospital"],
         routes=["Amritsar", "Delhi", "Shimla", "Manali", "Ludhiana", "Katra"],
         faqs=[("How much is a cab from Mohali to Chandigarh Airport?", f"Airport transfers start at {inr(CAB['hatch']['transfer'])} for a hatchback and {inr(CAB['sedan']['transfer'])} for a sedan (first {RULES['transferIncludedKm']} km), driver included."),
               ("Do you have cabs from Mohali to Amritsar?", f"Yes. A one-way sedan to Amritsar is around {inr(oneway(CAB['sedan'], 230))}. Same-day round trips are also available."),
               ("Can I book a Tempo Traveller in Mohali?", f"Yes – 12-seater Tempo Travellers are ₹{CAB['tempo']['km']}/km for outstation and {inr(CAB['tempo']['local']['8h'])} for a local 8 hrs / 80 km package."),
               ("Is self-drive available in Mohali?", "Self-drive cars are delivered and collected within Chandigarh, which borders Mohali.")]),
    dict(slug="cab-service-zirakpur", short="Zirakpur", name="Zirakpur", self_drive=False,
         title="Cab Service in Zirakpur | Taxi to Delhi, Shimla & Airport – BroDrive",
         desc=f"Book a taxi in Zirakpur, Dhakoli, Peer Muchalla & Dera Bassi. Zirakpur to Delhi cab from {inr(oneway(CAB['sedan'], 240))}, airport drops, hill trips. 24×7 cab service on WhatsApp.",
         h1="Cab Service in Zirakpur",
         intro=["Zirakpur is the gateway between the tricity, Delhi and the hills – the Ambala highway, the Shimla road and the airport road all meet here. BroDrive cabs pick up from VIP Road, Dhakoli, Peer Muchalla, Baltana and Dera Bassi.",
                "Whether it's a daily office run, a family trip to Haridwar or a one-way drop to Delhi Airport, you get a clean car, a polite driver and the fare upfront."],
         areas=["VIP Road", "PR-7 Airport Road", "Dhakoli", "Peer Muchalla", "Baltana", "Lohgarh", "Bhabat", "Dera Bassi", "Lalru", "Banur"],
         routes=["Delhi", "Shimla", "Haridwar", "Amritsar", "Manali", "Kasauli"],
         faqs=[("How much is a cab from Zirakpur to Delhi?", f"A one-way sedan from Zirakpur to Delhi is about {inr(oneway(CAB['sedan'], 240))} including driver allowance; tolls are extra."),
               ("Do you pick up from Dera Bassi and Lalru?", "Yes, we pick up from Dera Bassi, Lalru, Banur and all of Zirakpur at standard rates."),
               ("Can I book a cab for a few hours in Zirakpur?", f"Yes – local packages start at {inr(CAB['hatch']['local']['4h'])} for 4 hrs / 40 km.")]),
    dict(slug="taxi-service-punjab", short="Punjab", name="Punjab", self_drive=False, state=True,
         title="Taxi Service in Punjab | Outstation Cabs & Car Rental – BroDrive",
         desc=f"Outstation taxi service across Punjab – Ludhiana, Amritsar, Jalandhar, Patiala, Bathinda & more. One way & round trip cabs from ₹{CAB['hatch']['km']}/km, Innova & Tempo Traveller. Book 24×7.",
         h1="Taxi Service in Punjab",
         intro=["BroDrive runs outstation cabs to and from every major city in Punjab. Visit the Golden Temple in Amritsar, attend a wedding in Ludhiana, do a gurudwara yatra to Anandpur Sahib and Fatehgarh Sahib, or simply get a one-way drop to the airport.",
                "Our drivers know Punjab's highways and dhabas, and every fare is per-km with no surprises: one-way drops are billed on distance travelled, round trips on a fair daily minimum."],
         areas=["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Rupnagar (Ropar)", "Anandpur Sahib", "Fatehgarh Sahib", "Rajpura", "Hoshiarpur", "Pathankot", "Moga", "Kharar"],
         routes=["Amritsar", "Ludhiana", "Jalandhar", "Patiala", "Bathinda", "Anandpur Sahib"],
         faqs=[("Do you provide cabs from anywhere in Punjab?", "Most trips start or end in the Chandigarh tricity. For pickups in other Punjab cities, enter the distance in the fare calculator or message us – we'll confirm the fare."),
               ("Can I book a gurudwara yatra taxi?", f"Yes. A round trip covering Anandpur Sahib, Kiratpur Sahib and Fatehgarh Sahib in a sedan works out to about {inr(roundtrip(CAB['sedan'], 140, 1))} for one day."),
               ("Do you charge Punjab state tax?", "Travel within Punjab and Chandigarh has no extra state permit. For other states, the state entry tax is extra at actuals.")]),
    dict(slug="taxi-service-haryana", short="Haryana", name="Haryana", self_drive=False, state=True,
         title="Taxi Service in Haryana | One Way & Outstation Cabs – BroDrive",
         desc=f"Outstation cab service across Haryana – Panchkula, Ambala, Kurukshetra, Karnal, Panipat, Hisar, Gurugram. One way taxi from ₹{CAB['hatch']['km']}/km. Sedan, SUV, Innova Crysta, Tempo Traveller.",
         h1="Taxi Service in Haryana",
         intro=["Driving down the GT Road through Ambala, Kurukshetra, Karnal and Panipat? BroDrive's one-way and round trip cabs cover Haryana end to end – from Panchkula and Pinjore in the north to Gurugram, Hisar and Rohtak.",
                "Book a single sedan for a business meeting in Gurugram, an Innova Crysta for a family trip to Kurukshetra's Brahma Sarovar, or a Tempo Traveller for a baraat. One clear per-km fare, driver included."],
         areas=["Panchkula", "Pinjore & Kalka", "Ambala", "Kurukshetra", "Karnal", "Panipat", "Yamunanagar", "Sonipat", "Hisar", "Rohtak", "Gurugram", "Faridabad"],
         routes=["Delhi", "Ambala", "Kurukshetra", "Karnal", "Panipat", "Gurugram"],
         faqs=[("How much is a one-way cab from Chandigarh to Gurugram?", f"A sedan one way to Gurugram is about {inr(oneway(CAB['sedan'], 270))}, including driver allowance. Tolls are extra."),
               ("Do you have cabs from Ambala or Karnal?", "Yes, we pick up across the GT Road belt. Use the calculator with your approximate distance or message us for a quote."),
               ("Is there a Haryana state tax?", "Haryana-registered and all-India permit cabs don't need extra tax inside Haryana and Chandigarh. Other state entry taxes are charged at actuals.")]),
]

ROUTES = [
    dict(slug="chandigarh-to-delhi-cab", to="Delhi", km=250, time="4½–5 hrs", rt_days=1,
         via="NH44 (GT Road) via Zirakpur, Ambala, Kurukshetra, Karnal and Panipat",
         stops=["Ambala Cantt", "Pipli & Kurukshetra (Brahma Sarovar)", "Karnal Lake", "Murthal dhabas for parathas", "Delhi Airport T1 / T3"],
         text=["The Chandigarh–Delhi run is the busiest intercity route in North India, and the six-lane GT Road makes it a smooth 4½-hour drive. Most travellers book a one-way cab for an airport drop or a same-day round trip for a meeting.",
               "Your BroDrive driver can stop at Murthal for the famous paratha breakfast and drop you directly at IGI Airport, New Delhi Railway Station, Noida or Gurugram."],
         faqs=[("What is the taxi fare from Chandigarh to Delhi?", f"A one-way hatchback is about {inr(oneway(CAB['hatch'], 250))}, a sedan about {inr(oneway(CAB['sedan'], 250))} and an Innova Crysta about {inr(oneway(CAB['crysta'], 250))}, including driver allowance. Tolls (about ₹400–₹500) are extra."),
               ("Can I book a one way cab from Chandigarh to Delhi Airport?", "Yes. One-way cabs are billed only on the distance travelled – you never pay for the empty return."),
               ("How long does Chandigarh to Delhi take by cab?", "About 4½ to 5 hours via NH44, depending on traffic at Panipat and the Delhi border.")]),
    dict(slug="chandigarh-to-shimla-cab", to="Shimla", km=115, time="3–3½ hrs", rt_days=1,
         via="NH5 via Zirakpur, Pinjore, Parwanoo, Dharampur and Solan",
         stops=["Pinjore Gardens", "Timber Trail, Parwanoo", "Kasauli detour", "Barog & Solan", "Kufri & Mall Road"],
         text=["Shimla is Chandigarh's favourite weekend escape, and the four-lane highway now makes it a comfortable 3-hour climb. Hill-trained BroDrive drivers handle the bends while you enjoy the views from Parwanoo upwards.",
               "Book a one-way drop for a hotel check-in, or a round trip with Kufri and Mashobra sightseeing. For a family of six, the Ertiga or Innova is the comfortable pick."],
         faqs=[("What is the cab fare from Chandigarh to Shimla?", f"A one-way sedan is about {inr(oneway(CAB['sedan'], 115))} and a same-day round trip about {inr(roundtrip(CAB['sedan'], 115, 1))}, including driver. Himachal entry tax, toll and parking are extra."),
               ("Is there a Himachal entry tax for taxis?", "Yes, Himachal Pradesh charges an entry tax for commercial vehicles, paid at actuals at the border."),
               ("Can I do Shimla and Kufri in one day?", "Yes. A day round trip leaving Chandigarh by 7 AM easily covers Shimla Mall Road and Kufri.")]),
    dict(slug="chandigarh-to-manali-cab", to="Manali", km=300, time="8–9 hrs", rt_days=3,
         via="Kiratpur–Manali four-lane via Ropar, Bilaspur, Sundernagar, Mandi and Kullu",
         stops=["Gobind Sagar Lake, Bilaspur", "Sundernagar", "Pandoh Dam", "Kullu & river rafting", "Solang Valley"],
         text=["The new Kiratpur–Manali four-lane with its tunnels has cut the Chandigarh–Manali drive to about 8 hours. It's a long day in the hills, so an experienced mountain driver makes all the difference.",
               "Most travellers take a 3-day round trip covering Solang Valley and Atal Tunnel, or a one-way drop for longer stays. SUVs and the Innova Crysta are recommended for comfort and luggage."],
         faqs=[("What is the taxi fare from Chandigarh to Manali?", f"A one-way sedan is about {inr(oneway(CAB['sedan'], 300))}; a 3-day round trip in a sedan is about {inr(roundtrip(CAB['sedan'], 300, 3))} and in an Innova Crysta about {inr(roundtrip(CAB['crysta'], 300, 3))}. Tolls, Himachal entry tax, parking and Rohtang/Atal Tunnel permits are extra."),
               ("Which car is best for Chandigarh to Manali?", "An SUV such as Ertiga or Innova Crysta handles hills and luggage best. For groups of 8–12, book a Tempo Traveller."),
               ("Can the driver take us to Atal Tunnel and Sissu?", "Yes, local sightseeing is included in the km of a round trip. Any permits required are paid at actuals.")]),
    dict(slug="chandigarh-to-amritsar-cab", to="Amritsar", km=230, time="4–4½ hrs", rt_days=1,
         via="Kharar, Ropar, Phagwara and Jalandhar",
         stops=["Ropar wetlands", "Jalandhar (Devi Talab Mandir)", "Golden Temple", "Jallianwala Bagh", "Attari–Wagah Border ceremony"],
         text=["Amritsar is a must for every visitor to Punjab – the Golden Temple at dawn, Kesar Da Dhaba lunch and the evening Beating Retreat at Wagah Border.",
               "A same-day round trip is possible if you leave early, but we recommend two days to take it all in. Your driver knows the Wagah timings and the best spots to park near Harmandir Sahib."],
         faqs=[("What is the cab fare from Chandigarh to Amritsar?", f"A one-way sedan is about {inr(oneway(CAB['sedan'], 230))} and a same-day round trip about {inr(roundtrip(CAB['sedan'], 230, 1))}, including driver. Tolls and parking are extra."),
               ("Can I visit Wagah Border on the same trip?", "Yes. Wagah is about 30 km from Amritsar city; the extra distance is added to your per-km fare."),
               ("How long is the drive from Chandigarh to Amritsar?", "Around 4 to 4½ hours by road.")]),
]

HOME_FAQS = [
    ("How do I book a cab or self-drive car with BroDrive?", "Fill in the booking form above to see your fare, then tap <b>Book on WhatsApp</b> – your trip details are sent to us automatically. You can also call us 24×7. We confirm the car, driver details and final fare within minutes."),
    ("What is included in the cab fare?", f"The car, fuel and driver are included. Driver allowance ({inr(CAB['sedan']['da'])}/day for most cars) is shown separately in the estimate. Toll, parking, state entry tax and {RULES['gst']}% GST are extra at actuals."),
    ("What is the minimum km for one way and round trips?", f"One-way outstation trips are billed on a minimum of {RULES['oneWayMinKm']} km. Round trips are billed on a minimum of {RULES['roundMinKmPerDay']} km per calendar day. Trips under {RULES['transferMaxKm']} km are flat city/airport transfers."),
    ("Is self-drive available outside Chandigarh?", f"Self-drive cars are picked up and returned in Chandigarh only, with optional doorstep delivery inside the city. Once you have the car you can drive to Punjab, Haryana or Himachal – just tell us your plan."),
    ("What documents do I need for a self-drive car?", "An original driving licence at least 1 year old, Aadhaar card, and one more ID (PAN/passport/voter ID). Minimum age is 21 (23–25 for premium SUVs). A refundable security deposit is collected at pickup."),
    ("When is the security deposit refunded?", "Within 3–7 working days after return, after deducting any fuel shortfall, traffic challans, late fees or damage as per our policy."),
    ("What is the daily km limit on self-drive cars?", f"Each 24-hour day includes {RULES['selfKmPerDay']} km ({RULES['selfKmHalf']} km for a 12-hour rental). Extra km are ₹{CHEAP_SELF['xkm']}–₹{TOP_SELF['xkm']}/km depending on the car, or choose the unlimited km add-on."),
    ("What is your cancellation policy?", "Cabs: free cancellation up to 6 hours before pickup. Self drive: free up to 24 hours before pickup. See our policies page for details."),
]


# --------------------------------------------------------------------------------------
# Page builders
# --------------------------------------------------------------------------------------
def chips():
    items = ["Upfront per-km fares", "24×7 support", "Verified drivers", "Sanitised, GPS-tracked cars"]
    return '<ul class="chips">' + "".join(f"<li>{ICONS['check']}{i}</li>" for i in items) + "</ul>"

def routes_grid(p, names, car="sedan"):
    route_pages = {r["to"]: r["slug"] for r in ROUTES}
    out = []
    for n in names:
        km = km_of(n)
        href = f'{p}{route_pages[n]}/' if n in route_pages else "#book"
        attrs = "" if n in route_pages else f' data-pick="cab:{car}" data-dest="{e(n)}"'
        out.append(f'<a class="route" href="{href}"{attrs}><b>Chandigarh → {e(n)}</b><span>{km} km · one way {CAB[car]["name"].lower()}</span><em>from {inr(oneway(CAB[car], km))}</em></a>')
    return '<div class="routes">' + "".join(out) + "</div>"

def areas_grid(p):
    out = []
    for c in CITIES:
        tag = '<span class="tag">Self drive available</span>' if c["self_drive"] else ""
        sub = "Outstation cabs across the state" if c.get("state") else "Local, airport & outstation cabs"
        out.append(f'<a class="area" href="{p}{c["slug"]}/"><b>{c["short"]}</b><span>{sub}</span>{tag}</a>')
    return '<div class="areas">' + "".join(out) + "</div>"

def features():
    f = [("tag", "No surprise fares", "See the full estimate before you book. Per-km pricing, no hidden pickup or booking fees."),
         ("user", "Drivers who know the way", "Police-verified, uniformed drivers experienced on hill roads and highways."),
         ("shield", "Clean & insured cars", "Every car is sanitised, inspected and commercially insured before each trip."),
         ("clock", "On time, every time", "Driver details shared in advance and live tracking on request. 24×7 phone & WhatsApp support."),
         ("key", "Self drive, your way", "Doorstep delivery in Chandigarh, 12-hour plans and unlimited km options."),
         ("spark", "One way = one way", "Pay only for the distance you travel on one-way drops – no return fare.")]
    return '<div class="features">' + "".join(f'<div class="feature"><div class="ic">{ICONS[i]}</div><h3>{t}</h3><p>{d}</p></div>' for i, t, d in f) + "</div>"

def build_home():
    def body(p):
        return f'''<section class="hero"><div class="container hero-grid">
  <div>
    <div class="eyebrow">Chandigarh<i></i>Panchkula<i></i>Mohali<i></i>Punjab<i></i>Haryana</div>
    <h1>Cab Service &amp; <em>Self-Drive</em> Car Rental in Chandigarh</h1>
    <p class="lead">One-way drops, round trips, airport transfers, hourly local cabs and self-drive cars — honest per-km fares and a bro on call 24×7.</p>
    {chips()}
    <div class="hero-cta"><a class="btn btn-primary" href="#book">Get instant fare</a><a class="btn btn-ghost" href="{wa()}" rel="noopener">{ICONS["wa"]}Chat on WhatsApp</a></div>
  </div>
  {booking()}
</div></section>

<section><div class="container">
  <div class="sec-head"><span class="kicker">Two ways to ride</span><h2>Sit back, or take the wheel</h2><p>Choose a chauffeur-driven cab anywhere in Chandigarh, Punjab and Haryana – or drive yourself with a self-drive car from Chandigarh.</p></div>
  <div class="modes">
    <a class="mode dark" href="{p}car-rental-with-driver/"><h3>Cab with Driver</h3><p>Hatchbacks to Tempo Travellers with experienced drivers.</p>
      <ul><li>One way &amp; round trip outstation</li><li>Local 4 hr / 8 hr packages</li><li>Airport &amp; railway transfers</li></ul>
      <span class="go">From ₹{CHEAP_CAB["km"]}/km →</span>{car_svg("sedan", "car-art")}</a>
    <a class="mode amber" href="{p}self-drive-car-rental-chandigarh/"><h3>Self Drive · Chandigarh</h3><p>Your car, your playlist, your pace.</p>
      <ul><li>Swift to Thar &amp; XUV700</li><li>{RULES["selfKmPerDay"]} km/day free, or go unlimited</li><li>Doorstep delivery in Chandigarh</li></ul>
      <span class="go">From {inr(CHEAP_SELF["day"])}/day →</span>{car_svg("jeep", "car-art")}</a>
  </div>
</div></section>

<section class="bg-white" id="fleet"><div class="container">
  <div class="sec-head"><span class="kicker">Cab with driver</span><h2>Fleet &amp; per-km rates</h2><p>Outstation fares are per km with a {RULES["oneWayMinKm"]} km minimum on one-way trips and {RULES["roundMinKmPerDay"]} km/day on round trips. <a href="{p}rates/">See full rate card →</a></p></div>
  {cab_cards(p)}
</div></section>

<section id="self-drive"><div class="container">
  <div class="sec-head"><span class="kicker">Self drive · Chandigarh only</span><h2>Self-drive cars by the day</h2><p>Every rental includes {RULES["selfKmPerDay"]} km per day, insurance and 24×7 roadside assistance. Fuel is on you – return it at the same level.</p></div>
  {self_cards(p)}
</div></section>

<section class="bg-ink"><div class="container">
  <div class="sec-head"><span class="kicker">How it works</span><h2>Booked in under a minute</h2></div>
  <div class="steps">
    <div class="step"><h3>Get your fare</h3><p>Pick your trip, car and dates in the form. The estimate updates instantly.</p></div>
    <div class="step"><h3>Book on WhatsApp</h3><p>One tap sends your trip details to us. We confirm the car and driver within minutes.</p></div>
    <div class="step"><h3>Ride easy</h3><p>Driver details reach you before pickup. Pay by UPI, card or cash after the trip.</p></div>
  </div>
</div></section>

<section><div class="container">
  <div class="sec-head"><span class="kicker">Popular routes</span><h2>Outstation cabs from Chandigarh</h2><p>Sedan one-way fares including driver allowance. Tap a route to get your exact fare.</p></div>
  {routes_grid(p, ["Shimla", "Manali", "Delhi", "Amritsar", "Kasauli", "Dharamshala", "Haridwar", "Ludhiana", "Dehradun", "Katra", "Delhi Airport (IGI)", "Patiala"])}
</div></section>

<section class="bg-white"><div class="container">
  <div class="sec-head"><span class="kicker">Why BroDrive</span><h2>Like getting a ride from a friend – a really punctual one</h2></div>
  {features()}
</div></section>

<section class="bg-ink" id="areas"><div class="container">
  <div class="sec-head"><span class="kicker">Areas we serve</span><h2>Chandigarh tricity, Punjab &amp; Haryana</h2><p>Cabs with driver across the region. Self-drive cars are available in Chandigarh.</p></div>
  {areas_grid(p)}
</div></section>

<section><div class="container">
  <div class="sec-head"><span class="kicker">FAQ</span><h2>Questions, answered</h2></div>
  {faq_html(HOME_FAQS)}
</div></section>
{cta(p)}'''
    page("", "BroDrive – Cab Service & Self Drive Car Rental in Chandigarh, Panchkula, Mohali",
         f"Book cabs in Chandigarh, Panchkula & Mohali – one way & round trip outstation taxi from ₹{CHEAP_CAB['km']}/km, local cabs, airport transfers. Self drive cars in Chandigarh from {inr(CHEAP_SELF['day'])}/day. 24×7.",
         body, [faq_schema(HOME_FAQS), {"@context": "https://schema.org", "@type": "WebSite", "name": "BroDrive", "url": SITE["base_url"] + "/"}])

def rate_tables(p, which="both"):
    cab_rows = "".join(f'''<tr><td><b>{c["name"]}</b><small>{c["models"]}</small></td><td>{c["seats"]}</td><td class="num">₹{c["km"]}</td>
<td class="num">{inr(c["da"])}</td><td class="num">{inr(c["transfer"])}</td><td class="num">{inr(c["local"]["4h"])}</td><td class="num">{inr(c["local"]["8h"])}</td><td class="num">₹{c["km"]} · {inr(c["hr"])}</td></tr>''' for c in CAB_CARS)
    self_rows = "".join(f'''<tr><td><b>{c["name"]}</b><small>{c["models"]}</small></td><td>{c["trans"]}<small>{c["fuel"]}</small></td><td class="num">{inr(c["half"])}</td><td class="num">{inr(c["day"])}</td>
<td class="num">{RULES["selfKmPerDay"]} km</td><td class="num">₹{c["xkm"]}</td><td class="num">{inr(c["dep"])}</td><td class="num">{c["age"]}+</td></tr>''' for c in SELF_CARS)
    cab = f'''<h2 id="cab-rates">Cab with driver – rate card</h2>
<div class="table-wrap"><table><thead><tr><th>Car</th><th>Seats</th><th class="num">Outstation /km</th><th class="num">Driver allowance /day</th><th class="num">City / airport transfer*</th><th class="num">Local 4 hr / 40 km</th><th class="num">Local 8 hr / 80 km</th><th class="num">Extra km · extra hr</th></tr></thead><tbody>{cab_rows}</tbody></table></div>
<div class="notes">
  <div class="note-card"><h3>Outstation rules</h3><ul>
    <li><b>One way:</b> billed on actual distance, minimum {RULES["oneWayMinKm"]} km, plus one day driver allowance. No return fare.</li>
    <li><b>Round trip:</b> minimum {RULES["roundMinKmPerDay"]} km per calendar day (e.g. 3 days = {3 * RULES["roundMinKmPerDay"]} km minimum) + driver allowance per day.</li>
    <li>Km are counted garage to garage from Chandigarh tricity.</li>
    <li>*Transfers include the first {RULES["transferIncludedKm"]} km; then the per-km rate applies.</li></ul></div>
  <div class="note-card"><h3>Extra charges (at actuals)</h3><ul>
    <li>Toll tax, parking and state entry tax / permits.</li>
    <li>Night charge {inr(RULES["nightCharge"])} if the driver is on duty between 10 PM and 6 AM.</li>
    <li>Hill station surcharge may apply above 2,000 m in winter (snow chains).</li>
    <li>GST {RULES["gst"]}% on the total fare.</li></ul></div>
</div>'''
    self = f'''<h2 id="self-rates" style="margin-top:56px">Self drive – rate card (Chandigarh)</h2>
<div class="table-wrap"><table><thead><tr><th>Car</th><th>Gearbox / fuel</th><th class="num">12 hrs</th><th class="num">24 hrs</th><th class="num">Free km /day</th><th class="num">Extra km</th><th class="num">Deposit</th><th class="num">Min age</th></tr></thead><tbody>{self_rows}</tbody></table></div>
<div class="notes">
  <div class="note-card"><h3>Included</h3><ul>
    <li>{RULES["selfKmPerDay"]} free km per 24 hrs ({RULES["selfKmHalf"]} km on 12-hr plans). Unlimited km add-on: +{RULES["unlimitedPct"]}% of rental.</li>
    <li>Comprehensive insurance and 24×7 roadside assistance.</li>
    <li>Long rentals: {RULES["disc7"]}% off on 7+ days, {RULES["disc30"]}% off on 30+ days.</li>
    <li>Doorstep delivery &amp; pickup in Chandigarh {inr(RULES["deliveryFee"])}, free on {RULES["freeDeliveryDays"]}+ day bookings.</li></ul></div>
  <div class="note-card"><h3>Good to know</h3><ul>
    <li>Fuel not included – return at the same level, or pay fuel + {inr(RULES["refuelFee"])} refuel fee.</li>
    <li>Late return: {inr(RULES["lateFeePerHour"])}/hour after a 30-minute grace period.</li>
    <li>Cleaning {inr(RULES["cleaningFee"])} if returned very dirty; smoking {inr(RULES["smokingFee"])}.</li>
    <li>Traffic challans, tolls and FASTag usage during the rental are paid by the customer.</li></ul></div>
</div>'''
    return (cab if which in ("both", "cab") else "") + (self if which in ("both", "self") else "")

def hero_small(p, crumbs, h1, lead, side=None):
    cr = " / ".join([f'<a href="{p}">Home</a>'] + [e(c) for c in crumbs])
    return f'''<section class="hero compact"><div class="container hero-grid">
  <div><nav class="crumbs" aria-label="Breadcrumb">{cr}</nav><h1>{h1}</h1><p class="lead">{lead}</p>{chips()}</div>
  {side or ""}
</div></section>'''

def build_rates():
    def body(p):
        return hero_small(p, ["Rate card"], "BroDrive <em>Rate Card</em>",
                          "Standard taxi and self-drive car rental rates in Chandigarh, benchmarked against leading local operators. What you see is what you pay – plus actual tolls and taxes.",
                          booking()) + f'''<section><div class="container">{rate_tables(p)}</div></section>{cta(p)}'''
    page("rates/", "Taxi & Self Drive Rates in Chandigarh | Per Km Cab Fare Chart – BroDrive",
         f"BroDrive rate card: outstation cab fare per km (hatchback ₹{CAB['hatch']['km']}, sedan ₹{CAB['sedan']['km']}, SUV ₹{CAB['suv']['km']}, Innova Crysta ₹{CAB['crysta']['km']}), driver allowance, local packages and self drive daily rates, km limits & deposits.",
         body, [crumbs_schema([("Home", ""), ("Rate card", "rates/")])])

def build_self():
    faqs = [HOME_FAQS[3], HOME_FAQS[4], HOME_FAQS[5], HOME_FAQS[6],
            ("Can I take a self-drive car to Shimla or Manali?", "Yes. Let us know your route at booking. Himachal entry tax, tolls and any permits are paid by you. We recommend an SUV for mountain roads in winter."),
            ("Is there a 12-hour self-drive plan?", f"Yes – 12-hour rentals start at {inr(SELF['hatch']['half'])} with {RULES['selfKmHalf']} free km.")]
    def body(p):
        return hero_small(p, ["Self drive car rental Chandigarh"], "Self Drive Car Rental in <em>Chandigarh</em>",
                          f"Swift to Thar, Creta to XUV700 – rent a self-drive car from {inr(CHEAP_SELF['day'])}/day with {RULES['selfKmPerDay']} free km, insurance and doorstep delivery anywhere in Chandigarh.",
                          booking(tab="self")) + f'''
<section><div class="container">
  <div class="sec-head"><span class="kicker">Choose your ride</span><h2>Self-drive cars &amp; daily rates</h2><p>Prices per 24 hours. 12-hour plans available. Pickup &amp; return in Chandigarh.</p></div>
  {self_cards(p)}
</div></section>
<section class="bg-white"><div class="container split">
  <div class="prose">
    <h2>Self-drive in Chandigarh, minus the hassle</h2>
    <p>Chandigarh is made for driving – wide sector roads, leafy V3s and the hills just 30 minutes away. With a BroDrive self-drive car you skip the taxi wait and set your own schedule: a day trip to Kasauli, a weekend in Shimla, or just a week of running errands while your own car is in the workshop.</p>
    <h3>How self-drive booking works</h3>
    <ol><li>Pick your car and dates above and tap <b>Book on WhatsApp</b>.</li>
      <li>Share photos of your driving licence and Aadhaar for quick verification.</li>
      <li>Collect the car or get it delivered to your doorstep in Chandigarh. Pay rent + refundable deposit by UPI or card.</li>
      <li>Drive! Return the car at the same fuel level; your deposit is refunded within 3–7 working days.</li></ol>
    <h3>Documents &amp; eligibility</h3>
    <ul><li>Original driving licence, at least 1 year old.</li><li>Aadhaar card + one more ID (PAN, passport or voter ID).</li><li>Minimum age 21 (23+ for SUVs, Thar and 7-seaters; 25+ for Innova Crysta).</li><li>Outstation students and tourists: additional local reference may be requested.</li></ul>
  </div>
  <aside class="aside-card"><h3>At a glance</h3><dl>
    <dt>Starts at</dt><dd>{inr(CHEAP_SELF["day"])}/day</dd><dt>Free km</dt><dd>{RULES["selfKmPerDay"]} km/day</dd>
    <dt>Extra km</dt><dd>₹{CHEAP_SELF["xkm"]}–₹{TOP_SELF["xkm"]}</dd><dt>Deposit</dt><dd>{inr(CHEAP_SELF["dep"])}–{inr(TOP_SELF["dep"])}</dd>
    <dt>Delivery</dt><dd>{inr(RULES["deliveryFee"])} / free 3+ days</dd><dt>Late return</dt><dd>{inr(RULES["lateFeePerHour"])}/hr</dd></dl>
    <a class="btn btn-primary" href="#book" style="width:100%">Check availability</a></aside>
</div></section>
<section><div class="container">{rate_tables(p, "self")}</div></section>
<section class="bg-white"><div class="container"><div class="sec-head"><h2>Self-drive FAQs</h2></div>{faq_html(faqs)}</div></section>
{cta(p, "Keys in hand by tomorrow?", "Tell us the car and dates – we'll confirm availability on WhatsApp in minutes.")}'''
    page("self-drive-car-rental-chandigarh/", "Self Drive Car Rental in Chandigarh from ₹1,799/day | BroDrive",
         f"Self drive cars in Chandigarh – Swift, Dzire, Creta, Thar, XUV700, Innova Crysta. From {inr(CHEAP_SELF['day'])}/day, {RULES['selfKmPerDay']} km/day free, unlimited km option, doorstep delivery. Book on WhatsApp.",
         body, [faq_schema(faqs), crumbs_schema([("Home", ""), ("Self drive car rental Chandigarh", "self-drive-car-rental-chandigarh/")])])

def build_driver():
    faqs = [HOME_FAQS[1], HOME_FAQS[2],
            ("What is the difference between one way and round trip?", f"One way: we drop you and you pay only the distance (min {RULES['oneWayMinKm']} km). Round trip: the cab stays with you and brings you back; billing is the higher of actual km or {RULES['roundMinKmPerDay']} km per day."),
            ("What is driver allowance?", f"A daily allowance ({inr(CAB['sedan']['da'])} for most cars, {inr(CAB['crysta']['da'])} Innova Crysta, {inr(CAB['tempo']['da'])} Tempo Traveller) that covers the driver's food and stay on outstation trips."),
            ("Do I need to arrange the driver's stay?", "No. The daily driver allowance covers it – the driver arranges their own stay."),
            HOME_FAQS[7]]
    def body(p):
        return hero_small(p, ["Car rental with driver"], "Car Rental <em>with Driver</em> in Chandigarh",
                          f"One-way drops, round trips and hourly local cabs from Chandigarh, Panchkula and Mohali to anywhere in Punjab, Haryana, Himachal and Delhi. From ₹{CHEAP_CAB['km']}/km, driver included.",
                          booking()) + f'''
<section><div class="container">
  <div class="sec-head"><span class="kicker">Fleet</span><h2>Pick your cab</h2><p>All cars are AC, commercially insured and driven by verified professionals.</p></div>
  {cab_cards(p)}
</div></section>
<section class="bg-white"><div class="container">
  <div class="sec-head"><h2>Three ways to book a cab</h2></div>
  <div class="features">
    <div class="feature" id="oneway"><div class="ic">{ICONS["spark"]}</div><h3>One Way</h3><p>Drop to Delhi, Shimla, Amritsar or any city and pay only for the distance travelled. Minimum {RULES["oneWayMinKm"]} km, plus one day driver allowance.</p></div>
    <div class="feature" id="round"><div class="ic">{ICONS["clock"]}</div><h3>Round Trip</h3><p>The cab stays with you for sightseeing and brings you home. Minimum {RULES["roundMinKmPerDay"]} km/day + {inr(CAB["sedan"]["da"])}/day driver allowance.</p></div>
    <div class="feature" id="local"><div class="ic">{ICONS["tag"]}</div><h3>Local Hourly</h3><p>4 hrs / 40 km from {inr(CHEAP_CAB["local"]["4h"])} or 8 hrs / 80 km from {inr(CHEAP_CAB["local"]["8h"])} within the tricity – weddings, shopping, hospital visits.</p></div>
  </div>
</div></section>
<section><div class="container">
  <div class="sec-head"><span class="kicker">Popular routes</span><h2>Where Chandigarh is heading</h2></div>
  {routes_grid(p, ["Delhi", "Shimla", "Manali", "Amritsar", "Kasauli", "Dharamshala", "Haridwar", "Rishikesh", "Mussoorie", "Katra", "Jaipur", "Gurugram"])}
</div></section>
<section class="bg-white"><div class="container">{rate_tables(p, "cab")}</div></section>
<section><div class="container"><div class="sec-head"><h2>Cab booking FAQs</h2></div>{faq_html(faqs)}</div></section>
{cta(p)}'''
    page("car-rental-with-driver/", "Car Rental with Driver in Chandigarh | One Way & Round Trip Cabs – BroDrive",
         f"Hire a cab with driver in Chandigarh – one way taxi, round trip outstation & local hourly packages. Hatchback ₹{CAB['hatch']['km']}/km, sedan ₹{CAB['sedan']['km']}/km, SUV ₹{CAB['suv']['km']}/km, Innova Crysta, Tempo Traveller.",
         body, [faq_schema(faqs), crumbs_schema([("Home", ""), ("Car rental with driver", "car-rental-with-driver/")])])

def build_city(c):
    def body(p):
        areas = "".join(f"<li>{e(a)}</li>" for a in c["areas"])
        intro = "".join(f"<p>{e(x)}</p>" for x in c["intro"])
        selfblock = f'''<section><div class="container"><div class="sec-head"><span class="kicker">Self drive · Chandigarh</span><h2>Self-drive cars in Chandigarh</h2><p>Doorstep delivery anywhere in the city.</p></div>{self_cards(p)}</div></section>''' if c["self_drive"] else \
            f'''<section><div class="container"><div class="cta" style="background:#fff;border:1px solid var(--line)"><div><h2>Want to drive yourself?</h2><p>Self-drive cars from {inr(CHEAP_SELF["day"])}/day are available for pickup in Chandigarh, just next door.</p></div><div class="btns"><a class="btn btn-primary" href="{p}self-drive-car-rental-chandigarh/">See self-drive cars</a></div></div></div></section>'''
        from_city = "" if c.get("state") else c["name"]
        return hero_small(p, [c["h1"]], c["h1"].replace(c["name"], f"<em>{c['name']}</em>"),
                          c["desc"].split(". ")[0] + ".", booking(from_city=from_city)) + f'''
<section class="bg-white"><div class="container split">
  <div class="prose"><h2>Your local cab partner in {c["name"]}</h2>{intro}
    <h3>{"Cities" if c.get("state") else "Areas"} we cover in {c["name"]}</h3><ul class="pill-list">{areas}</ul></div>
  <aside class="aside-card"><h3>{c["name"]} cab fares</h3><dl>
    <dt>Hatchback</dt><dd>₹{CAB["hatch"]["km"]}/km</dd><dt>Sedan</dt><dd>₹{CAB["sedan"]["km"]}/km</dd><dt>SUV / Ertiga</dt><dd>₹{CAB["suv"]["km"]}/km</dd>
    <dt>Innova Crysta</dt><dd>₹{CAB["crysta"]["km"]}/km</dd><dt>Local 8 hr / 80 km</dt><dd>from {inr(CAB["hatch"]["local"]["8h"])}</dd><dt>Airport transfer</dt><dd>from {inr(CAB["hatch"]["transfer"])}</dd></dl>
    <a class="btn btn-primary" href="#book" style="width:100%">Get exact fare</a></aside>
</div></section>
<section><div class="container"><div class="sec-head"><span class="kicker">Popular trips</span><h2>Outstation cabs from {c["name"] if not c.get("state") else "Chandigarh"}</h2></div>{routes_grid(p, c["routes"])}</div></section>
<section class="bg-white"><div class="container"><div class="sec-head"><h2>Cabs available in {c["name"]}</h2></div>{cab_cards(p)}</div></section>
{selfblock}
<section class="bg-white"><div class="container"><div class="sec-head"><h2>{c["name"]} cab FAQs</h2></div>{faq_html(c["faqs"])}</div></section>
{cta(p)}'''
    page(c["slug"] + "/", c["title"], c["desc"], body,
         [faq_schema(c["faqs"]), crumbs_schema([("Home", ""), (c["h1"], c["slug"] + "/")])])

def build_route(r):
    rows = "".join(f'<tr><td><b>{c["name"]}</b><small>{c["models"]} · {c["seats"]} seats</small></td><td class="num">{inr(oneway(c, r["km"]))}</td><td class="num">{inr(roundtrip(c, r["km"], r["rt_days"]))}</td><td class="num">₹{c["km"]}/km</td></tr>' for c in CAB_CARS)
    rt_label = "Same-day round trip" if r["rt_days"] == 1 else f'{r["rt_days"]}-day round trip'
    def body(p):
        stops = "".join(f"<li>{e(s)}</li>" for s in r["stops"])
        text = "".join(f"<p>{e(x)}</p>" for x in r["text"])
        return hero_small(p, [f'Chandigarh to {r["to"]} cab'], f'Chandigarh to <em>{r["to"]}</em> Cab',
                          f'{r["km"]} km · {r["time"]}. One-way sedan from {inr(oneway(CAB["sedan"], r["km"]))} including driver. Book a one way drop or {rt_label.lower()} 24×7.',
                          booking(dest=r["to"])) + f'''
<section><div class="container">
  <div class="sec-head"><span class="kicker">Fare chart</span><h2>Chandigarh to {r["to"]} taxi fare</h2><p>Estimates include driver allowance. Toll, parking, state tax &amp; GST extra.</p></div>
  <div class="table-wrap"><table><thead><tr><th>Car</th><th class="num">One way</th><th class="num">{rt_label}</th><th class="num">Rate</th></tr></thead><tbody>{rows}</tbody></table></div>
</div></section>
<section class="bg-white"><div class="container split">
  <div class="prose"><h2>About the trip</h2>{text}<h3>Stops worth making</h3><ul class="pill-list">{stops}</ul></div>
  <aside class="aside-card"><h3>Route info</h3><dl><dt>Distance</dt><dd>~{r["km"]} km</dd><dt>Drive time</dt><dd>{r["time"]}</dd><dt>Route</dt><dd style="font-weight:500">{e(r["via"])}</dd></dl>
    <a class="btn btn-primary" href="#book" style="width:100%">Book this route</a></aside>
</div></section>
<section><div class="container"><div class="sec-head"><h2>Chandigarh to {r["to"]} cab FAQs</h2></div>{faq_html(r["faqs"])}</div></section>
<section class="bg-white"><div class="container"><div class="sec-head"><h2>More routes</h2></div>{routes_grid(p, [x["to"] for x in ROUTES if x is not r] + ["Kasauli", "Dharamshala", "Haridwar"])}</div></section>
{cta(p)}'''
    page(r["slug"] + "/", f'Chandigarh to {r["to"]} Cab | One Way Taxi from {inr(oneway(CAB["hatch"], r["km"]))} – BroDrive',
         f'Book Chandigarh to {r["to"]} taxi – one way from {inr(oneway(CAB["hatch"], r["km"]))}, sedan {inr(oneway(CAB["sedan"], r["km"]))}, SUV & Innova Crysta. {r["km"]} km, {r["time"]}. Verified drivers, 24×7 booking on WhatsApp.',
         body, [faq_schema(r["faqs"]), crumbs_schema([("Home", ""), (f'Chandigarh to {r["to"]} cab', r["slug"] + "/")])])

def build_terms():
    def body(p):
        return hero_small(p, ["Policies & terms"], "Policies &amp; <em>Terms</em>", "The fine print, in plain language.") + f'''
<section><div class="container prose">
<h2>Cab with driver</h2><ul>
<li>Fares on the website are estimates. The final fare is confirmed on WhatsApp/phone before the trip.</li>
<li>One-way trips: minimum {RULES["oneWayMinKm"]} km billing. Round trips: minimum {RULES["roundMinKmPerDay"]} km per calendar day. Km and time are counted from and back to our Chandigarh garage.</li>
<li>Driver allowance is charged per day. A night charge of {inr(RULES["nightCharge"])} applies when the driver is on duty between 10 PM and 6 AM.</li>
<li>Toll tax, parking, state entry tax/permits and {RULES["gst"]}% GST are extra at actuals.</li>
<li>Waiting beyond 30 minutes on transfers is charged at the extra-hour rate.</li>
<li>Cancellation: free up to 6 hours before pickup; within 6 hours a fee equal to the transfer fare of the booked car may apply.</li>
<li>Smoking and alcohol consumption inside the cab are not allowed.</li></ul>
<h2>Self drive (Chandigarh)</h2><ul>
<li>Pickup and return in Chandigarh only. Doorstep delivery in Chandigarh {inr(RULES["deliveryFee"])} (free on {RULES["freeDeliveryDays"]}+ day bookings).</li>
<li>Eligibility: original driving licence at least 1 year old, Aadhaar + one more ID, minimum age 21 (higher for premium cars).</li>
<li>A refundable security deposit is collected at pickup and refunded within 3–7 working days after return, less any dues.</li>
<li>Each 24 hours includes {RULES["selfKmPerDay"]} km (12-hour plan: {RULES["selfKmHalf"]} km). Extra km are charged per the rate card. Unlimited km add-on: +{RULES["unlimitedPct"]}%.</li>
<li>Fuel is not included. Return the car at the same fuel level, or pay for the shortfall plus a {inr(RULES["refuelFee"])} refuel fee.</li>
<li>Late return beyond a 30-minute grace period: {inr(RULES["lateFeePerHour"])} per hour; beyond 4 hours late, a full extra day is charged.</li>
<li>Traffic challans, tolls and FASTag usage during the rental are the customer's responsibility.</li>
<li>Damage: covered by insurance subject to a deductible up to the deposit amount; damage due to rash/drunk driving or unauthorised drivers is fully payable by the customer.</li>
<li>Cleaning {inr(RULES["cleaningFee"])} if returned excessively dirty; smoking in the car {inr(RULES["smokingFee"])}.</li>
<li>Cancellation: free up to 24 hours before pickup; within 24 hours, one 12-hour rental may be charged.</li>
<li>Cars must not be used for commercial purposes, racing, towing or sub-letting.</li></ul>
<h2>Privacy</h2><p>We only use your name, phone and trip details to confirm and run your booking. We never sell your data.</p>
</div></section>'''
    page("terms/", "Policies & Terms | BroDrive Cab & Self Drive Chandigarh",
         "BroDrive cab and self-drive rental policies: km limits, driver allowance, deposit, fuel, late return and cancellation terms.",
         body, [crumbs_schema([("Home", ""), ("Policies & terms", "terms/")])])

def build_404():
    doc_body = lambda p: f'''<section class="hero"><div class="container"><h1>Wrong turn, <em>bro</em>.</h1><p class="lead">This page doesn't exist. Let's get you back on the road.</p><div class="hero-cta"><a class="btn btn-primary" href="{SITE["base_url"]}/">Go home</a><a class="btn btn-ghost" href="{SITE["base_url"]}/rates/">See rates</a></div></div></section>'''
    page("404/", "Page not found | BroDrive", "Page not found.", doc_body)
    # GitHub Pages / most hosts serve /404.html for missing pages – use absolute asset links
    src = open(os.path.join(ROOT, "404", "index.html"), encoding="utf-8").read()
    src = src.replace('href="../', f'href="{SITE["base_url"]}/').replace('src="../', f'src="{SITE["base_url"]}/')
    src = src.replace('<meta name="robots" content="index, follow, max-image-preview:large">', '<meta name="robots" content="noindex">')
    open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8").write(src)
    os.remove(os.path.join(ROOT, "404", "index.html")); os.rmdir(os.path.join(ROOT, "404"))
    PAGES.remove("404/")

def build_assets():
    data = {"site": {"whatsapp": SITE["whatsapp"], "phone": SITE["phone"], "api": SITE["api_url"]},
            "rules": RULES, "cab": CAB_CARS, "self": SELF_CARS}
    with open(os.path.join(ROOT, "assets", "js", "rates.js"), "w", encoding="utf-8") as f:
        f.write("/* GENERATED by tools/build.py – edit prices there, not here. */\nwindow.BRO = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
    prio = {"": "1.0", "self-drive-car-rental-chandigarh/": "0.9", "car-rental-with-driver/": "0.9", "rates/": "0.8"}
    urls = "".join(f"<url><loc>{SITE['base_url']}/{u}</loc><lastmod>{TODAY}</lastmod><priority>{prio.get(u, '0.7')}</priority></url>\n" for u in PAGES)
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: {SITE['base_url']}/sitemap.xml\n")

def build_backend():
    """backend/Code.gs = shared fare engine + API + default fleet. Paste this single file into Apps Script."""
    fare = open(os.path.join(ROOT, "assets", "js", "fare.js"), encoding="utf-8").read()
    server = open(os.path.join(ROOT, "backend", "server.js"), encoding="utf-8").read()
    defaults = dict(DEFAULTS, phone=SITE["phone_display"])
    out = ("/* GENERATED by tools/build.py – edit backend/server.js or assets/js/fare.js, then rebuild. */\n\n"
           + server + "\n\n/* ---------- Shared fare engine (assets/js/fare.js) ---------- */\n" + fare
           + "\n/* ---------- Default fleet & rules (seeded on first run) ---------- */\nvar DEFAULTS = "
           + json.dumps(defaults, ensure_ascii=False, indent=1) + ";\n")
    with open(os.path.join(ROOT, "backend", "Code.gs"), "w", encoding="utf-8") as f:
        f.write(out)

if __name__ == "__main__":
    build_home(); build_rates(); build_self(); build_driver()
    for c in CITIES: build_city(c)
    for r in ROUTES: build_route(r)
    build_terms(); build_404(); build_assets(); build_backend()
    print(f"Built {len(PAGES)} pages + 404.html, sitemap.xml, robots.txt, assets/js/rates.js")
