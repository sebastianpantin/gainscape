const DEFAULT_WEB_PORT = 5173;
const PREVIEW_PORT_OFFSET = 1000;

export function webPort(): number {
  return Number(process.env.GAINSCAPE_WEB_PORT ?? DEFAULT_WEB_PORT);
}

export function previewPort(): number {
  return Number(process.env.GAINSCAPE_PREVIEW_PORT ?? webPort() - PREVIEW_PORT_OFFSET);
}
