import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { HttpError } from "./http";

const reserved = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) reserved.addSubnet(network, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [network, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) reserved.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !reserved.check(address, "ipv4")
    : family === 6 && globalV6.check(address, "ipv6") && !reserved.check(address, "ipv6");
}
export function webhookTarget(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, "Invalid webhook URL"); }
  if (value.length > 2048 || url.protocol !== "https:" || (url.port && url.port !== "443") ||
      url.username || url.password || url.hash || !url.hostname.includes(".") ||
      /(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname) ||
      (isIP(url.hostname) && !isPublicAddress(url.hostname))) {
    throw new HttpError(400, "Webhook must use a public HTTPS endpoint on port 443");
  }
  return url;
}
export async function sendWebhook(value: string, payload: unknown, secret?: string) {
  const url = webhookTarget(value);
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > 64 * 1024 || (secret && (secret.length > 2048 || /[\r\n]/.test(secret)))) throw new HttpError(400, "Invalid webhook payload");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HttpError(504, "Webhook DNS timed out")), 3000); }),
  ]).finally(() => clearTimeout(timer));
  // Validate every result, then pin the connection: no second DNS lookup/rebinding.
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) throw new HttpError(400, "Webhook address is not public");
  const pinned = addresses.find((a) => a.family === 4) ?? addresses[0];
  return new Promise<{ ok: boolean; status: number }>((resolve, reject) => {
    const req = request(url, {
      method: "POST",
      agent: false,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      },
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...(secret ? { "X-QuizFlow-Secret": secret } : {}) },
    }, (res) => {
      const status = res.statusCode ?? 502;
      // https.request does not follow redirects. Do not download arbitrary bodies.
      res.destroy();
      resolve({ ok: status >= 200 && status < 300, status });
    });
    const timeout = setTimeout(() => req.destroy(new Error("Webhook timed out")), 8000);
    req.on("close", () => clearTimeout(timeout));
    req.on("error", () => reject(new HttpError(502, "Webhook delivery failed")));
    req.end(body);
  });
}
