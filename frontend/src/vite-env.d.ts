/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURN_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
