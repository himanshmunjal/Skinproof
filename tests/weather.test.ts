import { describe, expect, it } from "vitest";
import { skinWeatherTips, uvLevel } from "@/lib/domain/weather";

describe("skin weather", () => {
  it("grades UV", () => {
    expect(uvLevel(1).label).toBe("Low");
    expect(uvLevel(4).label).toBe("Moderate");
    expect(uvLevel(7).label).toBe("High");
    expect(uvLevel(10).label).toBe("Very high");
  });

  it("links high UV to photosensitising actives on the shelf", () => {
    const tips = skinWeatherTips({ uvMax: 8.2, humidity: 50, tempC: 25 }, ["retinoid", "aha", "sunscreen"], []);
    expect(tips[0]).toMatchObject({ tone: "bad", title: "UV peaks at 8 today" });
    expect(tips[0].body).toMatch(/retinoid and AHA make/);
    expect(tips[0].body).toMatch(/reapply/);
  });

  it("asks for SPF when the shelf has none", () => {
    const tips = skinWeatherTips({ uvMax: 6, humidity: 50, tempC: 20 }, ["niacinamide"], []);
    expect(tips[0].body).toMatch(/no SPF on your shelf/);
  });

  it("ties dry air to a weak moisture score", () => {
    const tips = skinWeatherTips({ uvMax: 1, humidity: 22, tempC: 15 }, [], ["moisture"]);
    expect(tips[0]).toMatchObject({ tone: "warn" });
    expect(tips[0].body).toMatch(/Moisture is already one of your weakest/);
  });

  it("falls back to an easy day", () => {
    expect(skinWeatherTips({ uvMax: 1, humidity: 50, tempC: 18 }, [], [])).toEqual([{ tone: "good", title: "Easy skin day", body: expect.any(String) }]);
  });
});
