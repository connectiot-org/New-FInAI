CREATE TABLE "PublicDataset" (
  "id" uuid NOT NULL,
  "slug" varchar(100) NOT NULL,
  "title" varchar(180) NOT NULL,
  "summary" varchar(500) NOT NULL,
  "category" varchar(80) NOT NULL,
  "version" varchar(40) NOT NULL,
  "format" varchar(12) NOT NULL,
  "license" varchar(80) NOT NULL,
  "license_url" varchar(500) NOT NULL,
  "source_name" varchar(180) NOT NULL,
  "source_url" varchar(500),
  "record_count" integer NOT NULL CHECK ("record_count" >= 0),
  "published" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicDataset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicDataset_format_check" CHECK ("format" IN ('CSV', 'JSON'))
);

CREATE UNIQUE INDEX "PublicDataset_slug_key" ON "PublicDataset"("slug");
CREATE INDEX "public_dataset_catalog" ON "PublicDataset"("published", "category", "title");

INSERT INTO "PublicDataset" (
  "id", "slug", "title", "summary", "category", "version", "format",
  "license", "license_url", "source_name", "record_count", "published"
) VALUES
  (
    'b1c1d2e3-f4a5-4678-9012-3456789abc01',
    'chart-of-accounts',
    'Starter chart of accounts',
    'A practical, editable chart-of-accounts template for learning, prototypes, and early product development. Adapt it to your accounting framework and jurisdiction.',
    'Accounting template',
    '1.0.0',
    'CSV',
    'CC BY 4.0',
    'https://creativecommons.org/licenses/by/4.0/',
    'FinAI original template',
    20,
    true
  ),
  (
    'b1c1d2e3-f4a5-4678-9012-3456789abc02',
    'synthetic-ledger-transactions',
    'Synthetic ledger transactions',
    'Balanced double-entry examples across common asset, liability, equity, revenue, and expense accounts. All companies and transactions are fictional.',
    'Synthetic financial data',
    '1.0.0',
    'CSV',
    'CC BY 4.0',
    'https://creativecommons.org/licenses/by/4.0/',
    'FinAI synthetic examples',
    20,
    true
  ),
  (
    'b1c1d2e3-f4a5-4678-9012-3456789abc03',
    'synthetic-invoices',
    'Synthetic customer invoices',
    'Fictional invoice examples with dates, currencies, totals, payments, and statuses for testing receivables workflows and analytics.',
    'Synthetic financial data',
    '1.0.0',
    'CSV',
    'CC BY 4.0',
    'https://creativecommons.org/licenses/by/4.0/',
    'FinAI synthetic examples',
    10,
    true
  );
