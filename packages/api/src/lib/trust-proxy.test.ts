import { describe, it, expect } from "vitest";
import { parseTrustProxy } from "./trust-proxy.js";

describe("parseTrustProxy", () => {
  it("trusts nothing when unset or empty", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("   ")).toBe(false);
  });

  it("trusts nothing for explicit off values", () => {
    for (const value of ["false", "FALSE", "off", "0"]) {
      expect(parseTrustProxy(value)).toBe(false);
    }
  });

  it("returns a hop count for numeric values", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy(" 2 ")).toBe(2);
  });

  it("passes address/CIDR lists through as a string", () => {
    expect(parseTrustProxy("10.0.0.0/8,172.16.0.0/12")).toBe("10.0.0.0/8,172.16.0.0/12");
  });

  it('rejects "true" — it would make the rate-limit key client-controlled', () => {
    expect(() => parseTrustProxy("true")).toThrow(/not allowed/);
    expect(() => parseTrustProxy("TRUE")).toThrow(/not allowed/);
  });
});
