import { describe, it, expect, beforeEach } from "vitest"
import {
  DEFAULT_FEE_SCHEDULE,
  getFeeSchedule,
  setFeeSchedule,
  getFeeForSacrament,
  canEditFeeSchedule,
  type FeeScheduleItem,
} from "./feeSchedule"

beforeEach(() => localStorage.clear())

describe("DEFAULT_FEE_SCHEDULE", () => {
  it("covers all four sacraments with non-negative fees", () => {
    const types = DEFAULT_FEE_SCHEDULE.map((f) => f.sacramentType).sort()
    expect(types).toEqual(["Baptism", "Confirmation", "Death", "Marriage"])
    for (const f of DEFAULT_FEE_SCHEDULE) {
      expect(f.ceremonyFee).toBeGreaterThanOrEqual(0)
      expect(f.certificateFee).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("getFeeSchedule", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(getFeeSchedule()).toEqual(DEFAULT_FEE_SCHEDULE)
  })
  it("returns a NEW array (not the same reference) when using defaults", () => {
    // Documents current behavior: a fresh array is returned each call, so callers
    // can push/splice without affecting DEFAULT_FEE_SCHEDULE's length/order.
    expect(getFeeSchedule()).not.toBe(DEFAULT_FEE_SCHEDULE)
    expect(getFeeSchedule()).not.toBe(getFeeSchedule())
  })
  it("NOTE: the default copy is shallow — item objects are shared by reference", () => {
    // KNOWN SHARED-REFERENCE behavior (not fixed here — would touch source logic).
    // getFeeSchedule() does `[...DEFAULT_FEE_SCHEDULE]`, so the element objects are
    // the same references. A caller that mutates an item in place will corrupt the
    // canonical default for the rest of the process. Callers should treat the
    // returned items as read-only or clone before editing. Test asserts the actual
    // behavior so a future deep-copy fix will (intentionally) flip this expectation.
    const a = getFeeSchedule()
    a[0].ceremonyFee = 99999
    expect(DEFAULT_FEE_SCHEDULE[0].ceremonyFee).toBe(99999)
    // restore so test order can't leak into sibling tests
    DEFAULT_FEE_SCHEDULE[0].ceremonyFee = 300
  })
  it("returns the stored schedule when present", () => {
    const custom: FeeScheduleItem[] = [
      { sacramentType: "Baptism", ceremonyFee: 500, certificateFee: 150 },
    ]
    setFeeSchedule(custom)
    expect(getFeeSchedule()).toEqual(custom)
  })
  it("falls back to defaults when stored JSON is corrupt", () => {
    localStorage.setItem("churchos_fee_schedule", "{not json")
    expect(getFeeSchedule()).toEqual(DEFAULT_FEE_SCHEDULE)
  })
})

describe("getFeeForSacrament", () => {
  it("returns the matching default fee item", () => {
    expect(getFeeForSacrament("Marriage")?.ceremonyFee).toBe(5000)
    expect(getFeeForSacrament("Baptism")?.certificateFee).toBe(100)
  })
  it("reflects a customized schedule", () => {
    setFeeSchedule([{ sacramentType: "Death", ceremonyFee: 2500, certificateFee: 200 }])
    expect(getFeeForSacrament("Death")?.ceremonyFee).toBe(2500)
    // a sacrament missing from the custom schedule resolves to undefined
    expect(getFeeForSacrament("Baptism")).toBeUndefined()
  })
})

describe("canEditFeeSchedule", () => {
  it("is true for Parish Priest and Bookkeeper", () => {
    localStorage.setItem("churchos_user", JSON.stringify({ role: "Parish Priest" }))
    expect(canEditFeeSchedule()).toBe(true)
    localStorage.setItem("churchos_user", JSON.stringify({ role: "Bookkeeper" }))
    expect(canEditFeeSchedule()).toBe(true)
  })
  it("is true for the real role CODES setSession stores (parish_priest / bookkeeper) — the actual bug", () => {
    localStorage.setItem("churchos_user", JSON.stringify({ role: "parish_priest", roleLabel: "Parish Priest" }))
    expect(canEditFeeSchedule()).toBe(true)
    localStorage.setItem("churchos_user", JSON.stringify({ role: "bookkeeper", roleLabel: "Bookkeeper" }))
    expect(canEditFeeSchedule()).toBe(true)
  })
  it("is false for a non-privileged code (secretary)", () => {
    localStorage.setItem("churchos_user", JSON.stringify({ role: "secretary", roleLabel: "Secretary" }))
    expect(canEditFeeSchedule()).toBe(false)
  })
  it("is false for other roles and when no user is set", () => {
    localStorage.setItem("churchos_user", JSON.stringify({ role: "Volunteer" }))
    expect(canEditFeeSchedule()).toBe(false)
    localStorage.clear()
    expect(canEditFeeSchedule()).toBe(false)
  })
  it("is false (no throw) when the stored user is corrupt", () => {
    localStorage.setItem("churchos_user", "{not json")
    expect(canEditFeeSchedule()).toBe(false)
  })
})
