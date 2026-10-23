import { useState } from "react";
import type { LucideIcon } from "lucide-react-native";
import { ConfirmDialog } from "./ui";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmTitle?: string;
  Icon?: LucideIcon;
  destructive?: boolean;
  /** Runs on confirm; the dialog shows a spinner until it settles, then closes. */
  onConfirm: () => unknown;
};

/**
 * Themed yes/no dialog (ConfirmDialog) instead of the native Alert.
 *
 * const { confirm, dialog } = useConfirm();
 * confirm({ title: "Accept this offer?", onConfirm: () => accept() });
 * return <>{...}{dialog}</>;
 */
export function useConfirm() {
  // Kept after closing so the text doesn't vanish during the fade-out.
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const confirm = (next: ConfirmOptions) => {
    setOpts(next);
    setOpen(true);
  };

  const dialog = (
    <ConfirmDialog
      visible={open}
      title={opts?.title ?? ""}
      message={opts?.message}
      Icon={opts?.Icon}
      confirmTitle={opts?.confirmTitle}
      destructive={opts?.destructive}
      loading={loading}
      onClose={() => setOpen(false)}
      onConfirm={async () => {
        if (!opts) return;
        setLoading(true);
        try {
          await opts.onConfirm();
        } finally {
          setLoading(false);
          setOpen(false);
        }
      }}
    />
  );

  return { confirm, dialog };
}
