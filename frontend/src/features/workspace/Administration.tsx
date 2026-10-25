import { useEffect, useState } from "react";
import { z } from "zod";
import { apiRequest } from "../../lib/api";
import { useWorkspace } from "./context";
const member = z.object({
  userId: z.uuid(),
  username: z.string().nullable(),
  disabled: z.boolean(),
  active: z.boolean(),
  administrator: z.boolean(),
  version: z.number().int().positive(),
  access: z.array(
    z.object({
      entityId: z.uuid(),
      canWrite: z.boolean(),
      canImport: z.boolean(),
      version: z.number().int().positive(),
    }),
  ),
});
const membersSchema = z.object({
  items: z.array(member),
  total: z.number().int().nonnegative(),
});
const entitiesSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), name: z.string() })),
  total: z.number().int().nonnegative(),
});
const auditSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      actorId: z.uuid(),
      createdAt: z.iso.datetime(),
      action: z.string(),
      reference: z.string(),
      requestId: z.uuid(),
      outcome: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export function Administration() {
  const ctx = useWorkspace();
  const [members, setMembers] = useState<z.infer<typeof membersSchema>>(),
    [entities, setEntities] = useState<z.infer<typeof entitiesSchema>>(),
    [audit, setAudit] = useState<z.infer<typeof auditSchema>>(),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [target, setTarget] = useState(""),
    [entity, setEntity] = useState(""),
    [access, setAccess] = useState(true),
    [write, setWrite] = useState(false),
    [importGrant, setImport] = useState(false);
  useEffect(() => {
    if (!ctx.administrator) return;
    const c = new AbortController();
    setMembers(undefined);
    setEntities(undefined);
    setAudit(undefined);
    Promise.all([
      apiRequest(`/admin/members?offset=${offset}&limit=20`, membersSchema, {
        signal: c.signal,
      }),
      apiRequest(`/admin/entities?offset=${offset}&limit=20`, entitiesSchema, {
        signal: c.signal,
      }),
      apiRequest(`/admin/audit?offset=${offset}&limit=20`, auditSchema, {
        signal: c.signal,
      }),
    ])
      .then(([m, e, a]) => {
        setMembers(m);
        setEntities(e);
        setAudit(a);
      })
      .catch((e: Error) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [ctx.administrator, offset, refresh]);
  async function change(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await apiRequest(path, z.object({}), { method, body });
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Change failed. Reload before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!ctx.administrator)
    return (
      <section>
        <h1>Administration</h1>
        <p>Administrator permission required.</p>
      </section>
    );
  const selected = members?.items.find((m) => m.userId === target);
  return (
    <section className="workspace-register">
      <h1>Workspace administration</h1>
      <p>
        Manage existing provisioned accounts and entity grants in your
        organisation. Changes revoke the target’s sessions immediately. New
        accounts and recovery use the trusted operator CLI.
      </p>
      {error && <p role="alert">{error}</p>}
      <h2>Members</h2>
      {members ? (
        <ul>
          {members.items.map((m) => (
            <li key={m.userId}>
              {m.username || m.userId} ·{" "}
              {m.disabled
                ? "account disabled"
                : m.active
                  ? "active"
                  : "inactive"}{" "}
              · {m.administrator ? "administrator" : "member"} · version{" "}
              {m.version}
              <button
                disabled={busy || m.userId === ctx.userId}
                onClick={() =>
                  void change(
                    `/admin/members/${m.userId}`,
                    {
                      active: !m.active,
                      administrator: m.administrator,
                      expectedVersion: m.version,
                    },
                    "PATCH",
                  )
                }
              >
                {m.active ? "Deactivate" : "Activate"}
              </button>
              <button
                disabled={busy || m.disabled || m.userId === ctx.userId}
                onClick={() =>
                  void change(
                    `/admin/members/${m.userId}`,
                    {
                      active: m.active,
                      administrator: !m.administrator,
                      expectedVersion: m.version,
                    },
                    "PATCH",
                  )
                }
              >
                {m.administrator
                  ? "Remove administrator"
                  : "Make administrator"}
              </button>
              <ul>
                {m.access.map((a) => (
                  <li key={a.entityId}>
                    {a.entityId}: read{a.canWrite ? ", workflow write" : ""}
                    {a.canImport ? ", import" : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p>Loading members…</p>
      )}
      <h2>Entity access</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (selected)
            void change("/admin/access", {
              userId: target,
              entityId: entity,
              access,
              canWrite: access && write,
              canImport: access && importGrant,
              expectedVersion: selected.version,
            });
        }}
      >
        <label>
          Member
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Select member</option>
            {members?.items
              .filter((m) => m.active && m.userId !== ctx.userId)
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.username || m.userId}
                </option>
              ))}
          </select>
        </label>
        <label>
          Entity
          <select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Select entity</option>
            {entities?.items.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={access}
            onChange={(e) => setAccess(e.target.checked)}
          />
          Read access
        </label>
        <label>
          <input
            type="checkbox"
            checked={write}
            onChange={(e) => setWrite(e.target.checked)}
          />
          Workflow write
        </label>
        <label>
          <input
            type="checkbox"
            checked={importGrant}
            onChange={(e) => setImport(e.target.checked)}
          />
          Import snapshots
        </label>
        <button disabled={busy || !selected || !entity}>
          Apply entity grant
        </button>
      </form>
      <h2>Create entity</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void change("/admin/entities", { name });
        }}
      >
        <label>
          Entity name
          <input
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <button disabled={busy || !name.trim()}>Create entity</button>
      </form>
      <p>Creating an entity grants nobody access automatically.</p>
      <h2>Server audit</h2>
      {audit ? (
        <ul>
          {audit.items.map((a) => (
            <li key={a.id}>
              {a.createdAt} · {a.action} · {a.outcome} · actor {a.actorId} ·
              reference {a.reference} · request {a.requestId}
            </li>
          ))}
        </ul>
      ) : (
        <p>Loading audit…</p>
      )}
      <button
        disabled={busy || offset === 0}
        onClick={() => setOffset((n) => Math.max(0, n - 20))}
      >
        Previous administration page
      </button>
      <span> Offset {offset} </span>
      <button
        disabled={
          busy ||
          Math.max(
            members?.total || 0,
            entities?.total || 0,
            audit?.total || 0,
          ) <=
            offset + 20
        }
        onClick={() => setOffset((n) => n + 20)}
      >
        Next administration page
      </button>
      <button disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
        Reload administration
      </button>
    </section>
  );
}
