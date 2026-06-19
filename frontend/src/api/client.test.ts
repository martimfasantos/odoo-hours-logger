import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "./client";

function mockFetch(body: unknown, status = 200) {
  const resp = {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(String(body)),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resp));
  return resp;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("api.health", () => {
  it("GETs /api/health and returns parsed JSON", async () => {
    mockFetch({ status: "ok" });
    const result = await api.health();
    expect(fetch).toHaveBeenCalledWith("/api/health", expect.objectContaining({}));
    expect(result).toEqual({ status: "ok" });
  });
});

describe("api.contracts", () => {
  it("GETs /api/odoo/contracts with empty query by default", async () => {
    mockFetch([{ id: 1, name: "Acme" }]);
    const result = await api.contracts();
    expect(fetch).toHaveBeenCalledWith(
      "/api/odoo/contracts?query=",
      expect.objectContaining({})
    );
    expect(result).toEqual([{ id: 1, name: "Acme" }]);
  });

  it("encodes the query string", async () => {
    mockFetch([]);
    await api.contracts("hello world");
    expect(fetch).toHaveBeenCalledWith(
      "/api/odoo/contracts?query=hello%20world",
      expect.objectContaining({})
    );
  });
});

describe("api.events", () => {
  it("GETs /api/calendar/events with start and end", async () => {
    mockFetch([]);
    await api.events("2026-06-01", "2026-06-07");
    expect(fetch).toHaveBeenCalledWith(
      "/api/calendar/events?start=2026-06-01&end=2026-06-07",
      expect.objectContaining({})
    );
  });
});

describe("api.push", () => {
  it("POSTs /api/timesheet/push with entries in body", async () => {
    const entries = [
      {
        uid: "abc",
        start: "2026-06-01T09:00:00",
        end: "2026-06-01T10:00:00",
        description: "Work",
        contract_id: 42,
      },
    ];
    mockFetch({ results: [] });
    await api.push(entries);
    expect(fetch).toHaveBeenCalledWith(
      "/api/timesheet/push",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ entries }),
      })
    );
  });

  it("returns the parsed push response", async () => {
    const resp = { results: [{ uid: "a", start: "2026-06-01T09:00:00", success: true, odoo_id: 1, error: null }] };
    mockFetch(resp);
    const result = await api.push([]);
    expect(result).toEqual(resp);
  });
});

describe("api.getConfig", () => {
  it("GETs /api/config", async () => {
    mockFetch({ ODOO_URL: "https://odoo.example.com" });
    await api.getConfig();
    expect(fetch).toHaveBeenCalledWith("/api/config", expect.objectContaining({}));
  });
});

describe("api.saveConfig", () => {
  it("PUTs /api/config with the provided values as JSON body", async () => {
    const values = { ODOO_URL: "https://new.example.com", DEMO_MODE: false };
    mockFetch(values);
    await api.saveConfig(values);
    expect(fetch).toHaveBeenCalledWith(
      "/api/config",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(values),
      })
    );
  });
});

describe("api.testConnection", () => {
  it("POSTs /api/settings/test-connection", async () => {
    mockFetch({ odoo: true, calendar: true, odoo_unreachable: false, errors: {} });
    await api.testConnection();
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/test-connection",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("api.getColors", () => {
  it("GETs /api/colors and returns parsed JSON", async () => {
    mockFetch({ "42": "#ff0000" });
    const result = await api.getColors();
    expect(fetch).toHaveBeenCalledWith("/api/colors", expect.objectContaining({}));
    expect(result).toEqual({ "42": "#ff0000" });
  });
});

describe("api.setColor", () => {
  it("PUTs /api/colors/:id with the color in body", async () => {
    mockFetch({ "42": "#ff0000" });
    await api.setColor(42, "#ff0000");
    expect(fetch).toHaveBeenCalledWith(
      "/api/colors/42",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ color: "#ff0000" }),
      })
    );
  });
});

describe("api.listRules", () => {
  it("GETs /api/rules", async () => {
    mockFetch([]);
    await api.listRules();
    expect(fetch).toHaveBeenCalledWith("/api/rules", expect.objectContaining({}));
  });
});

describe("api.createRule", () => {
  it("POSTs /api/rules with the rule payload", async () => {
    const payload = {
      name: "Test rule",
      keywords: ["sync", "meeting"],
      contract_id: 5,
      contract_name: "Acme",
      active: true,
    };
    mockFetch({ id: 1, ...payload });
    await api.createRule(payload);
    expect(fetch).toHaveBeenCalledWith(
      "/api/rules",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });
});

describe("api.getIgnoreKeywords", () => {
  it("GETs /api/ignore", async () => {
    mockFetch(["Lunch", "OOO"]);
    const result = await api.getIgnoreKeywords();
    expect(fetch).toHaveBeenCalledWith("/api/ignore", expect.objectContaining({}));
    expect(result).toEqual(["Lunch", "OOO"]);
  });
});

describe("api.setIgnoreKeywords", () => {
  it("PUTs /api/ignore with keywords in body", async () => {
    const kws = ["Lunch", "OOO"];
    mockFetch(kws);
    await api.setIgnoreKeywords(kws);
    expect(fetch).toHaveBeenCalledWith(
      "/api/ignore",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ keywords: kws }),
      })
    );
  });
});

describe("non-2xx response", () => {
  it("rejects with an error containing the status and body text", async () => {
    mockFetch("Service Unavailable", 503);
    await expect(api.health()).rejects.toThrow("503:");
  });
});
