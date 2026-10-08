// Declared so they can be read with dot access under noPropertyAccessFromIndexSignature;
// Next inlines NEXT_PUBLIC_ variables at build time only when they are read that way.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly BASE_PATH?: string;
    readonly SITE_URL?: string;
    readonly NEXT_PUBLIC_BASE_PATH?: string;
  }
}
