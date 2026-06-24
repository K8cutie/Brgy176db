import { describe, it, expect } from "vitest"
import { formatPeso, formatPesoWhole, getAmountApprovalLevel } from "./financeData"

describe("formatPeso", () => {
  it("formats with the peso sign, separators, and 2 decimals", () => {
    expect(formatPeso(1234.5)).toBe("₱1,234.50")
    expect(formatPeso(0)).toBe("₱0.00")
  })
  it("places the minus sign before the peso sign for negatives", () => {
    expect(formatPeso(-2500)).toBe("-₱2,500.00")
  })
})

describe("formatPesoWhole", () => {
  it("formats whole pesos with separators and no forced decimals", () => {
    expect(formatPesoWhole(1000000)).toBe("₱1,000,000")
    expect(formatPesoWhole(0)).toBe("₱0")
  })
  it("handles negatives", () => {
    expect(formatPesoWhole(-5000)).toBe("-₱5,000")
  })
})

describe("getAmountApprovalLevel", () => {
  // Canonical thresholds — these guard the approval-routing money logic against
  // accidental change. (We only READ this function; we never modify it.)
  it("Direct Post under ₱100k", () => {
    expect(getAmountApprovalLevel(0).label).toBe("Direct Post")
    expect(getAmountApprovalLevel(99_999).label).toBe("Direct Post")
  })
  it("Council Review at ₱100k up to ₱200k", () => {
    expect(getAmountApprovalLevel(100_000).label).toBe("Council Review Required")
    expect(getAmountApprovalLevel(199_999).label).toBe("Council Review Required")
  })
  it("Council Consent at ₱200k up to ₱500k", () => {
    expect(getAmountApprovalLevel(200_000).label).toBe("Council Consent Required")
    expect(getAmountApprovalLevel(499_999).label).toBe("Council Consent Required")
  })
  it("Bishop Approval at ₱500k and above", () => {
    expect(getAmountApprovalLevel(500_000).label).toBe("Bishop Approval Required")
    expect(getAmountApprovalLevel(10_000_000).label).toBe("Bishop Approval Required")
  })
  it("returns matching color/bgColor tokens for each level", () => {
    const lvl = getAmountApprovalLevel(50_000)
    expect(lvl.color).toBeTruthy()
    expect(lvl.bgColor).toBeTruthy()
  })
})
