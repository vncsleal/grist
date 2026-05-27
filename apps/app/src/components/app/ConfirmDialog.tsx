import { AlertDialog, Button } from "@heroui/react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog isOpen={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <AlertDialog.Backdrop />
      <AlertDialog.Dialog>
        <AlertDialog.Header>
          <AlertDialog.Heading>{title}</AlertDialog.Heading>
        </AlertDialog.Header>
        <AlertDialog.Body>
          <p className="text-muted text-sm">{description}</p>
        </AlertDialog.Body>
        <AlertDialog.Footer>
          <Button variant="ghost" onPress={onCancel} isDisabled={loading}>{cancelLabel}</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} onPress={onConfirm} isDisabled={loading}>
            {loading ? "Processing..." : confirmLabel}
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Dialog>
    </AlertDialog>
  );
}
