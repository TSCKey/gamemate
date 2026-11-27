// GameMate's eSpeak NG build (Emscripten, MODULARIZE + EXPORT_ES6): runs eSpeak's command line
// once with `arguments`, and resolves with the module when it has finished; its in-memory file
// system holds what eSpeak wrote.
export interface ESpeakModule {
  FS: {
    writeFile: (path: string, data: string, options?: { encoding: 'utf8' }) => void
    readFile: (path: string, options: { encoding: 'utf8' }) => string
  }
}

export default function ESpeakNG(options: {
  arguments: string[]
  preRun?: ((module: ESpeakModule) => void)[]
  print?: (text: string) => void
  printErr?: (text: string) => void
  locateFile?: (path: string) => string
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void
  ) => object
}): Promise<ESpeakModule>
