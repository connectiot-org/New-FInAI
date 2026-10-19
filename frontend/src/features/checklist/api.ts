import { z } from "zod";

export const checklistMode = import.meta.env.VITE_CHECKLIST_MODE || "demo";
export const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
const taskSchema = z.strictObject({
  id: z.uuid(),
  entityId: z.uuid(),
  month: z.string().regex(monthPattern),
  title: z
    .string()
    .min(1)
    .refine((s) => Array.from(s).length <= 200),
  completed: z.boolean(),
  version: z.number().int().positive().max(2147483647),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const entitySchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(200),
});
const listSchema = z.strictObject({
  items: z.array(taskSchema).max(200),
  summary: z.strictObject({
    total: z.number().int().min(0).max(200),
    completed: z.number().int().min(0).max(200),
    percent: z.number().int().min(0).max(100),
  }),
});
const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.uuid(),
});
export type ChecklistTask = z.infer<typeof taskSchema>;
export type ChecklistList = z.infer<typeof listSchema>;
export type ChecklistEntity = z.infer<typeof entitySchema>;
export type CreateTask = {
  id: string;
  entityId: string;
  month: string;
  title: string;
};
export class ChecklistError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "NETWORK_ERROR",
  ) {
    super(message);
  }
}
export interface ChecklistClient {
  entities(signal?: AbortSignal): Promise<ChecklistEntity[]>;
  list(
    entityId: string,
    month: string,
    signal?: AbortSignal,
  ): Promise<ChecklistList>;
  create(input: CreateTask): Promise<ChecklistTask>;
  complete(
    id: string,
    completed: boolean,
    expectedVersion: number,
  ): Promise<ChecklistTask>;
  remove(id: string, expectedVersion: number): Promise<void>;
}
const summaryFor = (items: ChecklistTask[]) => {
  const total = items.length,
    completed = items.filter((t) => t.completed).length;
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
};
class ApiClient implements ChecklistClient {
  private async request(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    if (checklistMode !== "api")
      throw new ChecklistError("Checklist mode is not configured correctly.");
    const base =
      import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000/api/v1";
    let url: URL;
    try {
      url = new URL(base.replace(/\/$/, "") + path, window.location.origin);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      throw new ChecklistError(
        "The checklist API address is not configured correctly.",
      );
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        credentials: "omit",
        headers: {
          ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ChecklistError(
        "Cannot reach the checklist backend. Check the connection and try again.",
      );
    }
    if (response.status === 204 && method === "DELETE") return;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ChecklistError(
        "The checklist backend returned an invalid response.",
        response.status,
        "INVALID_RESPONSE",
      );
    }
    if (!response.ok) {
      const error = errorSchema.safeParse(data);
      throw new ChecklistError(
        error.success ? error.data.message : "The checklist request failed.",
        response.status,
        error.success ? error.data.code : "INVALID_RESPONSE",
      );
    }
    const expected = method === "POST" ? [200, 201] : [200];
    if (method === "DELETE" || !expected.includes(response.status))
      throw new ChecklistError(
        "The checklist backend returned an unexpected status.",
        0,
        "INVALID_RESPONSE",
      );
    return data;
  }
  private decode<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new ChecklistError(
        "The checklist backend returned an invalid response.",
        0,
        "INVALID_RESPONSE",
      );
    return parsed.data;
  }
  async entities(signal?: AbortSignal) {
    return this.decode(
      z.strictObject({ items: z.array(entitySchema) }),
      await this.request("/entities", "GET", undefined, signal),
    ).items;
  }
  async list(entityId: string, month: string, signal?: AbortSignal) {
    const result = this.decode(
      listSchema,
      await this.request(
        `/checklist-tasks?${new URLSearchParams({ entityId, month })}`,
        "GET",
        undefined,
        signal,
      ),
    );
    const expectedSummary = summaryFor(result.items);
    if (
      result.items.some((t) => t.entityId !== entityId || t.month !== month) ||
      new Set(result.items.map((t) => t.id)).size !== result.items.length ||
      result.summary.total !== expectedSummary.total ||
      result.summary.completed !== expectedSummary.completed ||
      result.summary.percent !== expectedSummary.percent
    )
      throw new ChecklistError(
        "The checklist backend returned an inconsistent list.",
        0,
        "INVALID_RESPONSE",
      );
    return result;
  }
  async create(input: CreateTask) {
    const task = this.decode(
      taskSchema,
      await this.request("/checklist-tasks", "POST", input),
    );
    if (
      task.id !== input.id ||
      task.entityId !== input.entityId ||
      task.month !== input.month ||
      task.title !== input.title.trim()
    )
      throw new ChecklistError(
        "The checklist backend returned an inconsistent task.",
      );
    return task;
  }
  async complete(id: string, completed: boolean, expectedVersion: number) {
    const task = this.decode(
      taskSchema,
      await this.request(`/checklist-tasks/${id}`, "PATCH", {
        completed,
        expectedVersion,
      }),
    );
    if (
      task.id !== id ||
      task.completed !== completed ||
      task.version !== expectedVersion + 1
    )
      throw new ChecklistError(
        "The checklist backend returned an inconsistent task.",
      );
    return task;
  }
  async remove(id: string, expectedVersion: number) {
    await this.request(
      `/checklist-tasks/${id}`,
      "DELETE",
      undefined,
      undefined,
      { "If-Match": `"${expectedVersion}"` },
    );
  }
}
// Explicit session-only demo, independent of financial demo state. Never used after API failure.
const demoEntity = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  name: "Checklist demo entity",
};
const demoTasks = new Map<string, ChecklistTask>();
class DemoClient implements ChecklistClient {
  async entities() {
    return [demoEntity];
  }
  async list(entityId: string, month: string) {
    const items = [...demoTasks.values()]
      .filter((t) => t.entityId === entityId && t.month === month)
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    return { items, summary: summaryFor(items) };
  }
  async create(input: CreateTask) {
    const existing = demoTasks.get(input.id);
    if (existing) return existing;
    const list = await this.list(input.entityId, input.month);
    if (list.items.length >= 200)
      throw new ChecklistError(
        "This month already has 200 tasks.",
        409,
        "CAPACITY_REACHED",
      );
    const now = new Date().toISOString();
    const task = {
      ...input,
      title: input.title.trim(),
      completed: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    demoTasks.set(task.id, task);
    return task;
  }
  async complete(id: string, completed: boolean, expectedVersion: number) {
    const task = demoTasks.get(id);
    if (!task || task.version !== expectedVersion)
      throw new ChecklistError("Task changed. Reload before retrying.", 409);
    const updated = {
      ...task,
      completed,
      version: task.version + 1,
      updatedAt: new Date().toISOString(),
    };
    demoTasks.set(id, updated);
    return updated;
  }
  async remove(id: string, expectedVersion: number) {
    const task = demoTasks.get(id);
    if (!task || task.version !== expectedVersion)
      throw new ChecklistError("Task changed. Reload before retrying.", 409);
    demoTasks.delete(id);
  }
}
export const checklistClient: ChecklistClient =
  checklistMode === "demo" ? new DemoClient() : new ApiClient();
