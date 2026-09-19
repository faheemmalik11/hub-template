import * as React from "react";

export const FieldContext = React.createContext<string | null>(null);

/** The generated control id for the surrounding Field, or null outside one. */
export function useFieldId() {
  return React.useContext(FieldContext);
}
