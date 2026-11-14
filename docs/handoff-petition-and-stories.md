# Handoff: Post-Congreso petition CTA + Share Your Story form

**Branch:** `petition-and-stories` (1 feature commit `b77e2a4` + this doc)
**PR:** https://github.com/bwright77/riversisters/pull/19 (open, not merged)
**Preview:** https://riversisters-oo68273h3-benw21-2509s-projects.vercel.app (may need Vercel sign-in)
**Production:** `main` auto-deploys to Vercel; riversisterscolorado.com points at Vercel (GoDaddy retired)
**Status as of 2026-11-14 13:00 MT:** built, tested in headless Chrome, waiting on a Web3Forms key and a go-ahead to merge tonight after the Congreso (Nov 14, 8 am - 3 pm).

## Goal

After the Nov 14 Congreso, the site should:
1. Point people to the petition: https://secure.ngpvan.com/aab4JnSbwUm6yG2PghPJvw2 (EveryAction, "Petition to Protect the South Platte River as a Living Relative")
2. Give people a way to send stories, visual art, and poetry about the River

Benjamin chose an on-site web form over a Google Form or a plain email link.

## What changed (all in `index.html`; single-file static site, no build step)

### 1. Event content ends on merge
The "Hide past events" script removes `[data-date]` elements the day after their date and unhides `[data-after]` elements once that date has passed (Denver time). Left at `2026-11-14`, the event content would have stayed up until midnight. Moved to `2026-11-13` so merging takes it down right away:
- `.hero-event` `data-date` 11-14 -> 11-13
- `.hero-default` `data-after` 11-14 -> 11-13 (standard hero comes back)
- `#congreso` section `data-date` 11-14 -> 11-13
- Nov 14 `.ev` card in `#events` `data-date` 11-14 -> 11-13

**Watch:** merging before the event ends would take down the event hero and RSVP early.

### 2. Petition links (all `target="_blank" rel="noopener"`)
- Standard hero: primary button "Sign the petition" / "Firma la petición"; secondary button changed from "The Personhood Framework" to "Share your story" (`#share`)
- Primary nav: new `a.nav-petition` after Guiding Principles, styled clay-deep
- "More" menu: new `#share` link
- `#action` band: new first button `.btn.petition` (bone background, clay text, pen icon); `.micro` copy rewritten to mention the petition; `.signup` max-width 600px -> 760px so three buttons fit
- Footer "Explore": petition + Share Your Story links

### 3. New `#share` section (inserted right before `#action`)
Two-column grid (copy | form), single column at 860px and below; paired fields stack at 560px and below.

Form `#share-form` fields:
| name | type | required |
|---|---|---|
| name | text | yes |
| email | email | yes |
| type | select: Story / Visual art / Poetry / Other | yes |
| title | text | no |
| message | textarea | either message or link |
| link | url | either message or link |
| credit | text ("full name, first name only, or anonymous") | no |
| own_work | checkbox ("my own work or I have permission") | yes |
| share_ok | checkbox (permission to share publicly with credit) | no |
| botcheck | hidden honeypot checkbox | must stay empty |

Validation, status messages and the English/Spanish copy are all handled in the form's JS. Status messages use `role="status" aria-live="polite"`; invalid fields get `aria-invalid="true"`.

### 4. Submission path (JS block `// ---- Share your story form ----`, before `// ---- Mobile menu ----`)
- If `data-key` on `#share-form` is a real key: POST JSON to `https://api.web3forms.com/submit`, reset the form and show a thank-you on success.
- If `data-key` still starts with `YOUR_` (current state), or the request fails: open a pre-filled `mailto:` to `data-fallback` (`congreso@riversisterscolorado.com`) so the submission isn't lost.
- Subject line: `River Sisters: new <type> submission - <title>`. The payload includes `share_publicly` and `language` (en/es).

### 5. Language toggle
`swap()` now also swaps `placeholder` from `data-en-ph` / `data-es-ph`. Labels and options use the existing `data-en` / `data-es` pattern. Required-field asterisks sit inside `span.lbl` so they stay on the label's line.

### 6. CSS
New block `/* Petition + Share your story */` just before `/* Footer */`. Uses the existing tokens (`--clay`, `--clay-deep`, `--turquoise-deep`, `--bone`, `--line`, `--ink`). `#share` has `scroll-margin-top:70px` so the sticky header doesn't cover it.

## Remaining TODOs

1. **Web3Forms key (blocker for direct-to-inbox).** Benjamin creates a key at web3forms.com with the receiving inbox (likely congreso@riversisterscolorado.com) and replaces `data-key="YOUR_WEB3FORMS_ACCESS_KEY"`. The key is meant to be public; committing it is fine.
2. **Test a real submission** after the key is in (preview or prod) and confirm it reaches the inbox, including spam.
3. **Merge PR #19** tonight after the event. Check prod on mobile and desktop in EN and ES.
4. **Congreso copy review:** the English and Spanish copy in `#share` is Claude-drafted. The Spanish needs a member's review, and so does the "we will only share it publicly if you give permission" line, which commits the Congreso to something. Cultural authorship rests with the Congreso.
5. Optional: if VAN source codes are in use, add one to the petition URL for site attribution (not verified; check the EveryAction form settings).

## Risks and constraints

- **Web3Forms free tier:** 250 submissions a month, no file uploads (hence links for art), submissions pass through a third party.
- **mailto fallback** depends on the visitor's device having a mail app, and they still have to press send.
- **Status message language:** a message already on screen stays in its language if the visitor switches EN/ES afterward. Minor; new messages use the current language.
- **No CSP** in `vercel.json` today. If one is added, it must allow `connect-src https://api.web3forms.com`.

## Testing done

Headless Chrome via Playwright at 1280x800 and 390x844:
- Event content is removed and the standard hero shows
- Empty submit flags required fields; a missing story or link is caught; the own-work checkbox is enforced
- Valid submit with the placeholder key fires the expected `mailto:`
- ES toggle swaps labels, options, placeholders and the button
- No JS errors (only blocked Google Fonts requests from the sandbox)

## Project conventions to respect

- Plain hyphens, not em dashes, in new copy (older copy still has em dashes; leave it unless asked)
- Every visible string is bilingual via `data-en` / `data-es` (`data-html="true"` when it contains markup)
- Placeholder or pending content stays clearly marked as pending Congreso input
- No sacred or ceremonial symbols that haven't been vetted
- Don't describe River Sisters as a lobbying organization
- Single-file site: keep markup, styles and script inline in `index.html`

## Update: Congreso recap + sponsor thank-you (added Nov 14)

- New `#gracias` section right after the hero (`data-after="2026-11-13" hidden`, so it appears with the standard hero once merged): "Thank you for gathering with us", petition + Share your story buttons, a 5-photo mosaic, and a "Thank you to our sponsors" grid (Presented by + the five sponsor levels, reusing the `.cg-*` logo classes).
- Photos are Benjamin's own from the day (vetted for use). Compressed, metadata-stripped copies live in `assets/img/congreso-2026/`; the 15-23 MB originals in `assets/img/congreso/` are git-ignored.
- `#share` now shows the art-table photo under the notes.
- Recap copy (EN + ES) is Claude-drafted and needs the same Congreso review as the `#share` copy.
