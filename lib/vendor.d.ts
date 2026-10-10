declare module "@citation-js/core" {
  export class Cite {
    constructor(input: unknown);
    data: any[];
    format(name: string, options?: Record<string, unknown>): string;
  }
}
declare module "@citation-js/plugin-csl";
declare module "@citation-js/plugin-bibtex";
declare module "@citation-js/plugin-ris";
