# FinAI public dataset library

The public data library is available at \`/datasets\`. It lists only rows with
\`PublicDataset.published = true\` from the existing PostgreSQL database.

## What is public

- Catalogue metadata: title, summary, category, version, format, licence,
  source label, record count, and update time.
- Download files under \`frontend/public/datasets/\`.
- The first release contains a starter chart of accounts, synthetic ledger
  transactions, and synthetic invoices. Names and financial records are
  fictional.

The API is read-only: \`GET /api/v1/public/datasets\`. It is routed through the
existing same-origin Vercel API proxy. It does not expose tenant-specific
companies, invoices, accounts, users, sessions, assistant history, or any
other private application tables.

## Release procedure

The migration is additive; it creates only the \`PublicDataset\` catalogue
table, indexes, and three published catalogue rows. It does not modify,
truncate, seed, or reset company accounting data.

1. Review and merge the feature branch only after the Vercel preview build and
   public-route smoke test pass.
2. From the trusted operator environment connected to the intended production
   database, review the migration, then run:

   \`\`\`bash
   cd backend
   node node_modules/prisma/build/index.js migrate deploy
   \`\`\`

3. Deploy the reviewed production commit.
4. Check \`GET /api/v1/public/datasets\` returns the three published rows and
   download each CSV from \`/datasets/\`.

Do not run the local seed script against production. Builds do not apply
migrations automatically. Do not paste or disclose \`DATABASE_URL\` or any
other secret when checking environment configuration.

## Publishing more data

A new catalogue entry should be inserted with \`published = false\`, reviewed
for provenance, rights, privacy, correctness, and metadata, then explicitly
published. Keep downloadable assets in the public static directory only when
they are suitable for unrestricted public access. Never copy real customer,
supplier, employee, bank, invoice, or ledger records into this library.

Use a clear licence and source attribution for every new file. CC BY 4.0 is
applied to the three original FinAI files in this initial release; it is not
a blanket licence for third-party datasets.
