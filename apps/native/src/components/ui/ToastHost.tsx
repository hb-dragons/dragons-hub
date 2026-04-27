import { Toast } from "./Toast";
import { useActiveToast, useToast } from "@/hooks/useToast";

export function ToastHost() {
  const active = useActiveToast();
  const { dismiss } = useToast();
  if (!active) return null;
  return (
    <Toast
      key={active.id}
      title={active.title}
      variant={active.variant}
      action={active.action}
      durationMs={active.durationMs}
      onDismiss={dismiss}
    />
  );
}
