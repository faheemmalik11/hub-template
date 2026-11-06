import * as React from "react";

const OPEN_DIALOG_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

export function useTopmostOpenDialog(): HTMLElement[] {
  const [topmostOpenDialog, setTopmostOpenDialog] = React.useState<HTMLElement[]>([]);
  React.useLayoutEffect(() => {
    const open = Array.from(document.querySelectorAll<HTMLElement>(OPEN_DIALOG_SELECTOR));
    const topmost = open.at(-1);
    setTopmostOpenDialog(topmost ? [topmost] : []);
  }, []);
  return topmostOpenDialog;
}
