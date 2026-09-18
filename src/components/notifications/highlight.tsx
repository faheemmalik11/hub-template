export function HighlightedText({ text, highlight }: { text: string; highlight?: string }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{highlight}</strong>
      {text.slice(at + highlight.length)}
    </>
  );
}
