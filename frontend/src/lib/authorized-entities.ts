import { z } from "zod";
import { apiRequest } from "./api";
const entitiesSchema = z.strictObject({
  items: z.array(z.strictObject({ id: z.uuid(), name: z.string().min(1) })),
});
export type AuthorizedEntity = z.infer<typeof entitiesSchema>["items"][number];
export const loadAuthorizedEntities = (signal: AbortSignal) =>
  apiRequest("/entities", entitiesSchema, { signal });
