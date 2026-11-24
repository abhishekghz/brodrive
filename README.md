# BroDrive — Cab Service & Self-Drive Car Rental, Chandigarh

Static website (plain HTML/CSS/JS, no frameworks), so it loads fast and runs on any host: GitHub Pages now, GoDaddy later.

## Editing the site

All prices, phone numbers and page text live in **`tools/build.py`**. After any change:

```bash
python3 tools/build.py
```

That rewrites every page, `assets/js/rates.js`, `sitemap.xml` and `robots.txt`. Commit and push to update the live site.

| What | Where in `tools/build.py` |
|---|---|
| Phone, WhatsApp, address, email | `SITE` |
| Cab per-km rates, driver allowance, local packages | `CAB_CARS` |
| Self-drive daily rates, km cap, deposit | `SELF_CARS`, `RULES` |
| Min km, night charge, GST, discounts, delivery fee | `RULES` |
| Destinations in the fare calculator | `PLACES` |
| City pages (Chandigarh, Panchkula, Mohali, ...) | `CITIES` |
| Route pages (Chandigarh to Delhi, ...) | `ROUTES` |

**Before you promote the site, replace the placeholder phone and WhatsApp number in `SITE`.**

## Booking flow

There's no backend. The booking form works out the fare in the browser, then opens WhatsApp with the trip details filled in, so every enquiry lands on the business WhatsApp.

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
