import { Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";

export interface SampleFileChipProps {
  label: string;
  sampleFileUrl: string;
  sampleFileName?: string;
}

export function SampleFileChip({ label, sampleFileUrl, sampleFileName }: SampleFileChipProps) {
  const [draggableSampleFile, setDraggableSampleFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(sampleFileUrl)
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) return;
        setDraggableSampleFile(
          new File([blob], sampleFileName ?? "sample-file", { type: blob.type }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [sampleFileUrl, sampleFileName]);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        role="button"
        tabIndex={0}
        draggable={Boolean(draggableSampleFile)}
        onDragStart={(event) => {
          if (!draggableSampleFile) return;
          event.dataTransfer.items.add(draggableSampleFile);
          event.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => {
          const link = document.createElement("a");
          link.href = sampleFileUrl;
          if (sampleFileName) link.download = sampleFileName;
          link.click();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.currentTarget.click();
          }
        }}
        className="inline-flex w-fit cursor-pointer select-none items-center gap-2 rounded-lg bg-muted/40 py-1.5 pl-2 pr-3 outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-[var(--onboarding-accent,var(--primary))]"
      >
        <span draggable={false} className="shrink-0">
          <FileText className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <span className="text-sm font-medium text-foreground">{sampleFileName}</span>
        <span draggable={false} className="ml-auto shrink-0">
          <Download className="size-3.5 text-muted-foreground/60" aria-hidden />
        </span>
      </div>
    </div>
  );
}
