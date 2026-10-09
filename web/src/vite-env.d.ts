interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_BUILD__: string;
declare const __CHANGELOG__: readonly {
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly items: readonly string[];
}[];
