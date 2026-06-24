import { describe, it, expect } from "vitest"
import { classifySubCategory, formatPeso } from "./analyticsEngine"

describe("classifySubCategory — revenue", () => {
  it("routes Sunday Mass collections by Mass time", () => {
    expect(classifySubCategory("6AM Mass collection", "4000")?.code).toBe("4010")
    expect(classifySubCategory("8am mass", "4000")?.code).toBe("4015")
    expect(classifySubCategory("10AM Mass", "4000")?.code).toBe("4020")
    expect(classifySubCategory("6PM anticipated", "4000")?.code).toBe("4025")
  })
  it("defaults unknown Sunday collections to Other Collections", () => {
    expect(classifySubCategory("loose change box", "4000")?.code).toBe("4030")
  })
  it("classifies donations (special, pledge, regular)", () => {
    expect(classifySubCategory("Anonymous special gift", "4100")?.code).toBe("4102")
    expect(classifySubCategory("Building pledge", "4100")?.code).toBe("4103")
    expect(classifySubCategory("weekly donation", "4100")?.code).toBe("4101")
  })
  it("classifies sacrament fees", () => {
    expect(classifySubCategory("Wedding of the Santos", "4200")?.code).toBe("4202")
    expect(classifySubCategory("Baptism fee", "4200")?.code).toBe("4201")
    expect(classifySubCategory("Confirmation batch", "4200")?.code).toBe("4203")
    expect(classifySubCategory("Funeral / burial", "4200")?.code).toBe("4204")
    expect(classifySubCategory("permit", "4200")?.code).toBe("4205")
  })
})

describe("classifySubCategory — expense", () => {
  it("classifies personnel costs", () => {
    expect(classifySubCategory("SSS benefit remittance", "5000")?.code).toBe("5015")
    expect(classifySubCategory("Honorarium for guest priest", "5000")?.code).toBe("5020")
    expect(classifySubCategory("monthly salary", "5000")?.code).toBe("5010")
  })
  it("classifies utilities incl. Filipino vendor names", () => {
    expect(classifySubCategory("Meralco bill", "5100")?.code).toBe("5110")
    expect(classifySubCategory("Maynilad tubig", "5100")?.code).toBe("5115")
    expect(classifySubCategory("PLDT internet", "5100")?.code).toBe("5120")
  })
  it("classifies liturgical vs cleaning vs office supplies", () => {
    expect(classifySubCategory("altar candle and wine", "5300")?.code).toBe("5315")
    expect(classifySubCategory("cleaning supplies", "5300")?.code).toBe("5320")
    expect(classifySubCategory("office paper", "5300")?.code).toBe("5310")
  })
  it("returns null for an unknown parent code", () => {
    expect(classifySubCategory("anything", "9999")).toBeNull()
  })
})

describe("analyticsEngine.formatPeso", () => {
  it("formats whole-peso amounts with the sign and separators", () => {
    expect(formatPeso(1234)).toContain("₱")
    expect(formatPeso(1234)).toContain("1,234")
  })
})
