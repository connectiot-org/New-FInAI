import { test, expect, type Page } from "@playwright/test";
const entityId = "22222222-2222-4222-8222-222222222222",
  conversationId = "33333333-3333-4333-8333-333333333333",
  turnId = "44444444-4444-4444-8444-444444444444",
  date = "2026-10-25T00:00:00.000Z";
const conversation = {
  id: conversationId,
  entityId,
  month: "2026-09",
  currency: "USD",
  version: 1,
  createdAt: date,
  expiresAt: "2026-11-24T00:00:00.000Z",
};
const caps = (configured = true) => ({
  configured,
  ledgerMappingsEnabled: false,
  model: configured ? "controlled-fixture" : null,
  policy: "grounded-facts-v1",
  limits: {
    conversations: 100,
    turns: 200,
    questionCharacters: 2000,
    leaseSeconds: 40,
    conversationDays: 30,
    preferenceDays: 365,
    maxTools: 3,
    tokenReservation: 50000,
  },
});
const response = {
  ...conversation,
  offset: 0,
  limit: 50,
  total: 0,
  turns: [] as unknown[],
};
const answer = {
  facts: [
    {
      id: "f1",
      label: "Outstanding source balance",
      value: "75000",
      unit: "minor",
      currency: "USD",
      precision: 2,
      sourceId: "s1",
    },
  ],
  sources: [
    {
      id: "s1",
      label: "Untrusted <script>alert(1)</script> source",
      href: `/workspace/receivables/invoices?entityId=${entityId}`,
      basis: "Issue month; cumulative paid, not aging",
      capturedAt: date,
      importedAt: date,
      retrievedAt: date,
      version: 1,
      snapshotId: conversationId,
    },
  ],
  notes: [],
  basis: "Server exact facts",
  detail: "concise",
};
const completed = {
  id: turnId,
  question: "Question",
  status: "completed",
  answer,
  failureCode: null,
  model: "controlled-fixture",
  policy: "grounded-facts-v1",
  createdAt: date,
  finishedAt: date,
};
const path = `/assistant?unused=1`,
  chatPath = `/workspace/assistant?entityId=${entityId}&month=2026-09&currency=USD&conversationId=${conversationId}`;
async function routes(p: Page, configured = true) {
  await p.route("**/auth/session", (r) =>
    r.fulfill({ json: { csrfToken: "a".repeat(64) } }),
  );
  await p.route("**/api/v1/workspace/context", (r) =>
    r.fulfill({
      json: {
        userId: entityId,
        organisationId: entityId,
        organisationName: "Private organisation",
        administrator: false,
        revision: "a".repeat(64),
        entities: [
          {
            id: entityId,
            name: "Private entity",
            canWrite: false,
            canImport: false,
          },
        ],
      },
    }),
  );
  await p.route("**/api/v1/assistant/capabilities", (r) =>
    r.fulfill({ json: caps(configured) }),
  );
  await p.route("**/api/v1/assistant/conversations?*", (r) =>
    r.fulfill({
      json: { offset: 0, limit: 20, total: 1, items: [conversation] },
    }),
  );
  await p.route(`**/api/v1/assistant/conversations/${conversationId}`, (r) =>
    r.fulfill({ json: response }),
  );
  await p.route("**/api/v1/assistant/preferences?*", (r) =>
    r.fulfill({ json: { items: [] } }),
  );
}
test("production selection redirects to one sign-in gate and never fetches private sources before login", async ({
  page,
}) => {
  await routes(page);
  await page.route("**/auth/session", (r) =>
    r.fulfill({ status: 401, json: { message: "Expired" } }),
  );
  const privateRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/")) privateRequests.push(r.url());
  });
  await page.goto(path);
  await expect(page).toHaveURL(/\/workspace\/assistant/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  expect(privateRequests).toEqual([]);
  await page.goto("/demo/assistant");
  await expect(page.getByText("Demo responses", { exact: true })).toBeVisible();
});
test("missing model configuration is explicit; no deterministic fallback or false financial answer", async ({
  page,
}) => {
  await routes(page, false);
  await page.goto(chatPath);
  await expect(
    page.getByRole("status").filter({ hasText: "Model unavailable" }),
  ).toBeVisible();
  await page.getByLabel("Ask FinAI", { exact: true }).fill("cash?");
  await expect(
    page.getByRole("button", { name: "Send question", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".assistant-turn")).toHaveCount(0);
  await expect(page.locator(".finance-snapshot")).toHaveCount(0);
});
test("uncertain send retries original UUID/payload, then displays only validated exact facts", async ({
  page,
}) => {
  await routes(page);
  let attempts = 0;
  const bodies: unknown[] = [];
  let finished = false;
  await page.route(
    `**/api/v1/assistant/conversations/${conversationId}/turns`,
    (r) => {
      bodies.push(r.request().postDataJSON());
      attempts++;
      if (attempts === 1) return r.abort();
      finished = true;
      return r.fulfill({
        status: 202,
        json: { conversationVersion: 2, turn: completed },
      });
    },
  );
  await page.route(`**/api/v1/assistant/conversations/${conversationId}`, (r) =>
    r.fulfill({
      json: finished
        ? { ...response, version: 2, total: 1, turns: [completed] }
        : response,
    }),
  );
  await page.goto(chatPath);
  await page
    .getByLabel("Ask FinAI", { exact: true })
    .fill("Who owes us money?");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same question", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry same question", exact: true })
    .click();
  await expect(page.locator(".assistant-turn")).toContainText("USD 750.00");
  expect(bodies[0]).toEqual(bodies[1]);
  expect(attempts).toBe(2);
  await page.getByText("Answer basis and sources").click();
  await expect(
    page.getByRole("link", {
      name: "Untrusted <script>alert(1)</script> source",
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test("rejected input is editable with a new request ID and malformed citations never render", async ({
  page,
}) => {
  await routes(page);
  let attempts = 0;
  const ids: string[] = [];
  await page.route(
    `**/api/v1/assistant/conversations/${conversationId}/turns`,
    (r) => {
      ids.push(r.request().postDataJSON().id);
      attempts++;
      return r.fulfill({ status: 422, json: { message: "Question rejected" } });
    },
  );
  await page.goto(chatPath);
  await page.getByLabel("Ask FinAI", { exact: true }).fill("Rejected");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Question rejected");
  await page.getByLabel("Ask FinAI", { exact: true }).fill("Corrected");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect.poll(() => attempts).toBe(2);
  expect(ids[0]).not.toBe(ids[1]);
  await page.route(`**/api/v1/assistant/conversations/${conversationId}`, (r) =>
    r.fulfill({
      json: {
        ...response,
        total: 1,
        turns: [
          {
            ...completed,
            answer: {
              ...answer,
              sources: [{ ...answer.sources[0], href: "https://evil.example" }],
            },
          },
        ],
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("inconsistent");
  await expect(page.locator(".assistant-turn")).toHaveCount(0);
});
test("401 clears private chat; long hostile names remain plain text and mobile fits", async ({
  page,
}) => {
  await routes(page);
  await page.route(`**/api/v1/assistant/conversations/${conversationId}`, (r) =>
    r.fulfill({
      json: {
        ...response,
        total: 1,
        turns: [
          {
            ...completed,
            answer: {
              ...answer,
              facts: [
                {
                  ...answer.facts[0],
                  label: "<img onerror=alert(1)>" + "長".repeat(200),
                },
              ],
            },
          },
        ],
      },
    }),
  );
  await page.goto(chatPath);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Ask FinAI", { exact: true }).focus();
    await expect(page.getByLabel("Ask FinAI", { exact: true })).toBeFocused();
    await page.screenshot({
      path: `artifacts/assistant/hostile-${width}.png`,
      fullPage: true,
    });
  }
  await expect(page.locator(".assistant-turn img")).toHaveCount(0);
  await page.route(`**/api/v1/assistant/conversations/${conversationId}`, (r) =>
    r.fulfill({ status: 401, json: { message: "Expired" } }),
  );
  await page
    .getByRole("button", { name: "Refresh conversation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your finance workspace" }),
  ).toBeVisible();
  await expect(page.locator(".assistant-turn")).toHaveCount(0);
});

test("scope change immediately clears a delayed old answer", async ({
  page,
}) => {
  await routes(page);
  await page.route(
    `**/api/v1/assistant/conversations/${conversationId}`,
    async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await r
        .fulfill({ json: { ...response, total: 1, turns: [completed] } })
        .catch(() => {});
    },
  );
  await page.goto(chatPath);
  await page.getByLabel("Assistant month", { exact: true }).fill("2026-08");
  await expect(
    page.getByRole("heading", {
      name: "Start a scoped conversation",
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.locator(".assistant-turn")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("USD 750.00");
});
test("preference conflict never claims saved; confirmed forget clears future preference controls", async ({
  page,
}) => {
  await routes(page);
  let exists = true;
  const p = {
    id: turnId,
    entityId,
    detail: "detailed",
    note: "Original private preference",
    version: 1,
    createdAt: date,
    updatedAt: date,
    expiresAt: "2027-10-25T00:00:00.000Z",
  };
  await page.route("**/api/v1/assistant/preferences?*", (r) =>
    r.fulfill({ json: { items: exists ? [p] : [] } }),
  );
  await page.route(`**/api/v1/assistant/preferences/${turnId}`, (r) => {
    if (r.request().method() === "PUT")
      return r.fulfill({
        status: 409,
        json: { message: "Preference changed. Reload before editing." },
      });
    exists = false;
    return r.fulfill({ json: { status: "forgotten" } });
  });
  await page.goto(chatPath);
  await page
    .getByLabel("Preference note", { exact: true })
    .fill("Changed but not committed");
  await page
    .getByRole("button", { name: "Save preference changes", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Preference changed");
  await expect(
    page.getByText("Preference saved for future questions in this entity.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Forget preference", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Confirm forgetting preference" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm forget preference", exact: true })
    .click();
  await expect(page.getByLabel("Preference note", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Answer detail", { exact: true })).toHaveValue(
    "concise",
  );
});

test("creation retry retains its UUID only within the same scope after reopening another chat", async ({
  page,
}) => {
  await routes(page);
  const bodies: {
    id: string;
    entityId: string;
    month: string;
    currency: string;
  }[] = [];
  await page.route("**/api/v1/assistant/conversations", (r) => {
    bodies.push(r.request().postDataJSON());
    return r.fulfill({
      status: 503,
      json: { message: "Creation response uncertain" },
    });
  });
  await page.goto(
    `/workspace/assistant?entityId=${entityId}&month=2026-08&currency=USD`,
  );
  await expect(
    page.getByRole("button", { name: /2026-09 · USD/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Creation response uncertain",
  );
  await page
    .getByRole("button", { name: "Retry conversation creation", exact: true })
    .click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await expect(
    page.getByRole("button", {
      name: "Retry conversation creation",
      exact: true,
    }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /2026-09 · USD/ }).click();
  await expect(page.getByLabel("Assistant month", { exact: true })).toHaveValue(
    "2026-09",
  );
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect.poll(() => bodies.length).toBe(3);
  expect(bodies[2]).toMatchObject({
    entityId,
    month: "2026-09",
    currency: "USD",
  });
  expect(bodies[2].id).not.toBe(bodies[0].id);
});

test("Ask FinAI and the explicit demo link open the real authenticated Assistant", async ({
  page,
}) => {
  await routes(page, false);
  await page.goto("/overview");
  await page.getByRole("button", { name: "Ask FinAI", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/assistant/);
  await expect(
    page.getByRole("status").filter({ hasText: "Model unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "FinAI Assistant demo" }),
  ).toHaveCount(0);
  await page.goto("/demo/assistant");
  await expect(
    page.getByRole("heading", { name: "FinAI Assistant demo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: "Open the authenticated FinAI Assistant",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/workspace\/assistant/);
  await expect(page.locator(".assistant-disclaimer")).toHaveCount(0);
});
