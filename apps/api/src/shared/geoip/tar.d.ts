declare module 'tar' {
  export interface ExtractOptions {
    cwd?: string;
    strip?: number;
  }

  export function extract(options: ExtractOptions): NodeJS.ReadWriteStream;
}

