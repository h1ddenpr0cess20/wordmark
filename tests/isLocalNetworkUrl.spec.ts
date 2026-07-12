import test from "node:test";
import assert from "node:assert/strict";

const { isLocalNetworkUrl } = await import("../src/ts/services/api/tools/mcpProbe.ts");

test("treats localhost, loopback, and IPv6 loopback as local", () => {
  assert.equal(isLocalNetworkUrl("http://localhost:3000/mcp"), true);
  assert.equal(isLocalNetworkUrl("https://LOCALHOST/"), true, "hostname is lowercased");
  assert.equal(isLocalNetworkUrl("http://127.0.0.1:8080"), true);
  assert.equal(isLocalNetworkUrl("http://[::1]:9000/"), true);
});

test("treats the three RFC1918 private ranges as local", () => {
  assert.equal(isLocalNetworkUrl("http://192.168.0.1"), true);
  assert.equal(isLocalNetworkUrl("http://192.168.1.55:1234/path"), true);
  assert.equal(isLocalNetworkUrl("http://10.0.0.1"), true);
  assert.equal(isLocalNetworkUrl("http://10.255.255.254"), true);
  assert.equal(isLocalNetworkUrl("http://172.16.0.1"), true);
  assert.equal(isLocalNetworkUrl("http://172.31.255.255"), true);
});

test("respects the 172.16-31 boundary (172.15 and 172.32 are public)", () => {
  assert.equal(isLocalNetworkUrl("http://172.15.0.1"), false);
  assert.equal(isLocalNetworkUrl("http://172.32.0.1"), false);
  assert.equal(isLocalNetworkUrl("http://172.20.10.5"), true);
});

test("treats .local mDNS hostnames as local", () => {
  assert.equal(isLocalNetworkUrl("http://my-nas.local"), true);
  assert.equal(isLocalNetworkUrl("https://printer.local:631/"), true);
  assert.equal(isLocalNetworkUrl("http://Printer.LOCAL"), true, "case-insensitive via hostname lowercasing");
});

test("treats public hosts and IPs as non-local", () => {
  assert.equal(isLocalNetworkUrl("https://example.com/mcp"), false);
  assert.equal(isLocalNetworkUrl("http://8.8.8.8"), false);
  assert.equal(isLocalNetworkUrl("https://api.openai.com"), false);
  assert.equal(isLocalNetworkUrl("http://100.64.0.1"), false);
  assert.equal(isLocalNetworkUrl("https://localhost.evil.com"), false);
  assert.equal(isLocalNetworkUrl("http://9.10.0.1"), false);
});

test("returns false for malformed or empty input rather than throwing", () => {
  assert.equal(isLocalNetworkUrl("not a url"), false);
  assert.equal(isLocalNetworkUrl(""), false);
  assert.equal(isLocalNetworkUrl("://missing-scheme"), false);
});
