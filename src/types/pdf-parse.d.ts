declare module "pdf-parse/lib/pdf-parse.js" {
  type ParsedPdf = {
    text: string;
    [key: string]: unknown;
  };

  function pdf(
    dataBuffer: ArrayBuffer | Uint8Array | Buffer
  ): Promise<ParsedPdf>;

  export default pdf;
}
