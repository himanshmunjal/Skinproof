import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Server-side product-page fetcher (DECISION D-30). Groq and Gemini's OpenAI-compatible endpoints have no
// hosted web-fetch tool, so this server now requests user-supplied URLs and must guard against SSRF.

export class PageFetchError extends Error {}

const MAX_BYTES = 2_000_000;
const MAX_TEXT_CHARS = 40_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  // No ::ffff:0:0/96 rule: Node's BlockList matches plain IPv4 addresses against it, which would block every
  // public IPv4. IPv4-mapped IPv6 addresses are unwrapped and checked as IPv4 in isPublicAddress instead.
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return !blocked.check(mapped[1], "ipv4");
  const family = isIP(address) === 6 ? "ipv6" : "ipv4";
  return !blocked.check(address, family);
}

async function assertPublicHost(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new PageFetchError("Only http(s) links are supported.");
  if (url.port && !["80", "443"].includes(url.port)) throw new PageFetchError("That link uses an unusual port.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new PageFetchError("Couldn't find that website.");
  if (!addresses.every((a) => isPublicAddress(a.address))) throw new PageFetchError("That link points to a private address.");
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Readable text of an HTML page: JSON-LD product data first (often holds the INCI list), then visible text. */
export function htmlToText(html: string): string {
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
  const visible = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return [...jsonLd.map((j) => `[structured data]\n${j}`), visible].join("\n\n").slice(0, MAX_TEXT_CHARS);
}

/** Fetch a public web page and return its readable text. Redirects are followed manually and re-validated. */
export async function fetchPageText(rawUrl: string): Promise<string> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SkinProof/1.0; ingredient reader)", Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
    }).catch(() => {
      throw new PageFetchError("Couldn't reach that page. Paste the ingredient list instead.");
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new PageFetchError(`That page answered with HTTP ${res.status}. Paste the ingredient list instead.`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new PageFetchError("That link isn't a web page.");
    const body = await readCapped(res);
    return /html/i.test(type) ? htmlToText(body) : body.slice(0, MAX_TEXT_CHARS);
  }
  throw new PageFetchError("That link redirects too many times.");
}
