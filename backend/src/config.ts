export const LOCAL = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  entityId: "22222222-2222-4222-8222-222222222222",
  secondEntityId: "22222222-2222-4222-8222-222222222223",
};
export type Identity = { organisationId: string; userId: string };
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.CHECKLIST_IDENTITY === "session") {
    if (env.NODE_ENV !== "production" && env.NODE_ENV !== "test")
      throw new Error("Session mode requires production or test.");
    const origin = env.PUBLIC_ORIGIN || "";
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.origin !== origin ||
      !env.API_TRUSTED_HOST ||
      !/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(env.API_TRUSTED_HOST) ||
      !env.API_PROXY_TOKEN ||
      env.API_PROXY_TOKEN.length < 32 ||
      !env.DATABASE_URL
    )
      throw new Error(
        "Exact HTTPS origin, database and strong proxy token required.",
      );
    const port = Number(env.API_PORT || 3000);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("Invalid API_PORT");
    return {
      host: env.API_HOST || "127.0.0.1",
      port,
      origins: [origin],
      mode: "session" as const,
      publicHost: url.host,
      trustedHost: env.API_TRUSTED_HOST,
      proxyToken: env.API_PROXY_TOKEN,
    };
  }
  if (
    !["development", "test"].includes(env.NODE_ENV || "") ||
    env.CHECKLIST_IDENTITY !== "local" ||
    !["127.0.0.1", "::1"].includes(env.API_HOST || "") ||
    [
      "VERCEL",
      "RENDER",
      "FLY_APP_NAME",
      "K_SERVICE",
      "WEBSITE_SITE_NAME",
      "KUBERNETES_SERVICE_HOST",
    ].some((k) => !!env[k])
  ) {
    throw new Error(
      "Only explicit local/test identity on a loopback-bound API is supported. Production identity is not implemented.",
    );
  }
  const origins = (env.FRONTEND_ORIGINS || "").split(",").filter(Boolean);
  if (
    !origins.length ||
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          url.origin !== origin ||
          url.protocol !== "http:" ||
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error("FRONTEND_ORIGINS must contain exact local HTTP origins.");
  const port = Number(env.API_PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid API_PORT");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL required");
  return {
    host: env.API_HOST!,
    port,
    origins,
    mode: "local" as const,
    publicHost: "",
    trustedHost: "",
    proxyToken: "",
  };
}
