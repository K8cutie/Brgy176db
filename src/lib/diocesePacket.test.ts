import { describe, it, expect, beforeEach } from "vitest"
import { generateDiocesePacket } from "./diocesePacket"
import { ns } from "./storageNamespaced"
import { KEYS } from "./storageKeys"

// jsdom localStorage backend; keys resolved through the namespaced seam so the
// test breaks if diocesePacket ever drifts back to bare key literals.
function seed(key: string, value: unknown) {
  localStorage.setItem(ns(key), JSON.stringify(value))
}

describe("generateDiocesePacket sacramental counts", () => {
  beforeEach(() => {
    localStorage.clear()
    seed(KEYS.baptismRecords, [
      { id: "b1" },
      { id: "b2", isDeleted: false },
      { id: "b3", isDeleted: true, deletedAt: "2026-07-01", deletedBy: "admin" },
    ])
    seed(KEYS.marriageRecords, [{ id: "m1" }])
    seed(KEYS.confirmationRecords, [])
    seed(KEYS.deathRecords, [{ id: "d1", isDeleted: true }])
  })

  it("counts only live records (soft-deleted excluded)", () => {
    const packet = generateDiocesePacket(["sacramental_counts"])
    expect(packet.sacramentalCounts).toEqual({
      baptisms: 2,
      weddings: 1,
      confirmations: 0,
      burials: 0,
    })
  })

  it("parish_status registry total also excludes soft-deleted records", () => {
    const packet = generateDiocesePacket(["parish_status"])
    expect(packet.parishStatus?.sacramentalRegistryTotal).toBe(3)
  })

  it("keeps working on legacy records with no soft-delete fields", () => {
    seed(KEYS.baptismRecords, [{ id: "legacy1" }, { id: "legacy2" }])
    const packet = generateDiocesePacket(["sacramental_counts"])
    expect(packet.sacramentalCounts?.baptisms).toBe(2)
  })
})
