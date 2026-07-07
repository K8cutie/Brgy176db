import { describe, it, expect } from "vitest"
import {
  DEFAULT_SACRAMENT_INFO,
  EVENT_TYPE_TO_SACRAMENT,
  getSacramentInfo,
  buildAckSummary,
  type SacramentInfo,
} from "./sacramentRequirements"

const byKey = (key: string) => DEFAULT_SACRAMENT_INFO.find((s) => s.key === key)!

describe("DEFAULT_SACRAMENT_INFO", () => {
  it("covers all 8 service keys", () => {
    const keys = DEFAULT_SACRAMENT_INFO.map((s) => s.key).sort()
    expect(keys).toEqual([
      "baptism",
      "blessing",
      "certificate",
      "confirmation",
      "first_communion",
      "funeral",
      "mass_intention",
      "wedding",
    ])
  })

  it("baptism, wedding, confirmation each have a document and a sponsor-or-preparation item", () => {
    for (const key of ["baptism", "wedding", "confirmation"]) {
      const info = byKey(key)
      expect(info.requirements.some((r) => r.kind === "document")).toBe(true)
      expect(info.requirements.some((r) => r.kind === "sponsor" || r.kind === "preparation")).toBe(true)
    }
  })

  it("wedding lists at least 6 requirements", () => {
    expect(byKey("wedding").requirements.length).toBeGreaterThanOrEqual(6)
  })

  it("every requirement has a globally unique id, a label, and a valid kind", () => {
    const kinds = ["document", "preparation", "eligibility", "sponsor"]
    const ids = new Set<string>()
    for (const info of DEFAULT_SACRAMENT_INFO) {
      for (const r of info.requirements) {
        expect(r.label.length).toBeGreaterThan(0)
        expect(kinds).toContain(r.kind)
        expect(ids.has(r.id)).toBe(false)
        ids.add(r.id)
      }
    }
  })

  it("every entry has a title, an icon, and at least one requirement", () => {
    for (const info of DEFAULT_SACRAMENT_INFO) {
      expect(info.title.length).toBeGreaterThan(0)
      expect(info.icon.length).toBeGreaterThan(0)
      expect(info.requirements.length).toBeGreaterThan(0)
    }
  })
})

describe("EVENT_TYPE_TO_SACRAMENT", () => {
  it("maps the portal's event labels to real catalog keys", () => {
    expect(EVENT_TYPE_TO_SACRAMENT).toEqual({
      Baptism: "baptism",
      Wedding: "wedding",
      Funeral: "funeral",
      Blessing: "blessing",
    })
    for (const key of Object.values(EVENT_TYPE_TO_SACRAMENT)) {
      expect(getSacramentInfo(key)).toBeDefined()
    }
  })
})

describe("getSacramentInfo", () => {
  it("returns the default entry when no config is given", () => {
    expect(getSacramentInfo("baptism")).toEqual(byKey("baptism"))
    expect(getSacramentInfo("baptism", undefined)).toEqual(byKey("baptism"))
  })

  it("returns undefined for an unknown key", () => {
    expect(getSacramentInfo("exorcism")).toBeUndefined()
  })

  it("replaces the requirements with a valid per-parish override, keeping the rest", () => {
    const cfg = {
      requirements: {
        baptism: [
          { label: "Barangay certificate", detail: "From your barangay hall", kind: "document" },
          { label: "Attend our own seminar" }, // no kind, no detail — still valid
        ],
      },
    }
    const info = getSacramentInfo("baptism", cfg)!
    expect(info.requirements).toHaveLength(2)
    expect(info.requirements[0].label).toBe("Barangay certificate")
    expect(info.requirements[0].detail).toBe("From your barangay hall")
    expect(info.requirements[1].kind).toBe("document") // missing kind defaults to document
    expect(info.requirements[1].detail).toBeUndefined()
    expect(info.title).toBe(byKey("baptism").title) // non-requirement fields untouched
    expect(info.leadTime).toBe(byKey("baptism").leadTime)
    // ids are generated and unique so checkbox state can key off them
    expect(info.requirements[0].id).not.toBe(info.requirements[1].id)
  })

  it("coerces an unknown kind to 'document'", () => {
    const cfg = { requirements: { wedding: [{ label: "Special paper", kind: "banana" }] } }
    expect(getSacramentInfo("wedding", cfg)!.requirements[0].kind).toBe("document")
  })

  it("does not mutate the default catalog when overriding", () => {
    const before = byKey("funeral").requirements.length
    getSacramentInfo("funeral", { requirements: { funeral: [{ label: "Only one" }] } })
    expect(byKey("funeral").requirements.length).toBe(before)
  })

  it("falls back to defaults for malformed overrides", () => {
    const def = byKey("baptism").requirements
    const bads: unknown[] = [
      "not an array",
      123,
      { label: "an object, not an array" },
      [], // empty list is treated as no override
      ["just a string"],
      [{ detail: "missing label entirely" }],
      [{ label: "" }], // blank label
      [{ label: "ok" }, { label: 42 }], // one bad item poisons the whole override
      [null],
    ]
    for (const bad of bads) {
      const info = getSacramentInfo("baptism", { requirements: { baptism: bad } })!
      expect(info.requirements).toEqual(def)
    }
  })

  it("ignores configs where requirements itself is malformed or absent", () => {
    const def = byKey("baptism").requirements
    for (const cfg of [null, 5, "x", {}, { requirements: "nope" }, { requirements: [1, 2] }, { requirements: null }]) {
      expect(getSacramentInfo("baptism", cfg)!.requirements).toEqual(def)
    }
  })
})

describe("buildAckSummary", () => {
  const info: SacramentInfo = {
    key: "t",
    title: "Test",
    icon: "x",
    requirements: [
      { id: "a", label: "Alpha", kind: "document" },
      { id: "b", label: "Beta", kind: "preparation" },
      { id: "c", label: "Gamma", kind: "sponsor" },
    ],
  }

  it("counts ready vs missing and lists the labels", () => {
    const { ready, missing } = buildAckSummary(info, ["a", "c"])
    expect(ready).toBe("2/3 — Alpha, Gamma")
    expect(missing).toBe("1/3 — Beta")
  })

  it("returns 0/N with no label list when nothing is checked", () => {
    const { ready, missing } = buildAckSummary(info, [])
    expect(ready).toBe("0/3")
    expect(missing).toBe("3/3 — Alpha, Beta, Gamma")
  })

  it("returns N/N ready and 0/N missing when everything is checked", () => {
    const { ready, missing } = buildAckSummary(info, ["a", "b", "c"])
    expect(ready).toBe("3/3 — Alpha, Beta, Gamma")
    expect(missing).toBe("0/3")
  })

  it("ignores checked ids that are not requirements", () => {
    const { ready } = buildAckSummary(info, ["a", "zzz", "b"])
    expect(ready).toBe("2/3 — Alpha, Beta")
  })

  it("caps both strings at 500 chars with an ellipsis under absurdly long labels", () => {
    const long: SacramentInfo = {
      key: "l",
      title: "Long",
      icon: "x",
      requirements: Array.from({ length: 40 }, (_, i) => ({
        id: `r${i}`,
        label: "X".repeat(80),
        kind: "document" as const,
      })),
    }
    const half = long.requirements.slice(0, 20).map((r) => r.id)
    const { ready, missing } = buildAckSummary(long, half)
    expect(ready.length).toBeLessThanOrEqual(500)
    expect(missing.length).toBeLessThanOrEqual(500)
    expect(ready.endsWith("…")).toBe(true)
    expect(missing.endsWith("…")).toBe(true)
    expect(ready.startsWith("20/40 — ")).toBe(true)
    expect(missing.startsWith("20/40 — ")).toBe(true)
  })
})
