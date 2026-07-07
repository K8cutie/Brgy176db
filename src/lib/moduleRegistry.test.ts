import { describe, it, expect, beforeEach } from "vitest"
import {
  getModuleRegistry,
  getModulesByCategory,
  getEnabledDependents,
  getDisabledDependencies,
  setModuleEnabled,
  toggleModule,
  isModuleEnabled,
  getEnabledRoutes,
  subscribeModules,
  getModulesSnapshot,
} from "./moduleRegistry"
import { getParishId } from "./parishIdentity"

beforeEach(() => localStorage.clear())

describe("default registry", () => {
  it("includes the intentions module (pastoral, enabled by default)", () => {
    const mod = getModuleRegistry().find((m) => m.id === "intentions")
    expect(mod).toBeDefined()
    expect(mod?.category).toBe("pastoral")
    expect(mod?.enabled).toBe(true)
    expect(mod?.route).toBe("/intentions")
  })
  it("every dependency id refers to a real module", () => {
    const ids = new Set(getModuleRegistry().map((m) => m.id))
    for (const m of getModuleRegistry()) {
      for (const dep of m.dependencies) expect(ids.has(dep)).toBe(true)
    }
  })
  it("getModulesByCategory filters correctly", () => {
    const pastoral = getModulesByCategory("pastoral").map((m) => m.id)
    expect(pastoral).toContain("intentions")
    expect(pastoral).toContain("calendar")
    expect(pastoral).not.toContain("finance")
  })
})

describe("core protection", () => {
  it("refuses to change a core module", () => {
    expect(setModuleEnabled("dashboard", false)).toBeNull()
    expect(isModuleEnabled("dashboard")).toBe(true)
    expect(toggleModule("dashboard")).toBe(false)
    expect(isModuleEnabled("dashboard")).toBe(true)
  })
  it("refuses an unknown module", () => {
    expect(setModuleEnabled("nope", true)).toBeNull()
  })
  it("ignores a stored override that tries to disable a core module", () => {
    localStorage.setItem(
      `churchos_parish_${getParishId()}_module_overrides`,
      JSON.stringify({ dashboard: { enabled: false } }),
    )
    expect(isModuleEnabled("dashboard")).toBe(true)
  })
})

describe("dependency enforcement", () => {
  it("disabling a dependency also disables its enabled dependents (registry → reports)", () => {
    const changed = setModuleEnabled("registry", false)
    expect(changed).toEqual(expect.arrayContaining(["registry", "reports"]))
    expect(isModuleEnabled("registry")).toBe(false)
    expect(isModuleEnabled("reports")).toBe(false)
    // finance was not a dependent — untouched
    expect(isModuleEnabled("finance")).toBe(true)
  })
  it("enabling a module also enables its disabled dependencies (reports → registry+finance)", () => {
    setModuleEnabled("registry", false)
    setModuleEnabled("finance", false)
    const changed = setModuleEnabled("reports", true)
    expect(changed).toEqual(expect.arrayContaining(["registry", "finance", "reports"]))
    expect(isModuleEnabled("registry")).toBe(true)
    expect(isModuleEnabled("finance")).toBe(true)
    expect(isModuleEnabled("reports")).toBe(true)
  })
  it("getEnabledDependents / getDisabledDependencies report both directions", () => {
    expect(getEnabledDependents("registry").map((m) => m.id)).toEqual(["reports"])
    expect(getDisabledDependencies("reports")).toEqual([])
    setModuleEnabled("finance", false) // also takes reports down
    expect(getDisabledDependencies("reports").map((m) => m.id)).toEqual(["finance"])
  })
  it("is a no-op (empty change list) when already in the requested state", () => {
    expect(setModuleEnabled("ssdm", true)).toEqual([])
  })
  it("toggleModule flips state and returns the new state", () => {
    expect(toggleModule("ssdm")).toBe(false)
    expect(isModuleEnabled("ssdm")).toBe(false)
    expect(toggleModule("ssdm")).toBe(true)
    expect(isModuleEnabled("ssdm")).toBe(true)
  })
})

describe("persistence through the namespaced seam", () => {
  it("writes overrides to the parish-namespaced key, not the bare legacy key", () => {
    setModuleEnabled("ssdm", false)
    const raw = localStorage.getItem(`churchos_parish_${getParishId()}_module_overrides`)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!)).toMatchObject({ ssdm: { enabled: false } })
    expect(localStorage.getItem("churchos_module_overrides")).toBeNull()
  })
  it("migrates the legacy bare churchos_module_overrides key on first read", () => {
    localStorage.setItem("churchos_module_overrides", JSON.stringify({ ssdm: { enabled: false } }))
    expect(isModuleEnabled("ssdm")).toBe(false)
    const migrated = localStorage.getItem(`churchos_parish_${getParishId()}_module_overrides`)
    expect(migrated).toBeTruthy()
    expect(JSON.parse(migrated!)).toMatchObject({ ssdm: { enabled: false } })
  })
  it("survives a fresh read (state is stored, not in-memory)", () => {
    setModuleEnabled("requests", false)
    expect(getModuleRegistry().find((m) => m.id === "requests")?.enabled).toBe(false)
    expect(getEnabledRoutes().map((r) => r.route)).not.toContain("/requests")
  })
})

describe("change subscription", () => {
  it("notifies listeners and bumps the snapshot when state changes", () => {
    let calls = 0
    const unsub = subscribeModules(() => { calls++ })
    const before = getModulesSnapshot()
    setModuleEnabled("ssdm", false)
    expect(calls).toBe(1)
    expect(getModulesSnapshot()).toBe(before + 1)
    // no-op change does not notify
    setModuleEnabled("ssdm", false)
    expect(calls).toBe(1)
    unsub()
    setModuleEnabled("ssdm", true)
    expect(calls).toBe(1)
  })
})
