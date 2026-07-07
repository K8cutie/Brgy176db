import { describe, it, expect } from "vitest"
import {
  buildParishionerLookupFrom,
  linkSacramentToRegistry,
  families,
  type Family,
} from "./directoryData"

const clone = (): Family[] => JSON.parse(JSON.stringify(families))

describe("buildParishionerLookupFrom", () => {
  it("builds from the GIVEN families, not a static snapshot", () => {
    const extra: Family = {
      ...clone()[0],
      id: "f-new",
      familyName: "Testerson",
      members: [
        {
          id: "p-new",
          firstName: "Newly",
          middleName: "",
          lastName: "Added",
          dateOfBirth: "1990-01-01",
          gender: "Male",
          relationship: "Head",
          sacraments: [],
        },
      ],
    }
    const list = buildParishionerLookupFrom([...clone(), extra])
    expect(list.some((p) => p.id === "p-new")).toBe(true)
  })

  it("excludes soft-deleted (archived) families — soft-delete search contract", () => {
    const fams = clone()
    fams[0] = { ...fams[0], isDeleted: true, deletedAt: "2026-01-01", deletedBy: "x" }
    const list = buildParishionerLookupFrom(fams)
    const deletedIds = families[0].members.map((m) => m.id)
    expect(list.some((p) => deletedIds.includes(p.id))).toBe(false)
    // Members of live families still present.
    expect(list.some((p) => p.familyId === fams[1].id)).toBe(true)
  })
})

describe("linkSacramentToRegistry", () => {
  it("links an existing entry matched by type+date and fills missing refs", () => {
    const fams = clone()
    // p1 Juan Dela Cruz has Marriage 2005-12-10 with no bookPage/registryRecordId.
    const { families: next, changed } = linkSacramentToRegistry(fams, "p1", {
      type: "Marriage",
      date: "2005-12-10",
      parish: "St. Agnes Parish",
      bookPage: "3/41",
      registryRecordId: "m-test-1",
    })
    expect(changed).toBe(true)
    const juan = next[0].members.find((m) => m.id === "p1")!
    const marriages = juan.sacraments.filter((s) => s.type === "Marriage")
    expect(marriages).toHaveLength(1) // upsert, not duplicate
    expect(marriages[0].registryRecordId).toBe("m-test-1")
    expect(marriages[0].bookPage).toBe("3/41")
    expect(marriages[0].parish).toBe("St. Michael") // existing value wins
    // Input untouched (pure helper).
    expect(fams[0].members.find((m) => m.id === "p1")!.sacraments.find((s) => s.type === "Marriage")!.registryRecordId).toBeUndefined()
  })

  it("one-time sacraments match an unlinked same-type entry even when dates differ", () => {
    const fams = clone()
    // p1 has Confirmation 1995-04-20; registry says 1995-04-21 (approximate dates).
    const { families: next, changed } = linkSacramentToRegistry(fams, "p1", {
      type: "Confirmation",
      date: "1995-04-21",
      registryRecordId: "c-test-1",
    })
    expect(changed).toBe(true)
    const juan = next[0].members.find((m) => m.id === "p1")!
    const confs = juan.sacraments.filter((s) => s.type === "Confirmation")
    expect(confs).toHaveLength(1)
    expect(confs[0].registryRecordId).toBe("c-test-1")
  })

  it("a Marriage on a different date appends a new entry (remarriage is possible)", () => {
    const fams = clone()
    const { families: next } = linkSacramentToRegistry(fams, "p1", {
      type: "Marriage",
      date: "2026-02-14",
      registryRecordId: "m-test-2",
    })
    const juan = next[0].members.find((m) => m.id === "p1")!
    const marriages = juan.sacraments.filter((s) => s.type === "Marriage")
    expect(marriages).toHaveLength(2)
    expect(marriages.find((s) => s.date === "2026-02-14")!.registryRecordId).toBe("m-test-2")
    expect(marriages.find((s) => s.date === "2005-12-10")!.registryRecordId).toBeUndefined()
  })

  it("appends a new entry when the member has no history of that sacrament", () => {
    const fams = clone()
    const { families: next, changed } = linkSacramentToRegistry(fams, "p1", {
      type: "Death",
      date: "2026-07-01",
      bookPage: "2/10",
      registryRecordId: "d-test-1",
    })
    expect(changed).toBe(true)
    const juan = next[0].members.find((m) => m.id === "p1")!
    const death = juan.sacraments.find((s) => s.type === "Death")!
    expect(death.registryRecordId).toBe("d-test-1")
    expect(death.bookPage).toBe("2/10")
  })

  it("no-ops (same reference, changed=false) for unknown members and already-linked entries", () => {
    const fams = clone()
    const miss = linkSacramentToRegistry(fams, "nobody", {
      type: "Baptism",
      date: "2000-01-01",
      registryRecordId: "b-test-1",
    })
    expect(miss.changed).toBe(false)
    expect(miss.families).toBe(fams)

    // Link once, then re-linking the identical record is a no-op.
    const once = linkSacramentToRegistry(fams, "p1", {
      type: "Baptism",
      date: "1979-06-10",
      registryRecordId: "b-test-2",
    })
    expect(once.changed).toBe(true)
    const twice = linkSacramentToRegistry(once.families, "p1", {
      type: "Baptism",
      date: "1979-06-10",
      registryRecordId: "b-test-2",
    })
    expect(twice.changed).toBe(false)
    expect(twice.families).toBe(once.families)
  })

  it("edit-resave of a linked record updates in place — NEVER a duplicate (same date)", () => {
    const fams = clone()
    // Legacy member: approximate Confirmation date 1995-04-20; registry says the 21st.
    const first = linkSacramentToRegistry(fams, "p1", {
      type: "Confirmation",
      date: "1995-04-21",
      registryRecordId: "c-edit-1",
    })
    expect(first.changed).toBe(true)
    // Edit-resave with the SAME registry data (the no-op edit) — the entry is
    // matched by registryRecordId, its date converges to the registry's, and
    // there is still exactly ONE Confirmation entry.
    const resave = linkSacramentToRegistry(first.families, "p1", {
      type: "Confirmation",
      date: "1995-04-21",
      registryRecordId: "c-edit-1",
    })
    const juan = resave.families[0].members.find((m) => m.id === "p1")!
    const confs = juan.sacraments.filter((s) => s.type === "Confirmation")
    expect(confs).toHaveLength(1)
    expect(confs[0].registryRecordId).toBe("c-edit-1")
    expect(confs[0].date).toBe("1995-04-21")
    // Once converged, further resaves are true no-ops.
    const third = linkSacramentToRegistry(resave.families, "p1", {
      type: "Confirmation",
      date: "1995-04-21",
      registryRecordId: "c-edit-1",
    })
    expect(third.changed).toBe(false)
    expect(third.families).toBe(resave.families)
  })

  it("edit-resave with a CORRECTED date moves the linked entry — NEVER a duplicate", () => {
    const fams = clone()
    // Link the marriage record to p1's existing Marriage entry (exact type+date).
    const first = linkSacramentToRegistry(fams, "p1", {
      type: "Marriage",
      date: "2005-12-10",
      registryRecordId: "m-corr-1",
    })
    expect(first.changed).toBe(true)
    // Operator corrects the wedding date on the registry record and resaves.
    const resave = linkSacramentToRegistry(first.families, "p1", {
      type: "Marriage",
      date: "2005-12-11",
      registryRecordId: "m-corr-1",
    })
    expect(resave.changed).toBe(true)
    const juan = resave.families[0].members.find((m) => m.id === "p1")!
    const marriages = juan.sacraments.filter((s) => s.type === "Marriage")
    expect(marriages).toHaveLength(1) // the audit's duplicate-Marriage bug
    expect(marriages[0].date).toBe("2005-12-11")
    expect(marriages[0].registryRecordId).toBe("m-corr-1")
  })

  it("never writes into a soft-deleted family", () => {
    const fams = clone()
    fams[0] = { ...fams[0], isDeleted: true }
    const { changed } = linkSacramentToRegistry(fams, "p1", {
      type: "Baptism",
      date: "1979-06-10",
      registryRecordId: "b-test-3",
    })
    expect(changed).toBe(false)
  })
})
