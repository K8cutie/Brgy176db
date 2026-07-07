import { describe, it, expect, beforeEach } from "vitest"
import { generateDiocesePacket } from "./diocesePacket"
import { setModuleEnabled } from "./moduleRegistry"
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

describe("parish_status active modules come from the toggleable registry", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("includes registry-only modules (intentions/requests) the legacy identity list never had", () => {
    const packet = generateDiocesePacket(["parish_status"])
    expect(packet.parishStatus?.activeModules).toContain("intentions")
    expect(packet.parishStatus?.activeModules).toContain("requests")
  })

  it("a Settings module toggle is reflected in the next packet", () => {
    setModuleEnabled("ssdm", false)
    const packet = generateDiocesePacket(["parish_status"])
    expect(packet.parishStatus?.activeModules).not.toContain("ssdm")
    // Re-enabling shows up again — the packet tracks live registry state.
    setModuleEnabled("ssdm", true)
    const packet2 = generateDiocesePacket(["parish_status"])
    expect(packet2.parishStatus?.activeModules).toContain("ssdm")
  })
})

describe("attendance_summary scope", () => {
  beforeEach(() => {
    localStorage.clear()
    seed(KEYS.attendance, [
      { id: "1", eventId: "a", eventTitle: "Sunday Mass", date: "2026-05-03", count: 200, recordedAt: "2026-05-03T10:00:00.000Z" },
      { id: "2", eventId: "b", eventTitle: "Sunday Mass", date: "2026-05-10", count: 300, recordedAt: "2026-05-10T10:00:00.000Z" },
    ])
  })

  it("includes the privacy-safe rollup (counts only) when selected", () => {
    const packet = generateDiocesePacket(["attendance_summary"])
    expect(packet.scope).toContain("attendance_summary")
    expect(packet.attendanceSummary).toEqual({
      eventsCounted: 2,
      totalHeadcount: 500,
      averageHeadcount: 250,
      byMonth: { "2026-05": { events: 2, total: 500 } },
    })
  })

  it("is omitted when the scope is not selected", () => {
    const packet = generateDiocesePacket(["parish_status"])
    expect(packet.attendanceSummary).toBeUndefined()
  })
})
