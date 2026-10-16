import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { Confirm } from "../ui";
/** Protect both dialog dismissal and router/back navigation without blocking successful saves. */
export function useUnsaved(dirty: boolean, onClose: () => void, label: string) {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const saving = useRef(false);
  const [discard, setDiscard] = useState(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !saving.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state === "blocked") setDiscard(true);
  }, [blocker.state]);
  const requestClose = () => (dirty ? setDiscard(true) : onClose());
  const saved = () => {
    saving.current = true;
  };
  const confirmation = (
    <Confirm
      open={discard}
      onOpenChange={(open) => {
        setDiscard(open);
        if (!open && blocker.state === "blocked") blocker.reset();
      }}
      title={`Discard unsaved ${label}?`}
      description="Your unsaved changes will be lost."
      label="Discard changes"
      onConfirm={() => {
        saving.current = true;
        if (blocker.state === "blocked") blocker.proceed();
        else onClose();
      }}
    />
  );
  return { requestClose, saved, confirmation };
}
