"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmationForm({
  action,
  children,
  className,
  title,
  description,
  confirmLabel,
  whenField,
  confirmVariant = "destructive",
}: {
  action: (data: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
  title: string;
  description: string;
  confirmLabel: string;
  whenField?: { name: string; value: string | string[] };
  confirmVariant?: "default" | "destructive";
}) {
  const form = useRef<HTMLFormElement>(null);
  const approved = useRef(false);
  const submitter = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <form
        ref={form}
        action={action}
        className={className}
        onSubmit={(event) => {
          if (approved.current) {
            approved.current = false;
            return;
          }
          if (
            whenField &&
            !(
              Array.isArray(whenField.value) ? whenField.value : [whenField.value]
            ).includes(String(new FormData(event.currentTarget).get(whenField.name)))
          )
            return;
          event.preventDefault();
          submitter.current = event.nativeEvent.submitter;
          setOpen(true);
        }}
      >
        {children}
      </form>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="neutral" onClick={() => setOpen(false)}>
              Go back
            </Button>
            <Button
              type="button"
              variant={confirmVariant}
              onClick={() => {
                approved.current = true;
                setOpen(false);
                // Resubmit through the same button so its value is sent and it shows the spinner.
                const button = submitter.current;
                submitter.current = null;
                form.current?.requestSubmit(button?.isConnected ? button : undefined);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
