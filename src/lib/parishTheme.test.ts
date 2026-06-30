import { describe, it, expect } from "vitest"
import { resolveTheme, FAMILY_BASE, DEFAULT_FAMILY, type ThemePalette } from "./parishTheme"
import { PATRON_CATALOG } from "./patronCatalog"

const HEX = /^#[0-9A-Fa-f]{6}$/

const expectCompletePalette = (p: ThemePalette, label: string) => {
  expect(HEX.test(p.primary), `${label} primary`).toBe(true)
  expect(HEX.test(p.accent), `${label} accent`).toBe(true)
  expect(HEX.test(p.secondary), `${label} secondary`).toBe(true)
  expect(HEX.test(p.surface), `${label} surface`).toBe(true)
  expect(HEX.test(p.onPrimary), `${label} onPrimary`).toBe(true)
  expect(p.liturgicalColor, `${label} liturgicalColor`).toBeTruthy()
}

describe("resolveTheme", () => {
  it("gives an iconic patron its hand-tuned palette + emblem", () => {
    const t = resolveTheme({ patron: "Santo Niño (Holy Child Jesus)" })
    expect(t.source).toBe("iconic")
    expect(t.palette.primary).toBe("#B11226")
    expect(t.emblem).toBe("crown")
  })

  it("resolves a Marian patron with no override to the Marian base", () => {
    const t = resolveTheme({ patron: "Our Lady of Lourdes" })
    expect(t.family).toBe("marian")
    expect(t.palette).toEqual(FAMILY_BASE.marian)
    expect(t.source).toBe("family")
  })

  it("resolves a martyr to the red (Passion) base", () => {
    const t = resolveTheme({ patron: "St. Lucy (Santa Lucia)" })
    expect(t.family).toBe("martyr")
    expect(t.palette.liturgicalColor).toBe("Red")
  })

  it("matches aliases + diacritics — Ina ng Novaliches resolves to Our Lady of Mercy", () => {
    const a = resolveTheme({ patron: "Ina ng Novaliches" })
    const b = resolveTheme({ patron: "Our Lady of Mercy" })
    expect(a.palette).toEqual(b.palette)
    expect(a.patron).toBe("Our Lady of Mercy (Ina ng Novaliches)")
  })

  it("lets an explicit family override the catalog family", () => {
    const t = resolveTheme({ patron: "Our Lady of Lourdes", family: "martyr" })
    expect(t.family).toBe("martyr")
    expect(t.palette).toEqual(FAMILY_BASE.martyr)
  })

  // The fallback the user specifically asked to prove:
  it("an UNKNOWN patron with a given family falls back to that family (never gray, never throws)", () => {
    const t = resolveTheme({ patron: "St. Nobody of Nowhere", family: "marian" })
    expect(t.family).toBe("marian")
    expect(t.palette).toEqual(FAMILY_BASE.marian)
  })

  it("an UNKNOWN patron with no family returns a valid default theme", () => {
    const t = resolveTheme({ patron: "St. Nobody of Nowhere" })
    expect(t.source).toBe("default")
    expect(t.family).toBe(DEFAULT_FAMILY)
    expectCompletePalette(t.palette, "default")
    expect(t.emblem).toBeTruthy()
  })

  it("empty input returns a valid default theme (no throw)", () => {
    const t = resolveTheme()
    expectCompletePalette(t.palette, "empty")
  })

  it("EVERY catalog patron resolves to a complete, valid theme", () => {
    for (const p of PATRON_CATALOG) {
      const t = resolveTheme({ patron: p.patron })
      expectCompletePalette(t.palette, p.patron)
      expect(t.emblem, p.patron).toBeTruthy()
      expect(t.feastDay, p.patron).toBe(p.feastDay)
    }
  })

  it("every family base is a complete palette of valid hex", () => {
    for (const fam of Object.keys(FAMILY_BASE) as Array<keyof typeof FAMILY_BASE>) {
      expectCompletePalette(FAMILY_BASE[fam], fam)
    }
  })
})
