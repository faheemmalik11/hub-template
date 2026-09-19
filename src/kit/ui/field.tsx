import * as React from "react";

import { FieldContext } from "./field-context";

const Field = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(function Field(
  { children, ...props },
  ref,
) {
  const id = React.useId();
  return (
    <FieldContext.Provider value={id}>
      <div ref={ref} {...props}>
        {children}
      </div>
    </FieldContext.Provider>
  );
});

export { Field };
