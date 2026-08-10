import { describe, expect, it, afterEach } from "vitest";
import { isAdminRequest } from "../lib/admin-auth";

afterEach(() => {
  delete process.env.MC_ADMIN_TOKEN;
});

describe("admin auth", () => {
  it("fails closed when MC_ADMIN_TOKEN is absent", () => {
    delete process.env.MC_ADMIN_TOKEN;
    expect(isAdminRequest(new Request("http://localhost/api/system"))).toBe(false);
  });

  it("accepts an exact bearer token", () => {
    process.env.MC_ADMIN_TOKEN = "test-admin-token-123";
    expect(isAdminRequest(new Request("http://localhost/api/system", {
      headers: { authorization: "Bearer test-admin-token-123" },
    }))).toBe(true);
  });

  it("rejects partial or malformed credentials", () => {
    process.env.MC_ADMIN_TOKEN = "test-admin-token-123";
    expect(isAdminRequest(new Request("http://localhost/api/system", {
      headers: { authorization: "Bearer test-admin-token-123-extra" },
    }))).toBe(false);
    expect(isAdminRequest(new Request("http://localhost/api/system", {
      headers: { authorization: "Basic test-admin-token-123" },
    }))).toBe(false);
  });

  it("accepts the HttpOnly session cookie form", () => {
    process.env.MC_ADMIN_TOKEN = "test-admin-token-123";
    expect(isAdminRequest(new Request("http://localhost/api/system", {
      headers: { cookie: "mc_admin_session=test-admin-token-123" },
    }))).toBe(true);
  });
});
