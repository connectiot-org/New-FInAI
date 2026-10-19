# Reference evidence

Inspected 2026-10-16. The user requested a close reproduction of https://www.rillet.com/. The uploaded Markdown file defines the frontend accounting scope; it is not visual reference evidence. This update supersedes the earlier proxy-blocked fallback design.

## Acquisition and scope

Public homepage, general-ledger page and AI page HTML returned HTTP 200 over verified HTTPS. The homepage's shared CSS, inline styles, Google font CSS, fonts and public imagery were retrieved with TLS verification. The shared CSS SHA-384 integrity matched the source HTML. Chromium rendered an isolated local static copy of the public homepage; third-party scripts were omitted, external requests blocked, and a verified poster substituted for the hero video. This exposes layout and static styling, not the live site's animations or authenticated application.

Direct proxy-based Chromium navigation encountered an untrusted environment proxy certificate. Automatic review rejected adding that certificate to the persistent browser trust database. No trust store was changed, no TLS validation was disabled, and the verified local rendering provided the reference instead.

| Source                                | Observed evidence                                                                                                               | FinAI application                                                             | Confidence                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Public Rillet homepage HTML/CSS/fonts | White/black navigation, DM Sans body, Space Grotesk headings, scaling desktop typography, mobile stacking                       | Public shell and homepage                                                     | Directly observed static reference                               |
| Public homepage hero and poster       | Two-column copy, city backdrop, centered white dashboard, thin rail, assistant prompt, metrics, action/checklist/report columns | Own React dashboard backed by canonical demo state; shared workspace snapshot | Directly observed composition; own functional implementation     |
| Platform section                      | Eight cards in a 4×2 desktop grid, pale card backgrounds and borders, lower illustrations                                       | Eight working product links and self-rendered illustrations                   | Directly observed structure; own illustrations                   |
| AI/integration/story/footer sections  | Deep-purple AI band, integration tiles, story carousel structure, badges, purple CTA and white footer                           | Local workflow stories, demo integrations/badges, persisted guide bookmark    | Observed structure; truthful demo substitutions                  |
| Public general-ledger and AI HTML     | Navigation inventory, public headings and product positioning                                                                   | Twelve local product pages with functional accounting links                   | Public source observed; individual layouts not claimed identical |
| FinAI_Frontend_Only_Codex_Prompt.md   | Required route inventory, accounting flows, frontend-only and responsive constraints                                            | All accounting routes                                                         | Requirements evidence                                            |

## Measured hero comparison

The Playwright geometry check uses the following captured targets, with less than four pixels of tolerance. Current production measurements are in `homepage-validation.json`.

| Viewport | Headline x / y / font size | City stage x / y / width / height    |
| -------- | -------------------------- | ------------------------------------ |
| 1440     | 51.69 / 182.73 / 59.08 px  | 51.69 / 371.02 / 1336.63 / 703.72 px |
| 390      | 24 / 210 / 40 px           | 0 / 475.59 / 390 / 223.75 px         |

Desktop shared heading weight is 500; body text is DM Sans with 18/24 px leading in the hero. Primary CTAs are black, card borders are near #e4e4e7, and the AI/CTA sections use deep purple. Source desktop styles scale from 991 to 1560 pixels; the mobile header is 80 pixels with 24-pixel content gutters.

`reference/rillet-home-1440-top.png` and `reference/rillet-home-390-top.png` retain attributed public reference captures for comparison with `screenshots/homepage-*-top.png`. `reference/computed-home-1440.json` records source computed styles. These captures are documentation, not application screens or a claim of ownership.

## Deliberate differences and limits

FinAI's name, working controls, synthetic Northstar data, demo labels and local persistence remain. No real Rillet customer endorsement, G2 rating or certification is asserted for FinAI. Workflow stories and demo badges occupy those structural positions. Application artwork is original, including the replacement geometric city illustration described in `reference-assets.md`. Historical captures may show the previously borrowed city photograph. No Rillet screenshot serves as the functioning app.

The workspace palette, compact rail and overview composition follow visible public previews. Private Rillet accounting screens, hidden states, authenticated interactions, live animations and all source-site integrations were not verified. The complete site and every private screen are not claimed pixel-identical.

## REA-assisted follow-up

The user selected [morluto/rea](https://github.com/morluto/rea) and its [reverse-engineer-anything skill](https://github.com/morluto/rea/blob/180ba03bfddd5916251e81e97a500b1ede7a9eea/.agents/skills/reverse-engineer-anything/SKILL.md). The official 6.5.0 CLI performed four complete homepage captures and two screenshot comparisons. `rea-validation.json` preserves actual REA Evidence IDs, screenshot digests, completeness, cleanup, metrics and limits. These are runtime observations of the declared local static reference and FinAI URLs, not live remote-script or authenticated-page observations.

A separate Playwright geometry audit measured full-section layouts, distinguishing those measurements from REA's pixel comparisons. `rea-section-comparison.json` includes before/after/reference values. It identified the single-column mobile platform layout, 24px gaps, larger source cards/section insets, the 20%/80% AI rail and product-page structure. The implementation now follows these observations. The public general-ledger source showed a gray-gradient hero, three boxed benefits, four large cards in two columns, a lavender split panel, related features and purple CTA; FinAI recreates that hierarchy with canonical local records. Product-specific reference images were absent from the retained homepage asset cache, so absolute product-page positions are not claimed identical.

The scripts and complete clone-to-compare commands are in [rea-workflow.md](rea-workflow.md). A new standard-library reference preparer verified all 116 assets and the declared CSS integrity. Its isolated render compared with the earlier static reference at zero changed pixels in the 1440×1000 viewport. FinAI's intentional branding, copy, records and honest demo labels still differ from Rillet; the actual comparison status is `different`.

## Content and UI review — 2026-10-19

The current revision preserves the reference-informed layout while using the FinAI monogram, original geometric city art, independent headline and ledger copy, fictional company marks, integration category icons, and interactive workflow stories in place of endorsement/review content. No competitor testimonial, rating, customer logo or certification is presented as FinAI proof. Product categories remain available through twelve public product pages; local demonstrations are described according to their actual capabilities.

A fresh verified-HTTPS reference capture was attempted but the proxy returned `403 Forbidden`. This review therefore uses the existing attributed reference captures for visual context, rather than claiming a new live inspection or complete parity with current competitor content. REA CLI browser observations and the frontend route audit are recorded in `content-ui-review.md`.
