import { createApplication } from "./app";
createApplication().catch(() => {
  console.error(
    "API startup refused or failed. Check local configuration and database readiness.",
  );
  process.exitCode = 1;
});
