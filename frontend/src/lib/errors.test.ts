import { describe, it, expect } from "vitest";
import { isUnreachableError } from "./errors";

describe("isUnreachableError", () => {
  it("returns true for an Error whose message contains 'VPN'", () => {
    expect(isUnreachableError(new Error("Can't connect — check your VPN"))).toBe(true);
  });

  it("is case-insensitive for vpn", () => {
    expect(isUnreachableError(new Error("vpn required"))).toBe(true);
    expect(isUnreachableError(new Error("Please enable VPN"))).toBe(true);
  });

  it("returns true for an Error whose message starts with '503'", () => {
    expect(isUnreachableError(new Error("503: Service Unavailable"))).toBe(true);
  });

  it("returns true for a string starting with '503'", () => {
    expect(isUnreachableError("503: connection refused")).toBe(true);
  });

  it("returns true for 'Error: 503 ...' form", () => {
    expect(isUnreachableError("Error: 503 bad gateway")).toBe(true);
  });

  it("returns false for a normal network error", () => {
    expect(isUnreachableError(new Error("Network Error"))).toBe(false);
  });

  it("returns false for a 404 error", () => {
    expect(isUnreachableError(new Error("404: Not Found"))).toBe(false);
  });

  it("returns false for a 500 error that doesn't start with 503 or mention VPN", () => {
    expect(isUnreachableError(new Error("500: Internal Server Error"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isUnreachableError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isUnreachableError(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isUnreachableError("")).toBe(false);
  });
});
