import { lazy, Suspense } from "react";
const Chat = lazy(() =>
  import("./public-chat/PublicChat").then((module) => ({
    default: module.PublicChat,
  })),
);
export function Assistant({
  embedded = false,
}: {
  embedded?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Suspense fallback={<p role="status">Opening chat…</p>}>
      <Chat embedded={embedded} />
    </Suspense>
  );
}
