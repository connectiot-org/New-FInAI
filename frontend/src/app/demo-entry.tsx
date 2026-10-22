import { Provider } from "react-redux";
import { store } from "../store";
import { ToastProvider } from "../components/ui";
import { AppRouter } from "./router";
export function DemoApp() {
  return (
    <Provider store={store}>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </Provider>
  );
}
