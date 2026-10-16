# Reference evidence

Inspected 2026-10-16. No supplied product screenshots were attached; the uploaded file is a requirements brief.

| Source                                                  | Screen/component | Observable evidence                                                                                            | FinAI routes              | Confidence                        |
| ------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------- |
| https://www.rillet.com/                                 | Public homepage  | HTTPS request denied by environment proxy (403); no visual evidence retrieved                                  | Shell                     | Inferred                          |
| https://www.rillet.com/product/automated-general-ledger | General ledger   | HTTPS request denied by environment proxy (403); dimensions, font, tokens, navigation and interactions unknown | /accounting/_, /reports/_ | Inferred                          |
| https://www.rillet.com/product/aura-ai                  | Assistant        | HTTPS request denied by environment proxy (403); no interface observed                                         | /assistant                | Inferred                          |
| FinAI_Frontend_Only_Codex_Prompt.md                     | Product scope    | Explicit route inventory, compact accounting workspace, local workflows, responsive requirements               | All                       | Requirements, not visual evidence |

The implementation uses an original FinAI design: pale neutral canvas, forest sidebar and accent, compact 44px table rows, 248px sidebar, 14px body type, 560px detail drawer. All values are fallback design choices. Marketing styling was not treated as product evidence. No pixel-accuracy or Rillet visual-fidelity claim is made. Public-page access remains a follow-up for visual comparison; no access controls were bypassed.
