import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CityIndex, countryName, type CityData } from "@/lib/cities";

const index = new CityIndex(JSON.parse(readFileSync("public/data/cities.json", "utf8")) as CityData);

describe("rounding locations to cities", () => {
  it("rounds a downtown point to its city, not a neighbourhood", () => {
    expect(index.snap(41.88, -87.63)).toMatchObject({ kind: "city", name: "Chicago", cc: "US" });
    expect(index.snap(-23.55, -46.63)).toMatchObject({ kind: "city", name: "São Paulo", cc: "BR" });
  });

  it("rounds a suburb to the main city nearby", () => {
    // Evanston is ~20 km from central Chicago.
    expect(index.snap(42.045, -87.69)).toMatchObject({ name: "Chicago" });
  });

  it("uses the country far from any city, and nothing at sea", () => {
    expect(index.snap(-25.0, 133.0)).toMatchObject({ kind: "country", cc: "AU" });
    expect(index.snap(0, -30)).toBeNull();
  });

  it("searches cities and countries without accents", () => {
    const r = index.search("sao paulo");
    expect(r[0]).toMatchObject({ kind: "city", name: "São Paulo" });
    expect(index.search("kenya")[0]).toMatchObject({ kind: "country", cc: "KE" });
  });

  it("names countries", () => {
    expect(countryName("PH")).toBe("Philippines");
  });
});
