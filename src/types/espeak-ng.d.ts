// espeak-ng 1.0.2 (eSpeak NG compiled to WebAssembly by Emscripten) ships without types.
declare module 'espeak-ng' {
  // Runs eSpeak's command line once with `arguments`; resolves when it has finished, with the
  // Emscripten module (its in-memory file system holds what eSpeak wrote).
  export default function ESpeakNg<M extends object>(options: {
    arguments: string[]
    preRun?: ((module: M) => void)[]
    print?: (text: string) => void
    printErr?: (text: string) => void
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void
    ) => object
  }): Promise<M>
}
