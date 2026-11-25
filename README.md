# BroDrive — Cab Service & Self-Drive Car Rental, Chandigarh

Static website (plain HTML/CSS/JS, no frameworks), so it loads fast and runs on any host: GitHub Pages now, GoDaddy later.

## Editing the site

All prices, phone numbers and page text live in **`tools/build.py`**. After any change:

```bash
python3 tools/build.py
```

That rewrites every page, `assets/js/rates.js`, `backend/Code.gs`, `sitemap.xml` and `robots.txt`. Once the booking system is connected, prices and vehicles are managed in the admin panel, and the values in `build.py` are only the starting defaults. Commit and push to update the live site.

| What | Where in `tools/build.py` |
|---|---|
| Phone, WhatsApp, address, email | `SITE` |
| Cab per-km rates, driver allowance, local packages | `CAB_CARS` |
| Self-drive daily rates, km cap, deposit | `SELF_CARS`, `RULES` |
| Min km, night charge, GST, discounts, delivery fee | `RULES` |
| Destinations in the fare calculator | `PLACES` |
| City pages (Chandigarh, Panchkula, Mohali, ...) | `CITIES` |
| Route pages (Chandigarh to Delhi, ...) | `ROUTES` |


## Bookings, admin panel & email

- **Website booking:** customers book on the site and get a booking ID straight away. The fare is calculated again on the server, so nobody can tamper with the price. WhatsApp stays available as a backup.
- **Emails** come from your own Gmail through Google Apps Script:
  - you get a "New booking" email for every booking
  - the customer gets "Booking received" (when they enter an email)
  - the customer gets "Booking confirmed / cancelled / completed" whenever you choose **Save & email customer** in the admin panel
- **Admin panel:** `/admin/` (for example https://brodrive.in/admin/). It shows:
  - bookings, with status, assigned vehicle number, driver, final fare and notes, plus one-tap Call/WhatsApp to the customer
  - vehicles (add, edit, hide, delete, set prices, works for cars or bikes)
  - pricing rules (minimum km, allowances, discounts, fees)
- **Data** lives in a Google Sheet, *"BroDrive – Bookings & Fleet"*, in your Google Drive. The backend creates it the first time it runs. The sheet doubles as a backup and as an Excel-style view.
- **Price changes** reach the booking form straight away. The static price lists (fleet cards, rate tables) update the next time `python3 tools/build.py` is run and pushed, because the build pulls live prices from the admin panel. `.github/workflows/pages.yml` can do this hourly, but it's disabled: GitHub Actions is blocked by a billing issue on the account. Once that's fixed, re-enable it with `gh workflow enable "Build & deploy website"` and set Settings → Pages → Source to *GitHub Actions*.

Free Gmail can send about 100 emails a day through Apps Script. That covers roughly 40–50 bookings a day.

### Connect bookings & email (one-time, about 5 minutes)

1. Open https://script.google.com and click **New project**. Name it *BroDrive API*.
2. Delete the sample code. Paste in the whole of [`backend/Code.gs`](backend/Code.gs) (on GitHub, use the **Raw** button, then select all and copy).
3. Click the ⚙️ **Project Settings** icon. Under **Script properties**, click **Add script property**:
   - Property `ADMIN_KEY`, value: the admin-panel password you want (make it long).
   - Optional: `OWNER_EMAIL`, if booking alerts should go to a different address.
4. Go back to the **Editor**. Pick `setup` in the function dropdown, then click **Run**. Google asks for permission: click **Review permissions**, choose your account, then **Advanced → Go to BroDrive API (unsafe) → Allow**. This screen shows because it's your own script, not a published app. It creates the Google Sheet and sends you a "connected" email.
5. Click **Deploy → New deployment**. Choose the ⚙️ type **Web app**, set *Execute as* **Me** and *Who has access* **Anyone**, then click **Deploy**. Copy the **Web app URL** (it ends in `/exec`).
6. Put that URL in `SITE["api_url"]` in `tools/build.py`, then run `python3 tools/build.py` and push. Or just send the URL to Claude.

**Updating the backend later:** paste the new `backend/Code.gs` and save. If the new version needs extra permissions (it does when it starts using Google Drive), run `setup` once and click Allow. Then go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

## Live tracking

- Every booking gets two private links: a **customer tracking link** (sent in the confirmation email and WhatsApp) and a **driver link**.
- In the admin panel, open a booking and click **Send driver link**. The driver opens it on their phone and taps **Start sharing location**, then **I've arrived → Start trip → End trip**.
- The customer page (`/track/`) shows the car moving on the map, the route taken, km covered, speed, distance left and arrival time, plus a "Share my trip" button for family.
- The admin **Live** tab shows every confirmed or ongoing car on one map.
- **Limitation:** phones only send location while the driver page is open on screen. If the driver switches apps or locks the phone, updates pause, and missed points are sent when they come back. For self-drive cars, or for tracking that never pauses, fit a hardware GPS tracker (about ₹1,500–3,000 per car).

## Partners (attach other people's cars)

- Share **/partner/** (e.g. https://brodrive.in/partner/) with car owners and drivers. They register, add their cars and rates, and upload their papers: RC, insurance, permit, PUC, fitness, licence, Aadhaar and photos. Papers are saved privately in your Google Drive, in the folder *BroDrive – Partner documents*.
- In the admin **Partners** tab, review the papers (expired ones are flagged), then approve the partner and each car. Approved partner cars appear in the "Assign one of my cars" list.
- When you assign a partner car, the payout is suggested as fare minus your commission (**Pricing rules → commission %**, default 15%). The partner gets an email, and sees the ride, the customer pickup details and a Start-trip button on their dashboard.
- Partners see only their own rides and their earnings per ride. Mark payouts **Paid** in the booking to update their dashboard.
- A forgotten partner password: Partners → Review → **Reset password** (sends a new one on WhatsApp).

## Moving to GoDaddy

1. In `SITE`, set `base_url` to your domain, e.g. `https://www.brodrive.in`, then run `python3 tools/build.py`.
2. **Option A (keep GitHub hosting, use your GoDaddy domain):** add a `CNAME` file containing `www.brodrive.in`. In GoDaddy DNS, add a CNAME record from `www` to `abhishekghz.github.io`, plus A records for `@` pointing to 185.199.108.153, .109.153, .110.153 and .111.153. Then turn on "Enforce HTTPS" in the repo's Settings → Pages.
3. **Option B (GoDaddy hosting):** upload everything except `tools/` and `README.md` to `public_html` through cPanel File Manager or FTP.

## Ranking on Google: checklist

The site already covers technical SEO: a separate page for each city and route, unique titles and descriptions, LocalBusiness/FAQ/Breadcrumb schema, a sitemap, mobile-first layout and fast loading. What moves the needle after that:

1. **Google Business Profile** (most important for "cab service near me" and map results). Create a "Taxi service" / "Car rental agency" profile at business.google.com with the same name, phone and address as the website. Add photos of your cars and ask every customer for a review.
2. **Google Search Console**: add the property, paste the verification code into `SITE["google_verification"]`, rebuild, push, then submit `sitemap.xml`.
3. **Bing Webmaster Tools**: import from Search Console.
4. **Local listings (citations)**: Justdial, Sulekha, IndiaMART, Yellow Pages India, Facebook page, Instagram. Use exactly the same name, address and phone everywhere.
5. **Reviews**: aim for 30+ Google reviews. This matters more than anything else on the website.
6. **Content**: add new route pages (Chandigarh to Kasauli, Dharamshala, Haridwar...) by appending to `ROUTES`. Each one targets a separate search.
7. **Own domain**: a `.in` or `.com` domain ranks and converts better than `github.io`. Move as soon as you can.
