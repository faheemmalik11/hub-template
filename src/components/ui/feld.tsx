import * as React from "react";

import { FeldContext } from "@/components/ui/feld-context";

/**
 * One form field: its label and its control, plus any hint or error text below them.
 *
 * Generates a single id and hands it to the Label (as `htmlFor`) and to the control (as `id`)
 * through context, so the two are associated without every call site having to invent a unique
 * string. Without that association a screen reader announces the control with no name at all, and
 * clicking the label does not focus the field.
 *
 * Opt-in on purpose. Label, Input, Textarea, SelectTrigger and Combobox each fall back to exactly
 * what they did before when they are not inside a Feld, and an explicit `id`/`htmlFor` always
 * wins, so wrapping one field is a local change and can never alter another screen.
 */
const Feld = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(function Feld(
  { children, ...props },
  ref,
) {
  const id = React.useId();
  return (
    <FeldContext.Provider value={id}>
      <div ref={ref} {...props}>
        {children}
      </div>
    </FeldContext.Provider>
  );
});

export { Feld };
