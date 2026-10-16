# Reference evidence

Inspected 2026-10-16. No supplied product screenshots were attached; the uploaded file is a requirements brief.

| Source                                                  | Screen/component | Observable evidence                                                                                            | FinAI routes              | Confidence                        |
| ------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------- |
| https://www.rillet.com/                                 | Public homepage  | HTTPS request denied by environment proxy (403); no visual evidence retrieved                                  | Shell                     | Inferred                          |
| https://www.rillet.com/product/automated-general-ledger | General ledger   | HTTPS request denied by environment proxy (403); dimensions, font, tokens, navigation and interactions unknown | /accounting/_, /reports/_ | Inferred                          |
| https://www.rillet.com/product/aura-ai                  | Assistant        | HTTPS request denied by environment proxy (403); no interface observed                                         | /assistant                | Inferred                          |
| FinAI_Frontend_Only_Codex_Prompt.md                     | Product scope    | Explicit route inventory, compact accounting workspace, local workflows, responsive requirements               | All                       | Requirements, not visual evidence |

The implementation uses an original FinAI design: pale neutral canvas, forest sidebar and accent, compact 44px table rows, 248px sidebar, 14px body type, 560px detail drawer. All values are fallback design choices. Marketing styling was not treated as product evidence. No pixel-accuracy or Rillet visual-fidelity claim is made. Public-page access remains a follow-up for visual comparison; no access controls were bypassed.

## Homepage follow-up

The user expanded the scope to include a public homepage and product presentation. Direct HTTPS and **live Chromium through the configured proxy** were tested against the three Rillet URLs. Chromium returned `ERR_TUNNEL_CONNECTION_FAILED`; HTTPS returned proxy `403`. No Rillet page, screenshot, font, color, layout, menu, or private application screen was observed. The environment configuration draft now includes `rillet.com` and `www.rillet.com`; saving the draft did not activate access on this machine.

The new public FinAI homepage, six product pages, resources/about pages, typography, diagrams, and interactions are **original fallback design**, built after the user instructed work to continue despite the access blocker. They are not a copy or a verified visual match of Rillet. The homepage preview renders canonical local state and links to functional accounting routes; synthetic demo company names are explicitly labeled. No Rillet logos, page images, testimonials, customer claims, or proprietary assets are used.

Routes: `/`, `/product/automated-general-ledger`, `/product/accounts-receivable`, `/product/accounts-payable`, `/product/financial-reporting`, `/product/month-end-close`, `/product/assistant`, `/resources`, `/about`. Reference confidence for all remains inferred. Exact visual matching is still pending accessible references.
