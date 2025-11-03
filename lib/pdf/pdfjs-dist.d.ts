// Type declaration for pdfjs-dist v2.10.377
declare module 'pdfjs-dist/build/pdf' {
  export interface GlobalWorkerOptionsType {
    workerSrc: string;
  }

  export const GlobalWorkerOptions: GlobalWorkerOptionsType;

  export interface PDFPageViewport {
    width: number;
    height: number;
    scale: number;
  }

  export interface PDFRenderTask {
    promise: Promise<void>;
  }

  export interface PDFRenderParams {
    canvasContext: CanvasRenderingContext2D;
    viewport: PDFPageViewport;
  }

  export interface PDFPageProxy {
    getViewport(params: { scale: number }): PDFPageViewport;
    render(params: PDFRenderParams): PDFRenderTask;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
  }

  export function getDocument(src: string | { data: ArrayBuffer }): PDFDocumentLoadingTask;
}
