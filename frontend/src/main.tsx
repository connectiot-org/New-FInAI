import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import "./styles/workspace-reference.css";
const root = createRoot(document.getElementById("root")!);
// Vite replaces this constant so demo routes/store are absent from product assets.
const application =
  import.meta.env.VITE_APP_MODE === "demo"
    ? import("./app/demo-entry").then(({ DemoApp }) => <DemoApp />)
    : import("./app/ProductApp").then(({ ProductApp }) => <ProductApp />);
application
  .then((app) => root.render(<StrictMode>{app}</StrictMode>))
  .catch(() => {
    root.render(
      <main className="empty" role="alert">
        <h1>Unable to load FinAI</h1>
        <p>Reload the page to try again.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>,
    );
  });
