import { useState } from "react";

import type { PayableDocumentRow } from "../../adapters/payment-file";

export interface DocumentSelection {
  selected: Map<string, PayableDocumentRow>;
  toggle(document: PayableDocumentRow, checked: boolean): void;
  toggleAll(rows: PayableDocumentRow[], checked: boolean): void;
  clear(): void;
}

export function useDocumentSelection(): DocumentSelection {
  const [selected, setSelected] = useState<Map<string, PayableDocumentRow>>(new Map());

  function toggle(document: PayableDocumentRow, checked: boolean) {
    setSelected((map) => {
      const next = new Map(map);
      if (checked) next.set(document.id, document);
      else next.delete(document.id);
      return next;
    });
  }

  function toggleAll(rows: PayableDocumentRow[], checked: boolean) {
    setSelected((map) => {
      const next = new Map(map);
      for (const row of rows) {
        if (checked) next.set(row.id, row);
        else next.delete(row.id);
      }
      return next;
    });
  }

  function clear() {
    setSelected(new Map());
  }

  return { selected, toggle, toggleAll, clear };
}
