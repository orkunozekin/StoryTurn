import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Inline busy indicator. Pair it with text or an `aria-busy` container for screen readers. */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LoaderCircle
      data-slot="spinner"
      aria-hidden="true"
      className={cn(
        "animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
