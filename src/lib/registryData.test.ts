import { describe, it, expect } from "vitest"
import {
  baptismRecords,
  marriageRecords,
  confirmationRecords,
  deathRecords,
  certificateTemplates,
  certificateTokensByType,
  COPY_WATERMARK_HTML,
  replaceTokens,
  addAnnotation,
  buildAutoAnnotation,
  liveOnly,
  softDelete,
  findBaptismCandidates,
  isBaptismRecord,
  isMarriageRecord,
  isConfirmationRecord,
  isDeathRecord,
  type BaptismRecord,
  type MarriageRecord,
  type ConfirmationRecord,
  type DeathRecord,
} from "./registryData"
import { mergeFamilies, mergeParishioners, families, type Family, type Parishioner } from "./directoryData"

const baptism = (): BaptismRecord => ({ ...baptismRecords[0] })
const marriage = (): MarriageRecord => ({ ...marriageRecords[0] })
const confirmation = (): ConfirmationRecord => ({ ...confirmationRecords[0] })
const death = (): DeathRecord => ({ ...deathRecords[0] })

describe("annotations", () => {
  it("buildAutoAnnotation produces canonical marriage wording", () => {
    const ann = buildAutoAnnotation("marriage", {
      spouse: "Maria Elena Lim",
      date: "2024-06-15",
      parish: "St. Michael the Archangel Parish",
      registryNumber: "2024-0101",
      by: "Secretary",
    })
    expect(ann.text).toBe("Married Maria Elena Lim on June 15, 2024 at St. Michael the Archangel Parish (Reg. 2024-0101)")
    expect(ann.type).toBe("marriage")
    expect(ann.date).toBe("2024-06-15")
    expect(ann.by).toBe("Secretary")
    expect(ann.id).toBeTruthy()
  })

  it("buildAutoAnnotation degrades gracefully when fields are missing", () => {
    const ann = buildAutoAnnotation("marriage", { date: "2024-06-15", by: "x" })
    expect(ann.text).toBe("Married on June 15, 2024")
    expect(ann.text).not.toContain("undefined")
    const note = buildAutoAnnotation("note", { by: "x" })
    expect(note.text).toBe("")
    expect(note.date).toBeTruthy() // defaults to today
  })

  it("buildAutoAnnotation covers confirmation, death, and correction wording", () => {
    expect(
      buildAutoAnnotation("confirmation", { date: "2024-04-28", parish: "St. Michael", bishop: "Bishop Lavarias", by: "x" }).text,
    ).toBe("Confirmed on April 28, 2024 at St. Michael by Bishop Lavarias")
    expect(
      buildAutoAnnotation("death", { date: "2024-03-10", cemetery: "San Lorenzo Cemetery", registryNumber: "2024-0301", by: "x" }).text,
    ).toBe("Died on March 10, 2024; buried at San Lorenzo Cemetery (Reg. 2024-0301)")
    expect(
      buildAutoAnnotation("correction", { field: "childFirstName", oldValue: "Marai", newValue: "Maria", by: "x" }).text,
    ).toBe('Correction: childFirstName changed from "Marai" to "Maria"')
  })

  it("addAnnotation appends without mutating and works on legacy records with no annotations array", () => {
    const rec = baptism()
    expect(rec.annotations).toBeUndefined() // legacy shape
    const ann = buildAutoAnnotation("note", { text: "hello", by: "x" })
    const next = addAnnotation(rec, ann)
    expect(next.annotations).toHaveLength(1)
    expect(next.annotations![0].text).toBe("hello")
    expect(rec.annotations).toBeUndefined() // original untouched
    const third = addAnnotation(next, buildAutoAnnotation("note", { text: "again", by: "x" }))
    expect(third.annotations).toHaveLength(2)
  })
})

describe("soft delete", () => {
  it("softDelete returns a flagged copy; liveOnly filters it out", () => {
    const rec = marriage()
    const gone = softDelete(rec, "Fr. Reyes")
    expect(gone.isDeleted).toBe(true)
    expect(gone.deletedBy).toBe("Fr. Reyes")
    expect(gone.deletedAt).toBeTruthy()
    expect(rec.isDeleted).toBeUndefined() // original untouched
    const list = [rec, gone]
    expect(liveOnly(list)).toEqual([rec])
  })

  it("legacy records without the flag are live", () => {
    // Every seed record predates soft delete — all must pass liveOnly.
    expect(liveOnly(baptismRecords)).toHaveLength(baptismRecords.length)
    expect(liveOnly(deathRecords)).toHaveLength(deathRecords.length)
  })
})

describe("findBaptismCandidates", () => {
  it("matches by name case-insensitively", () => {
    const hits = findBaptismCandidates("maria clara", "SANTOS", undefined, baptismRecords)
    expect(hits.map((r) => r.id)).toContain("b1")
  })

  it("partial first name still matches; dob narrows to the exact record", () => {
    const loose = findBaptismCandidates("Maria", "Santos", undefined, baptismRecords)
    expect(loose.map((r) => r.id)).toContain("b1")
    const exact = findBaptismCandidates("Maria", "Santos", "2024-01-15", baptismRecords)
    expect(exact).toHaveLength(1)
    expect(exact[0].id).toBe("b1")
  })

  it("excludes soft-deleted records and requires a last name", () => {
    const records = baptismRecords.map((r) => (r.id === "b1" ? softDelete(r, "x") : r))
    const hits = findBaptismCandidates("Maria Clara", "Santos", undefined, records)
    expect(hits.map((r) => r.id)).not.toContain("b1")
    expect(findBaptismCandidates("Maria", "", undefined, baptismRecords)).toEqual([])
  })
})

describe("certificate templates & tokens", () => {
  it("ships a default template for each of the four sacraments", () => {
    for (const s of ["baptism", "marriage", "confirmation", "death"] as const) {
      const defaults = certificateTemplates.filter((t) => t.sacrament === s && t.isDefault)
      expect(defaults, s).toHaveLength(1)
    }
  })

  it("every token listed for a sacrament is resolved by replaceTokens on its record", () => {
    const recordFor = { baptism: baptism(), marriage: marriage(), confirmation: confirmation(), death: death() }
    for (const [sacrament, tokens] of Object.entries(certificateTokensByType)) {
      const template = tokens.map((t) => t.token).join(" | ")
      const out = replaceTokens(template, recordFor[sacrament as keyof typeof recordFor])
      expect(out, sacrament).not.toMatch(/\{\{.*\}\}/)
    }
  })

  it("marriage tokens render the record values", () => {
    const rec = marriage()
    const out = replaceTokens("{{groom_name}} + {{bride_name}} on {{marriage_date}}, w: {{witness1}}, {{witness2}}", rec)
    expect(out).toBe("Carlo Lim Garcia + Maria Elena Santos Lim on June 15, 2024, w: Jose Santos, Ana Marie Reyes")
  })

  it("HTML-escapes injected markup in names (script injection stays inert)", () => {
    const rec = { ...marriage(), groomFirstName: '<script>alert("x")</script>', witness1Name: '<img src=x onerror=alert(1)>' }
    const out = replaceTokens("{{groom_name}} / {{witness1}}", rec)
    expect(out).not.toContain("<script>")
    expect(out).not.toContain("<img")
    expect(out).toContain("&lt;script&gt;")
    const deathRec = { ...death(), cemetery: '"><b>bold</b>' }
    expect(replaceTokens("{{cemetery}}", deathRec)).toBe("&quot;&gt;&lt;b&gt;bold&lt;/b&gt;")
  })

  it("names containing $-replacement patterns ($', $&, $`) print literally", () => {
    // The audit's proven corruption: escaping ' manufactures &#39;, whose $'
    // (and any literal $&/$`) was then interpreted as a String.replace
    // replacement pattern — "Ju$'an" printed as "Ju{{child_name}}#39;an".
    const rec = { ...baptism(), childFirstName: "Ju$'an", childMiddleName: "$&", childLastName: "O$`Brien" }
    const out = replaceTokens("{{child_name}}", rec)
    expect(out).toBe("Ju$&#39;an $&amp; O$`Brien") // escaped, but $-sequences literal
    expect(out).not.toContain("{{") // no re-spliced template text (the "Ju{{child_name}}#39;an" shape)

    // Same guarantee on a non-name field of another record type.
    const wed = { ...marriage(), witness1Name: "P100 $& $' $` fee" }
    expect(replaceTokens("w: {{witness1}}", wed)).toBe("w: P100 $&amp; $&#39; $` fee")
  })

  it("copy watermark token renders only when opts.isCopy", () => {
    const rec = confirmation()
    const plain = replaceTokens("A{{copy_watermark}}B", rec)
    expect(plain).toBe("AB")
    const copy = replaceTokens("A{{copy_watermark}}B", rec, { isCopy: true })
    expect(copy).toContain("COPY")
    expect(copy).toContain(COPY_WATERMARK_HTML)
  })

  it("parish identity tokens come from the configured parish, never hardcodes", () => {
    localStorage.setItem(
      "churchos_parish_config",
      JSON.stringify({
        parishName: "Holy Cross Parish",
        parishPriest: "Fr. Juan Tester",
        addressStreet: "1 Test St",
        addressBarangay: "Poblacion",
        addressCity: "Angeles",
        addressProvince: "Pampanga",
      }),
    )
    try {
      const out = replaceTokens("{{parish_name}} | {{parish_address}} | {{priest_name}}", baptism())
      expect(out).toContain("Holy Cross Parish")
      expect(out).toContain("Fr. Juan Tester")
      expect(out).toContain("1 Test St, Barangay Poblacion, Angeles, Pampanga")
      expect(out).not.toContain("St. Michael the Archangel Parish")
    } finally {
      localStorage.removeItem("churchos_parish_config")
    }
  })

  it("baptism replaceTokens keeps its original behavior (backward compat)", () => {
    const out = replaceTokens("{{child_name}}, {{godfather}}, Book {{book_number}}", baptism())
    expect(out).toBe("Maria Clara Reyes Santos, Pedro Lim, Book 1")
  })

  it("type guards discriminate the four record shapes", () => {
    expect(isBaptismRecord(baptism())).toBe(true)
    expect(isMarriageRecord(baptism())).toBe(false)
    expect(isMarriageRecord(marriage())).toBe(true)
    expect(isConfirmationRecord(confirmation())).toBe(true)
    expect(isDeathRecord(death())).toBe(true)
  })
})

describe("directory merges", () => {
  const person = (over: Partial<Parishioner>): Parishioner => ({
    id: "px",
    firstName: "Juan",
    middleName: "R",
    lastName: "Dela Cruz",
    dateOfBirth: "1979-05-15",
    gender: "Male",
    relationship: "Head",
    sacraments: [],
    ...over,
  })

  it("mergeParishioners unions sacrament histories and emits a link rewrite", () => {
    const keep = person({
      id: "p-keep",
      sacraments: [{ type: "Baptism", date: "1979-06-10", parish: "St. Michael" }],
    })
    const absorb = person({
      id: "p-dupe",
      middleName: "Reyes",
      sacraments: [
        { type: "Baptism", date: "1979-06-10", bookPage: "1/23", registryRecordId: "b99" }, // same event, extra refs
        { type: "Confirmation", date: "1995-04-20", parish: "St. Michael" }, // new event
      ],
    })
    const { merged, rewrites } = mergeParishioners(keep, absorb)
    expect(merged.id).toBe("p-keep")
    expect(merged.middleName).toBe("R") // keep wins on conflicts
    expect(merged.sacraments).toHaveLength(2)
    const bap = merged.sacraments.find((s) => s.type === "Baptism")!
    expect(bap.parish).toBe("St. Michael") // kept
    expect(bap.bookPage).toBe("1/23") // gap filled from absorbed
    expect(bap.registryRecordId).toBe("b99")
    expect(rewrites).toEqual([{ fromParishionerId: "p-dupe", toParishionerId: "p-keep" }])
    expect(keep.sacraments).toHaveLength(1) // inputs not mutated
  })

  it("mergeFamilies unions members, merges same-person duplicates, and unions tags", () => {
    const keep: Family = {
      ...families[0],
      tags: ["choir"],
      members: [person({ id: "p1", firstName: "Juan", lastName: "Dela Cruz", dateOfBirth: "1979-05-15" })],
    }
    const absorb: Family = {
      ...families[0],
      id: "f-dupe",
      tags: ["choir", "catechism"],
      email: "delacruz@email.com",
      members: [
        // same person under a different id → must be merged + rewritten
        person({ id: "p1-dupe", firstName: "juan", lastName: "DELA CRUZ", dateOfBirth: "1979-05-15", sacraments: [{ type: "Marriage", date: "2005-12-10", registryRecordId: "m9" }] }),
        // genuinely new member → appended
        person({ id: "p-new", firstName: "Lola", lastName: "Dela Cruz", dateOfBirth: "1950-01-01" }),
      ],
    }
    const { merged, rewrites } = mergeFamilies(keep, absorb)
    expect(merged.id).toBe(keep.id)
    expect(merged.members.map((m) => m.id).sort()).toEqual(["p1", "p-new"].sort())
    const juan = merged.members.find((m) => m.id === "p1")!
    expect(juan.sacraments.some((s) => s.registryRecordId === "m9")).toBe(true)
    expect(rewrites).toEqual([{ fromParishionerId: "p1-dupe", toParishionerId: "p1" }])
    expect(merged.tags!.sort()).toEqual(["catechism", "choir"])
    expect(merged.email).toBe(keep.email || "delacruz@email.com") // keep wins, absorb fills gaps
  })

  it("legacy families (no tags, no soft-delete fields) merge cleanly", () => {
    const { merged, rewrites } = mergeFamilies(families[0], families[1])
    expect(merged.members.length).toBe(families[0].members.length + families[1].members.length)
    expect(rewrites).toEqual([])
    expect(liveOnly([merged])).toHaveLength(1) // absent isDeleted = live
  })
})
