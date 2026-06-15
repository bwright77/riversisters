# River Sisters Congreso — Demonstration Site

A bilingual (English / Spanish) demonstration website for **River Sisters Congreso
(Hermanas del Río)**, a coalition of Indigenous and Chicano/Mexicano leaders working
to protect the South Platte River and to advance its recognition as a living relative.

This is a **demonstration concept** prepared by [Wright Adventures](https://github.com/bwright77)
for the Congreso's review. All visual directions are pending review by the Congreso's
cultural leadership.

## What's here

- `index.html` — the complete single-file site (HTML, CSS, and JS inline; images inlined as data URIs)

## Features

- Full English / Spanish toggle, equal weight, one tap
- True-scale map of the Turquoise Necklace (16 parks), with South Platte and Cherry
  Creek centerlines drawn from the USGS National Hydrography Dataset
- Events calendar oriented toward City Council advocacy
- Congreso member and partner sections
- Mobile-first, accessibility-conscious

## Deploying

Static site, no build step. Vercel serves `index.html` directly.

```bash
# local preview
python3 -m http.server 8000   # then open http://localhost:8000
```

## Notes

- Fonts (Fraunces, Karla) load from Google Fonts CDN at runtime.
- Member and partner rosters are sourced from the live Congreso site and shown with
  placeholder bios/portraits, pending real content from each member.

---

© 2026 — Demonstration concept. Cultural authorship and final direction rest with
River Sisters Congreso.
