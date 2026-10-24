import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { apiRequest } from "../../lib/api";
export const contextSchema = z.strictObject({
  userId: z.uuid(),
  organisationId: z.uuid(),
  organisationName: z.string().min(1).max(200),
  administrator: z.boolean(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  entities: z
    .array(
      z.strictObject({
        id: z.uuid(),
        name: z.string().min(1).max(200),
        canWrite: z.boolean(),
        canImport: z.boolean(),
      }),
    )
    .max(1000),
});
type Context = z.infer<typeof contextSchema>;
const Current = createContext<Context | null>(null);
export function useWorkspace() {
  const c = useContext(Current);
  if (!c) throw new Error("Workspace identity unavailable.");
  return c;
}
export function WorkspaceContext({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ value?: Context; error?: string }>({});
  useEffect(() => {
    let live = true;
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      const requestController = controller;
      apiRequest("/workspace/context", contextSchema, {
        signal: requestController.signal,
      })
        .then((value) => {
          if (live && !requestController.signal.aborted) setState({ value });
        })
        .catch((e: Error) => {
          if (live && !requestController.signal.aborted)
            setState({ error: e.message });
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      controller.abort();
      window.removeEventListener("focus", load);
    };
  }, []);
  if (state.error)
    return (
      <section className="panel">
        <h1>Workspace unavailable</h1>
        <p role="alert">{state.error}</p>
        <button onClick={() => location.reload()}>Reload workspace</button>
      </section>
    );
  if (!state.value) return <p role="status">Loading authorized workspace…</p>;
  const c = state.value;
  return (
    <Current.Provider value={c}>
      <div key={`${c.userId}:${c.organisationId}:${c.revision}`}>
        <p className="workspace-identity">{c.organisationName}</p>
        {children}
      </div>
    </Current.Provider>
  );
}
