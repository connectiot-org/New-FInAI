import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
/** Render page content only. PDF actions, embedded JavaScript and external navigation are never executed. */
export function PdfPreview({ blob }: { blob: Blob }) {
  const [document, setDocument] = useState<PDFDocumentProxy>(),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [width, setWidth] = useState(500),
    [rendering, setRendering] = useState(false),
    [zoom, setZoom] = useState(1);
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.floor(entries[0].contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let live = true,
      dispose: (() => void) | undefined;
    setError("");
    setDocument(undefined);
    setPage(1);
    void (async () => {
      try {
        const pdf = await import("pdfjs-dist");
        if (!live) return;
        pdf.GlobalWorkerOptions.workerSrc = workerUrl;
        const data = new Uint8Array(await blob.arrayBuffer());
        if (!live) return;
        const task = pdf.getDocument({
          data,
          enableXfa: false,
          useSystemFonts: true,
          maxImageSize: 4000000,
          canvasMaxAreaInBytes: 16000000,
          isOffscreenCanvasSupported: false,
          isImageDecoderSupported: false,
          stopAtErrors: true,
          verbosity: 0,
        });
        dispose = () => {
          void task.destroy().catch(() => {});
        };
        const loaded = await task.promise;
        if (loaded.numPages > 100) throw new Error("Too many preview pages");
        if (live) setDocument(loaded);
        else dispose();
      } catch {
        dispose?.();
        if (live)
          setError(
            "This PDF cannot be previewed safely. Download the original to review it.",
          );
      }
    })();
    return () => {
      live = false;
      dispose?.();
    };
  }, [blob]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let live = true,
      task: RenderTask | undefined;
    setRendering(true);
    void (async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (!live || !canvas.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        if (
          base.width <= 0 ||
          base.height / base.width > 4 ||
          base.height / base.width < 0.1
        )
          throw new Error("Unsupported page geometry");
        const viewport = pdfPage.getViewport({
          scale: Math.min(Math.max(width, 100) * zoom, 1200) / base.width,
        });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        task = pdfPage.render({
          canvas: target,
          viewport,
          background: "white",
        });
        await task.promise;
      } catch (e) {
        if (live && (e as Error).name !== "RenderingCancelledException")
          setError(
            "Preview unavailable. The original document is available to download.",
          );
      } finally {
        if (live) setRendering(false);
      }
    })();
    return () => {
      live = false;
      task?.cancel();
    };
  }, [document, page, width, zoom]);
  return (
    <div className="ap-pdf" ref={container}>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          {!document && <p role="status">Opening original PDF…</p>}
          <div className="ap-pdf-viewport">
            <canvas
              ref={canvas}
              role="img"
              aria-label={`Original invoice, page ${page}`}
              hidden={!document}
            />
          </div>
          {document && (
            <div className="ap-pagination">
              <button
                disabled={rendering || zoom <= 0.5}
                onClick={() => setZoom((v) => Math.max(0.5, v - 0.25))}
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                disabled={rendering || zoom >= 3}
                onClick={() => setZoom((v) => Math.min(3, v + 0.25))}
                aria-label="Zoom in"
              >
                +
              </button>
              <span>
                Page {page} of {document.numPages}
                {rendering ? " · Rendering…" : ""}
              </span>
              <button
                disabled={rendering || page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous page
              </button>
              <button
                disabled={rendering || page === document.numPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next page
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
