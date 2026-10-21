import { Inject, Injectable } from "@nestjs/common";
import type { ChecklistTask } from "@prisma/client";
import { ChecklistRepository } from "./checklist.repository";
import type { Identity } from "./config";
import type { CreateInput } from "./validation";
export const serialize = (task: ChecklistTask) => ({
  id: task.id,
  entityId: task.entityId,
  month: task.month.toISOString().slice(0, 7),
  title: task.title,
  completed: task.completed,
  version: task.version,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
});
@Injectable()
export class ChecklistService {
  constructor(@Inject(ChecklistRepository) private repo: ChecklistRepository) {}
  async entities(identity: Identity) {
    return { items: await this.repo.entities(identity) };
  }
  async list(identity: Identity, entityId: string, month: string) {
    const tasks = await this.repo.list(identity, entityId, month),
      total = tasks.length,
      completed = tasks.filter((t) => t.completed).length;
    return {
      items: tasks.map(serialize),
      summary: {
        total,
        completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
      },
    };
  }
  async create(identity: Identity, input: CreateInput) {
    const result = await this.repo.create(identity, input);
    return { task: serialize(result.task), created: result.created };
  }
  copyPreviousMonth(identity: Identity, entityId: string, month: string) {
    return this.repo.copyPreviousMonth(identity, entityId, month);
  }
  async change(
    identity: Identity,
    id: string,
    version: number,
    completed?: boolean,
  ) {
    const task = await this.repo.change(identity, id, version, completed);
    return task ? serialize(task) : null;
  }
}
