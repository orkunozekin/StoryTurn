"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import { useEffect, useRef, useState, type Ref } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";
import {
  buttonVariants,
  type buttonVariantClasses,
} from "@/components/ui/button-variants";

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariantClasses> & {
    /** Show a spinner and block clicks while an async action runs. */
    loading?: boolean;
  };

/**
 * Remembers whether this button submitted its form most recently, so only the
 * clicked button spins when a form has several (e.g. Approve / Decline).
 */
function useIsLastSubmitter(
  button: React.RefObject<HTMLButtonElement | null>,
  enabled: boolean,
) {
  const [isSubmitter, setIsSubmitter] = useState(false);

  useEffect(() => {
    const form = button.current?.form;
    if (!enabled || !form) return;
    const onSubmit = (event: SubmitEvent) => {
      setIsSubmitter(event.submitter === button.current);
    };
    // Capture so we see the submitter even when a handler later cancels the event.
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [button, enabled]);

  return isSubmitter;
}

function Button({
  className,
  variant = "default",
  size = "default",
  type,
  loading = false,
  disabled,
  children,
  ref,
  ...props
}: ButtonProps & { ref?: Ref<HTMLButtonElement> }) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const isSubmit = type === "submit";
  const { pending: formPending } = useFormStatus();
  const isSubmitter = useIsLastSubmitter(buttonRef, isSubmit);
  const busy = loading || (isSubmit && formPending && isSubmitter);
  const iconOnly = size?.startsWith("icon") ?? false;

  return (
    <ButtonPrimitive
      ref={(node: HTMLButtonElement | null) => {
        buttonRef.current = node;
        if (typeof ref === "function") return ref(node);
        if (ref) ref.current = node;
      }}
      data-slot="button"
      type={type}
      aria-busy={busy || undefined}
      data-loading={busy ? "" : undefined}
      disabled={disabled || busy}
      focusableWhenDisabled={busy || undefined}
      className={buttonVariants({
        variant,
        size,
        // While busy, the spinner stands in for any icon the button already has.
        className: [busy && "[&_svg:not([data-slot=spinner])]:hidden", className],
      })}
      {...props}
    >
      {busy && iconOnly ? (
        <Spinner />
      ) : (
        <>
          {busy && <Spinner data-icon="inline-start" />}
          {children}
        </>
      )}
    </ButtonPrimitive>
  );
}

export { Button };
