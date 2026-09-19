export function RequiredMark({ title }: { title: string }) {
  return (
    <span className="text-destructive" title={title} aria-hidden>
      *
    </span>
  );
}

export function FieldErrorText({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-xs text-destructive">{text}</p>;
}
