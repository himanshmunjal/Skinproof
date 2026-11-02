import { describe, expect, it } from "vitest";
import { fetchPageText, htmlToText, isPublicAddress, PageFetchError } from "@/lib/fetch-page";
import { toProductExtract } from "@/lib/llm";

describe("fetchPageText SSRF guard", () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://localhost:3000/api/me",
    "http://10.0.0.5/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://192.168.1.1/",
    "file:///etc/passwd",
    "https://example.com:8443/",
  ]) {
    it(`rejects ${url}`, async () => {
      await expect(fetchPageText(url)).rejects.toBeInstanceOf(PageFetchError);
    });
  }
});

describe("isPublicAddress", () => {
  it("allows public addresses", () => {
    for (const ip of ["104.20.23.154", "172.66.147.243", "8.8.8.8", "2606:4700::6810:1"]) expect(isPublicAddress(ip)).toBe(true);
  });
  it("blocks private, loopback, link-local and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])
      expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("htmlToText", () => {
  it("keeps JSON-LD and visible text, drops scripts and styles", () => {
    const text = htmlToText(
      `<html><head><style>.x{color:red}</style><script>track()</script>
       <script type="application/ld+json">{"@type":"Product","name":"Serum"}</script></head>
       <body><h1>Serum</h1><p>Ingredients: Aqua, Niacinamide &amp; Zinc PCA</p></body></html>`,
    );
    expect(text).toContain('"@type":"Product"');
    expect(text).toContain("Ingredients: Aqua, Niacinamide & Zinc PCA");
    expect(text).not.toContain("track()");
    expect(text).not.toContain("color:red");
  });
});

describe("toProductExtract", () => {
  it("maps empty strings to null and unknown categories to null", () => {
    expect(toProductExtract({ found: true, name: " Serum ", brand: "", category: "potion", ingredients: ["Aqua", " ", "Niacinamide"] })).toEqual({
      found: true,
      name: "Serum",
      brand: null,
      category: null,
      ingredients: ["Aqua", "Niacinamide"],
    });
  });
  it("is not found when no ingredients survive", () => {
    expect(toProductExtract({ found: true, name: "", brand: "X", category: "serum", ingredients: [] })).toMatchObject({ found: false, name: "Unnamed product", category: "serum" });
  });
  it("tolerates missing fields", () => {
    expect(toProductExtract({})).toMatchObject({ found: false, ingredients: [] });
  });
});
