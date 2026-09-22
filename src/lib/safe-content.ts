export function safeLink(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\\]/.test(value)) return undefined;
  if (/^\/(?!\/)/.test(value) || value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    if (!["https:", "http:", "mailto:", "tel:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}
export function safeRedirectPath(value: string | null): string {
  if (!value || !/^\/(?!\/)/.test(value) || /[\u0000-\u0020\\]/.test(value)) return "/";
  return value;
}
export function csvCell(value: string): string {
  // Quoting alone does not stop spreadsheet formula execution.
  const escaped = (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value).replace(/"/g, '""');
  return '"' + escaped + '"';
}
