/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MARKETING_CONTACT_EMAIL?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_WEB_APP_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
