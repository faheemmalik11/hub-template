/**
 * PDF rendering the app owns, so the scrollbar is the app's too.
 *
 * The previous pane was an <iframe> around the browser's built-in PDF viewer. Everything painted
 * in there, the near-black page background and, decisively, the fat default scrollbar, lives
 * inside the frame's own document where no stylesheet of ours can reach. Every other scroll
 * container in the product wears the global slim scrollbar (styles.css), and the one pane a
 * reader stares at longest was the one that could not.
 *
 * pdf.js renders each page into a canvas inside a normal overflow-auto div, which inherits the
 * slim scrollbar like any other element. Costs: no text selection in the preview and no built-in
 * zoom. The pane never offered zoom (the old frame hid the viewer toolbar), and the original file
 * stays one click away via the download button for anything a flat preview cannot answer.
 *
 * pdf.js is loaded lazily inside the effect: the library touches browser globals at import time,
 * and this app server-renders. The worker URL goes through Vite's `?url` so the worker is bundled
 * and served from our own origin.
 */
import { useEffect, useRef, useState } from "react";
// Static, not inside the effect with the library: Vite rewrites a STATIC `?url` import into the
// bundled asset URL in dev and build alike, while a dynamic one goes through the dev-server's
// dependency discovery, which is exactly the kind of moving part a worker path should not sit on.
// Importing a `?url` module costs nothing at SSR time; it is only a string.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { cn } from "@/lib/utils";

/**
 * How much bigger than its CSS size the canvas is rasterised. 2 is the point at which the 1-bit
 * stencils of a 300-dpi scan stop washing out in a pane this narrow.
 */
const MIN_OVERSAMPLE = 2;
/** Ceiling on the backing store's width in pixels, so a multi-page scan cannot exhaust memory. */
const MAX_CANVAS_W = 2400;

export function PdfPane({
  url,
  onReady,
  className,
}: {
  url: string;
  /** Called once, after the first page is on screen. Drives the caller's skeleton. */
  onReady?: () => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    // Kept so the width observer below can re-render without re-downloading the document. The
    // TASK is what gets destroyed on unmount; in pdf.js the document proxy has no destroy of
    // its own, tearing down the loading task tears down the document and the worker with it.
    let doc: import("pdfjs-dist").PDFDocumentProxy | null = null;
    let task: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;
    let rendering = false;

    async function renderAll(width: number) {
      if (!doc || cancelled || rendering || width <= 0) return;
      rendering = true;
      try {
        const target = containerRef.current;
        if (!target) return;
        target.replaceChildren();
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          // Backing store ABOVE device resolution, CSS size at container width.
          //
          // devicePixelRatio alone is not enough, and a scanned invoice is where that shows. A
          // fax-style scan carries no fonts at all: the text is hundreds of 1-bit CCITT image
          // masks at 300 dpi, so a line of it can be a 2064px-wide stencil. Drawn into a canvas
          // the width of this pane -- ~370px on a 1x display -- that is a 5x downsample, and a
          // hairline stroke averaged over a fifth of a pixel comes out as pale grey. The pane
          // showed a crisp colour logo (a JPEG, which survives downsampling) above a page of
          // ghosts, while the same file opened in the dialog was perfectly legible, because the
          // dialog is simply wider.
          //
          // So render at least 2x the CSS width and let the browser scale the canvas down: the
          // strokes get pixels to land on, and the downsample is the browser's smooth one rather
          // than pdf.js dropping them at raster time. Capped by MAX_CANVAS_W so a long document
          // cannot allocate unbounded backing store on a wide monitor.
          const density = Math.max(window.devicePixelRatio || 1, MIN_OVERSAMPLE);
          const scale = Math.min((width * density) / base.width, MAX_CANVAS_W / base.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "block w-full";
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          target.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (n === 1) onReadyRef.current?.();
        }
      } finally {
        rendering = false;
      }
    }

    let lastWidth = 0;
    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      // Re-render only on a real resize. Scrollbar appearance and subpixel churn report
      // 1px "changes" that would otherwise re-rasterise the whole document.
      if (Math.abs(width - lastWidth) < 2) return;
      lastWidth = width;
      void renderAll(width);
    });

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        // wasmUrl is NOT optional for scanned invoices, which is most of what this pane shows.
        //
        // pdf.js 6 decodes JBIG2 and JPEG2000 in WebAssembly, and it loads those modules from
        // this directory at runtime. Without it the decoder never initialises and every image it
        // owns is DROPPED -- quietly, as a console warning, with the rest of the page painting
        // normally. A fax-style scan from an office copier is a page of JBIG2 stencils, so the
        // pane rendered the one JPEG on it (the letterhead) and nothing else: a logo above a
        // blank sheet, while the same file in the dialog -- the browser's own viewer, which
        // carries its own decoders -- was perfectly legible.
        //
        // Served from public/ rather than imported: pdf.js builds these URLs by name at runtime,
        // so they need a stable directory, and Vite would hash a `?url` import into something it
        // cannot ask for. BASE_URL so a Hub mounted under a sub-path still finds them.
        //
        // NOTE: public/pdfjs/wasm is a copy of node_modules/pdfjs-dist/wasm. Refresh it when
        // pdfjs-dist is upgraded.
        task = pdfjs.getDocument({
          url,
          wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
        });
        const loaded = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
        doc = loaded;
        lastWidth = Math.floor(container.clientWidth);
        await renderAll(lastWidth);
        observer.observe(container);
      } catch (e) {
        // The pane's fallback is deliberately terse, so the actual reason must go somewhere.
        console.error("PdfPane:", e);
        if (!cancelled) {
          setError(true);
          // The caller's skeleton must clear either way; the error note below takes over.
          onReadyRef.current?.();
        }
      }
    })();

    return () => {
      cancelled = true;
      observer.disconnect();
      void task?.destroy();
    };
  }, [url]);

  if (error) {
    // Terse by design: the surrounding DocumentPreview already renders the friendly
    // load-error state for a URL that never arrives; this only covers a file pdf.js
    // cannot parse. The download button above the pane remains the way at the bytes.
    return (
      <div
        className={cn("flex items-center justify-center text-sm text-muted-foreground", className)}
      >
        PDF
      </div>
    );
  }

  return <div ref={containerRef} className={cn("overflow-y-auto", className)} />;
}
