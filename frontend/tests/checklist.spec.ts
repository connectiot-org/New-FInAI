import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const api = "http://127.0.0.1:3001/api/v1";
let server: ChildProcess;
let entities: { id: string; name: string }[];
const month = `${4000 + Math.floor(Math.random() * 5000)}-01`;
const nextMonth = month.replace(/01$/, "02");
const cleanup = new Set<string>();
async function start() {
  server = spawn(process.execPath, ["--env-file=.env", "dist/src/main.js"], {
    cwd: "../backend",
    env: { ...process.env, NODE_ENV: "test", API_PORT: "3001" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("Checklist test API failed to start");
    try {
      if ((await fetch("http://127.0.0.1:3001/health/ready")).ok) return;
    } catch {
      /* wait for real readiness */
    }
    await delay(100);
  }
  throw new Error("Checklist test API did not become ready");
}
async function stop() {
  if (server.exitCode === null) {
    const closed = new Promise<void>((resolve) =>
      server.once("exit", () => resolve()),
    );
    server.kill("SIGTERM");
    await closed;
  }
}
async function open(page: Page, selectedMonth = month) {
  await page.goto(
    `/close/checklist?entity=${entities[0].id}&month=${selectedMonth}`,
  );
  await expect(
    page.getByRole("button", { name: "Add task", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
}
async function add(page: Page, title: string) {
  await page.getByLabel("Task title").fill(title);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: title, exact: true }),
  ).toBeVisible();
}
const row = (page: Page, title: string) =>
  page.getByRole("checkbox", { name: title, exact: true });
test.beforeAll(async () => {
  await start();
  const response = await fetch(api + "/entities");
  entities = (await response.json()).items;
});
test.afterAll(async () => {
  try {
    for (const id of cleanup) {
      const response = await fetch(
        `${api}/checklist-tasks?entityId=${entities[0].id}&month=${month}`,
      );
      const list = await response.json();
      const task = list.items?.find((t: { id: string }) => t.id === id);
      if (task)
        await fetch(`${api}/checklist-tasks/${id}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "If-Match": `"${task.version}"`,
          },
        });
    }
  } finally {
    await stop();
  }
});
test.beforeEach(async ({ page }) => {
  page.on("response", (response) => {
    if (
      response.url() === api + "/checklist-tasks" &&
      response.request().method() === "POST" &&
      response.ok()
    )
      void response.json().then((task: { id: string }) => cleanup.add(task.id));
  });
});

test("real backend journey: progress, refresh, API restart, reopen, confirmed delete, isolation and demo reset", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText("Local backend", { exact: true })).toBeVisible();
  await add(page, "Review bank statement");
  await add(page, "Check monthly documents");
  await row(page, "Review bank statement").click();
  await expect(row(page, "Review bank statement")).toBeChecked();
  await expect(page.getByText("1/2 completed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Checklist completion" }),
  ).toHaveAttribute("aria-valuenow", "50");
  await page.reload();
  await expect(row(page, "Review bank statement")).toBeChecked();
  await stop();
  await start();
  await page.reload();
  await expect(page.getByText("1/2 completed", { exact: true })).toBeVisible();
  await row(page, "Review bank statement").click();
  await expect(row(page, "Review bank statement")).not.toBeChecked();
  await expect(page.getByText("0/2 completed", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Delete Check monthly documents",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row(page, "Check monthly documents")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Delete Check monthly documents",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("0/1 completed", { exact: true })).toBeVisible();
  await page.getByLabel("Checklist month").fill(nextMonth);
  await expect(
    page.getByText("Add your first monthly task.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await page.getByLabel("Checklist month").fill(month);
  await expect(row(page, "Review bank statement")).toBeVisible();
  await page.getByLabel("Checklist entity").selectOption(entities[1].id);
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
  await page.goto("/settings/preferences");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset everything locally", exact: true })
    .click();
  await page.goto(`/close/checklist?entity=${entities[0].id}&month=${month}`);
  await expect(row(page, "Review bank statement")).toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem("finai-demo-v1"),
  );
  expect(stored).not.toContain("Review bank statement");
  await page
    .getByRole("button", { name: "Delete Review bank statement", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
});

test("stopping the real backend shows a failed save and safe retry never creates duplicate tasks", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Task title").fill("Retry me once");
  await stop();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cannot reach the checklist backend",
  );
  await expect(row(page, "Retry me once")).toHaveCount(0);
  await start();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(row(page, "Retry me once")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Delete Retry me once", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
});

test("a lost successful create response retries the same UUID and produces one task", async ({
  page,
}) => {
  await open(page);
  let lost = false;
  const ids: string[] = [];
  await page.route(api + "/checklist-tasks", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    ids.push(route.request().postDataJSON().id);
    if (!lost) {
      lost = true;
      const response = await route.fetch();
      cleanup.add((await response.json()).id);
      await route.abort();
    } else await route.continue();
  });
  await page.getByLabel("Task title").fill("Acknowledgement lost");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(row(page, "Acknowledgement lost")).toHaveCount(1);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await page
    .getByRole("button", { name: "Delete Acknowledgement lost", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
});

test("stale versions reload with an explicit conflict message and no silent overwrite", async ({
  page,
}) => {
  await open(page);
  await add(page, "Concurrent review");
  const list = await (
    await fetch(
      `${api}/checklist-tasks?entityId=${entities[0].id}&month=${month}`,
    )
  ).json();
  const task = list.items.find(
    (t: { title: string }) => t.title === "Concurrent review",
  );
  await fetch(`${api}/checklist-tasks/${task.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true, expectedVersion: task.version }),
  });
  await row(page, "Concurrent review").click();
  await expect(page.getByRole("alert")).toContainText(
    "review it before trying again",
  );
  await expect(row(page, "Concurrent review")).toBeChecked();
  await page
    .getByRole("button", { name: "Delete Concurrent review", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
});

test("delayed old-month responses cannot overwrite the selected month", async ({
  page,
}) => {
  let fulfilled!: () => void;
  const oldResponseFinished = new Promise<void>((resolve) => {
    fulfilled = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(api + "/checklist-tasks?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("month") === month) {
      started();
      await gate;
      await route.fulfill({
        json: { items: [], summary: { total: 0, completed: 0, percent: 0 } },
      });
      fulfilled();
    } else await route.continue();
  });
  await page.goto(`/close/checklist?entity=${entities[0].id}&month=${month}`);
  await waiting;
  await expect(
    page.getByText("Loading checklist…", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Checklist month").fill(nextMonth);
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
  release();
  await oldResponseFinished;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.getByLabel("Checklist month")).toHaveValue(nextMonth);
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
});

for (const status of [401, 403, 503])
  test(`HTTP ${status} stays visible with no fixture fallback`, async ({
    page,
  }) => {
    await page.route(api + "/checklist-tasks?*", (route) =>
      route.fulfill({
        status,
        json: {
          code: "UNAVAILABLE",
          message: `Checklist unavailable (${status})`,
          requestId: "44444444-4444-4444-8444-444444444444",
        },
      }),
    );
    await page.goto(`/close/checklist?entity=${entities[0].id}&month=${month}`);
    await expect(page.getByRole("alert")).toContainText(
      `Checklist unavailable (${status})`,
    );
    await expect(
      page.getByRole("button", { name: "Add task", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Add your first monthly task.", { exact: true }),
    ).toHaveCount(0);
  });

test("invalid response shape and failed entity discovery remain visible", async ({
  page,
}) => {
  await page.route(api + "/checklist-tasks?*", (route) =>
    route.fulfill({
      json: { items: [], summary: { total: 20, completed: 0, percent: 0 } },
    }),
  );
  await page.goto(`/close/checklist?entity=${entities[0].id}&month=${month}`);
  await expect(page.getByRole("alert")).toContainText("inconsistent list");
  await page.route(api + "/entities", (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Cannot reach");
  await expect(
    page.getByRole("button", { name: "Add task", exact: true }),
  ).toBeDisabled();
});

test("rejected input can be corrected, and mobile checklist stays contained", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  let rejected = false;
  await page.route(api + "/checklist-tasks", async (route) => {
    if (route.request().method() === "POST" && !rejected) {
      rejected = true;
      await route.fulfill({
        status: 422,
        json: {
          code: "VALIDATION_FAILED",
          message: "Correct the task title",
          requestId: "44444444-4444-4444-8444-444444444444",
        },
      });
    } else await route.continue();
  });
  await page.getByLabel("Task title").fill("First title");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Correct the task title");
  await add(page, "Corrected title");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Delete Corrected title", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
});

test("a rejected completion stays unchecked and does not claim success", async ({
  page,
}) => {
  await open(page);
  await add(page, "Save must be confirmed");
  await page.route(api + "/checklist-tasks/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Save unavailable",
            requestId: "44444444-4444-4444-8444-444444444444",
          },
        })
      : route.continue(),
  );
  await row(page, "Save must be confirmed").click();
  await expect(page.getByRole("alert")).toContainText("Save unavailable");
  await expect(row(page, "Save must be confirmed")).not.toBeChecked();
  await expect(page.getByText("0/1 completed", { exact: true })).toBeVisible();
  await page.unroute(api + "/checklist-tasks/*");
  await page
    .getByRole("button", { name: "Delete Save must be confirmed", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByText("0/0 completed", { exact: true })).toBeVisible();
});

async function clearMonths(months: string[]) {
  for (const selected of months) {
    const r = await fetch(
      `${api}/checklist-tasks?entityId=${entities[0].id}&month=${selected}`,
    );
    const list = await r.json();
    for (const task of list.items)
      await fetch(`${api}/checklist-tasks/${task.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${task.version}"`,
        },
      });
  }
}
async function seedCopySource(selected: string) {
  const r = await fetch(`${api}/checklist-tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      entityId: entities[0].id,
      month: selected,
      title: "Carry bank review",
    }),
  });
  expect(r.status).toBe(201);
  return r.json();
}
test("copy confirmation, cancellation, incomplete progress, source preservation, refresh and mobile keyboard", async ({
  page,
}) => {
  const year = 6000 + Math.floor(Math.random() * 1000),
    source = `${year}-09`,
    destination = `${year}-10`;
  try {
    const original = await seedCopySource(source);
    await fetch(`${api}/checklist-tasks/${original.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true, expectedVersion: 1 }),
    });
    await open(page, destination);
    const button = page.getByRole("button", {
      name: "Copy last month’s tasks",
      exact: true,
    });
    await button.click();
    await expect(page.getByRole("dialog")).toContainText(
      `${source} into ${destination}`,
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("0/0 completed", { exact: true }),
    ).toBeVisible();
    await button.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Copy tasks", exact: true }).click();
    await expect(
      page.getByText(`Copied 1 tasks from ${source} to ${destination}.`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(row(page, "Carry bank review")).not.toBeChecked();
    await expect(
      page.getByText("0/1 completed", { exact: true }),
    ).toBeVisible();
    await expect(button).toBeDisabled();
    await page.reload();
    await expect(row(page, "Carry bank review")).not.toBeChecked();
    const sourceList = await (
      await fetch(
        `${api}/checklist-tasks?entityId=${entities[0].id}&month=${source}`,
      )
    ).json();
    expect(sourceList.items[0].completed).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await clearMonths([source, destination]);
  }
});
test("copy empty source, occupied conflict, uncertain persisted response, pending guard and changed scope", async ({
  page,
}) => {
  const year = 7100 + Math.floor(Math.random() * 1000),
    source = `${year}-03`,
    destination = `${year}-04`;
  try {
    await open(page, destination);
    const button = page.getByRole("button", {
      name: "Copy last month’s tasks",
      exact: true,
    });
    await button.click();
    await page.getByRole("button", { name: "Copy tasks", exact: true }).click();
    await expect(
      page.getByText(`No tasks in ${source}. Nothing was copied.`, {
        exact: true,
      }),
    ).toBeVisible();
    await seedCopySource(source);
    // Another client fills the previously empty destination before confirmation.
    await seedCopySource(destination);
    await button.click();
    await page.getByRole("button", { name: "Copy tasks", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "destination month already contains tasks",
    );
    await expect(button).toBeDisabled();
    await clearMonths([destination]);
    await page.reload();
    await expect(button).toBeEnabled();
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/checklist-tasks/copy-previous-month",
      async (route) => {
        calls++;
        await route.fetch();
        await gate;
        await route.abort("failed");
      },
    );
    await button.click();
    await page.getByRole("button", { name: "Copy tasks", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Copying…", exact: true }),
    ).toBeDisabled();
    release();
    await expect(page.getByRole("alert")).toContainText(
      "Reloading the destination",
    );
    await expect(row(page, "Carry bank review")).toBeVisible();
    expect(calls).toBe(1);
    await expect(button).toBeDisabled();
    await expect(
      page.getByText(`Copied 1 tasks from ${source} to ${destination}.`, {
        exact: true,
      }),
    ).toHaveCount(0);
    await page.unroute("**/checklist-tasks/copy-previous-month");
    await page.reload();
    await expect(row(page, "Carry bank review")).toBeVisible();
  } finally {
    await clearMonths([source, destination]);
  }
});

test("copy response after browser-back cannot overwrite a different month", async ({
  page,
}) => {
  const year = 8200 + Math.floor(Math.random() * 500),
    source = `${year}-07`,
    destination = `${year}-08`;
  let release: () => void = () => {};
  try {
    await seedCopySource(source);
    await page.goto(
      `/close/checklist?entity=${entities[0].id}&month=${source}`,
    );
    await expect(row(page, "Carry bank review")).toBeVisible();
    await page.getByLabel("Checklist month").fill(destination);
    const button = page.getByRole("button", {
      name: "Copy last month’s tasks",
      exact: true,
    });
    await expect(button).toBeEnabled();
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/checklist-tasks/copy-previous-month",
      async (route) => {
        const r = await route.fetch();
        await gate;
        await route.fulfill({ response: r });
      },
    );
    await button.click();
    await page.getByRole("button", { name: "Copy tasks", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Copying…", exact: true }),
    ).toBeDisabled();
    await page.goBack();
    await expect(page.getByLabel("Checklist month")).toHaveValue(source);
    release();
    await expect(row(page, "Carry bank review")).toBeVisible();
    await expect(
      page.getByText(`Copied 1 tasks from ${source} to ${destination}.`, {
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    release();
    await clearMonths([source, destination]);
  }
});
