import { describe, it, expect, beforeEach } from "vitest"
import {
  parsePositiveInt,
  parseNonNegativeInt,
  parseNonNegativeFloat,
  parsePesoAmount,
  sanitizeText,
  hasContent,
  validateOverrideReason,
  validateName,
  validateDate,
  safeJsonParse,
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "./validation"

describe("parsePositiveInt", () => {
  it("accepts positive integers from numbers", () => {
    expect(parsePositiveInt(5)).toBe(5)
    expect(parsePositiveInt(1)).toBe(1)
  })
  it("floors positive floats passed as numbers", () => {
    expect(parsePositiveInt(5.9)).toBe(5)
  })
  it("rejects zero and negatives", () => {
    expect(parsePositiveInt(0)).toBeNull()
    expect(parsePositiveInt(-3)).toBeNull()
  })
  it("rejects non-finite numbers", () => {
    expect(parsePositiveInt(Infinity)).toBeNull()
    expect(parsePositiveInt(NaN)).toBeNull()
  })
  it("parses clean numeric strings", () => {
    expect(parsePositiveInt("42")).toBe(42)
  })
  it("rejects strings with trailing garbage (no silent truncation)", () => {
    expect(parsePositiveInt("123abc")).toBeNull()
    expect(parsePositiveInt("12.5")).toBeNull()
  })
  it("rejects empty/blank strings", () => {
    expect(parsePositiveInt("")).toBeNull()
    expect(parsePositiveInt("   ")).toBeNull()
  })
})

describe("parseNonNegativeInt", () => {
  it("accepts zero", () => {
    expect(parseNonNegativeInt(0)).toBe(0)
    expect(parseNonNegativeInt("0")).toBe(0)
  })
  it("rejects negatives", () => {
    expect(parseNonNegativeInt(-1)).toBeNull()
    expect(parseNonNegativeInt("-1")).toBeNull()
  })
  it("rejects trailing garbage", () => {
    expect(parseNonNegativeInt("10x")).toBeNull()
  })
})

describe("parseNonNegativeFloat", () => {
  it("accepts decimals", () => {
    expect(parseNonNegativeFloat("123.45")).toBe(123.45)
    expect(parseNonNegativeFloat(0.5)).toBe(0.5)
  })
  it("accepts zero", () => {
    expect(parseNonNegativeFloat(0)).toBe(0)
  })
  it("rejects negatives", () => {
    expect(parseNonNegativeFloat(-0.01)).toBeNull()
    expect(parseNonNegativeFloat("-5")).toBeNull()
  })
  it("rejects blank", () => {
    expect(parseNonNegativeFloat("")).toBeNull()
  })
})

describe("parsePesoAmount", () => {
  it("delegates to non-negative integer parsing", () => {
    expect(parsePesoAmount("300")).toBe(300)
    expect(parsePesoAmount(0)).toBe(0)
    expect(parsePesoAmount("-5")).toBeNull()
    // peso amounts are whole pesos here: decimals rejected
    expect(parsePesoAmount("10.50")).toBeNull()
  })
})

describe("sanitizeText", () => {
  it("strips angle brackets", () => {
    expect(sanitizeText("<script>alert(1)</script>")).toBe("scriptalert(1)/script")
  })
  it("strips javascript: protocol case-insensitively", () => {
    expect(sanitizeText("JavaScript:alert(1)")).toBe("alert(1)")
  })
  it("trims and clamps to maxLength", () => {
    expect(sanitizeText("  hi  ")).toBe("hi")
    expect(sanitizeText("abcdef", 3)).toBe("abc")
  })
  it("returns empty string for non-strings/empty", () => {
    expect(sanitizeText("")).toBe("")
    // @ts-expect-error testing runtime guard
    expect(sanitizeText(null)).toBe("")
  })
})

describe("hasContent", () => {
  it("is true for real content", () => {
    expect(hasContent("a")).toBe(true)
  })
  it("is false for whitespace-only or empty", () => {
    expect(hasContent("   ")).toBe(false)
    expect(hasContent("")).toBe(false)
  })
})

describe("validateOverrideReason", () => {
  it("accepts a valid reason", () => {
    expect(validateOverrideReason("Waived for indigent family")).toBeNull()
  })
  it("requires a reason", () => {
    expect(validateOverrideReason("")).toBe("Override reason is required.")
    expect(validateOverrideReason("    ")).toBe("Override reason is required.")
  })
  it("enforces a 5-char minimum", () => {
    expect(validateOverrideReason("ok")).toBe("Override reason must be at least 5 characters.")
  })
  it("enforces a 500-char maximum", () => {
    expect(validateOverrideReason("x".repeat(501))).toBe(
      "Override reason must be under 500 characters.",
    )
  })
})

describe("validateName", () => {
  it("accepts a valid name", () => {
    expect(validateName("Juan dela Cruz", "Name")).toBeNull()
  })
  it("requires the field with its label", () => {
    expect(validateName("", "Donor")).toBe("Donor is required.")
  })
  it("rejects too-long names", () => {
    expect(validateName("a".repeat(101), "Name")).toBe("Name is too long (max 100 characters).")
  })
})

describe("validateDate", () => {
  it("accepts a real ISO date", () => {
    expect(validateDate("2026-06-24")).toBe(true)
  })
  it("rejects wrong formats", () => {
    expect(validateDate("2026/06/24")).toBe(false)
    expect(validateDate("06-24-2026")).toBe(false)
    expect(validateDate("")).toBe(false)
  })
  it("rejects impossible dates", () => {
    // JS Date rolls 2026-13-01 over; the regex+getTime guard should reject the
    // out-of-range month rather than silently accept a rolled-over date.
    expect(validateDate("2026-13-40")).toBe(false)
  })
})

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 })
  })
  it("returns the fallback on null or invalid JSON", () => {
    expect(safeJsonParse(null, "fb")).toBe("fb")
    expect(safeJsonParse("{not json", "fb")).toBe("fb")
  })
})

describe("safe localStorage helpers", () => {
  beforeEach(() => localStorage.clear())

  it("round-trips a value", () => {
    expect(safeLocalStorageSet("k", { n: 1 })).toBe(true)
    expect(safeLocalStorageGet("k", null)).toEqual({ n: 1 })
  })
  it("returns fallback for a missing key", () => {
    expect(safeLocalStorageGet("missing", "fb")).toBe("fb")
  })
  it("returns fallback for corrupt stored JSON", () => {
    localStorage.setItem("bad", "{not json")
    expect(safeLocalStorageGet("bad", "fb")).toBe("fb")
  })
})
