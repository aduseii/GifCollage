declare module "gifsicle-wasm-browser" {
  const gifsicle: {
    run(options: {
      input: Array<{ file: Blob | ArrayBuffer; name: string }>;
      command: string[];
    }): Promise<File[] | null>;
  };
  export default gifsicle;
}
