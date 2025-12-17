const PDFJS_URL = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
const PDFJS_WORKER_URL = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

declare global {
  interface Window {
    pdfjsLib?: unknown;
  }
}

export type PdfJsTextItem = {
  str?: string;
  transform?: number[];
};

export type PdfJsTextContent = {
  items: PdfJsTextItem[];
};

export type PdfJsViewport = {
  width: number;
  height: number;
};

export type PdfJsRenderTask = {
  promise: Promise<void>;
};

export type PdfJsPage = {
  getTextContent?: (options?: unknown) => Promise<PdfJsTextContent>;
  getViewport?: (options: { scale: number }) => PdfJsViewport;
  render?: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }) => PdfJsRenderTask;
};

export type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
};

export type PdfJsLoadingTask = { promise: Promise<PdfJsDocument> };
export type PdfJsLib = {
  getDocument: (options: { data: Uint8Array }) => PdfJsLoadingTask;
  GlobalWorkerOptions?: { workerSrc: string };
  disableWorker?: boolean;
};

const getPdfJsLibFromWindow = (): PdfJsLib | null => {
  if (typeof window === "undefined") return null;
  const candidate = window.pdfjsLib;
  if (!candidate || typeof candidate !== "object") return null;
  const lib = candidate as Partial<PdfJsLib>;
  if (typeof lib.getDocument !== "function") return null;
  return lib as PdfJsLib;
};

let pdfjsPromise: Promise<PdfJsLib> | null = null;

export async function loadPdfJs(): Promise<PdfJsLib> {
  if (typeof window === "undefined") throw new Error("PDF.js is only available in the browser.");

  const existingLib = getPdfJsLibFromWindow();
  if (existingLib) {
    if (existingLib.GlobalWorkerOptions) existingLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    if (typeof existingLib.disableWorker !== "undefined") existingLib.disableWorker = true;
    return existingLib;
  }

  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${PDFJS_URL}"]`);
      const preloadedLib = getPdfJsLibFromWindow();
      if (existing && preloadedLib) {
        if (preloadedLib.GlobalWorkerOptions) preloadedLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        if (typeof preloadedLib.disableWorker !== "undefined") preloadedLib.disableWorker = true;
        resolve(preloadedLib);
        return;
      }

      const script = document.createElement("script");
      script.src = PDFJS_URL;
      script.async = true;
      script.onload = () => {
        const loadedLib = getPdfJsLibFromWindow();
        if (!loadedLib) {
          reject(new Error("Failed to load pdf.js."));
          return;
        }
        if (loadedLib.GlobalWorkerOptions) loadedLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        if (typeof loadedLib.disableWorker !== "undefined") loadedLib.disableWorker = true;
        resolve(loadedLib);
      };
      script.onerror = () => reject(new Error("Failed to load pdf.js script."));
      document.body.appendChild(script);
    });
  }

  return pdfjsPromise;
}

