import { api } from "./_generated/api";
import { ConvexTestingHelper } from "convex-helpers/testing";

describe("testingExample", () => {
  let t: ConvexTestingHelper;

  beforeEach(() => {
    t = new ConvexTestingHelper();
  });

  afterEach(async () => {
    await t.mutation(api.testingFunctions.clearAll, {});
    await t.close();
  });

  test("can only read own notes", async () => {
    const personASessionId = "Person A";
    await t.mutation(api.rowLevelSecurityExample.addNote, {
      sessionId: personASessionId,
      note: "Hello from Person A"
    });

    await t.mutation(api.rowLevelSecurityExample.addNote, {
      sessionId: personASessionId,
      note: "Hello again from Person A"
    });

    const personBSessionId = "Person B";
    await t.mutation(api.rowLevelSecurityExample.addNote, {
      sessionId: personBSessionId,
      note: "Hello from Person B"
    });

    const notes = await t.query(api.rowLevelSecurityExample.listNotes, {
      sessionId: personASessionId
    });
    expect(notes.length).toEqual(2);
  });

  test("cannot delete someone else's note", async () => {
    const personASessionId = "Person A";
    await t.mutation(api.rowLevelSecurityExample.addNote, {
      sessionId: personASessionId,
      note: "Hello from Person A"
    });

    const personBSessionId = "Person B";
    await t.mutation(api.rowLevelSecurityExample.addNote, {
      sessionId: personBSessionId,
      note: "Hello from Person B"
    });

    const personANotes = await t.query(api.rowLevelSecurityExample.listNotes, {
      sessionId: personASessionId
    });
    expect(personANotes.length).toEqual(1);
    const personANote = personANotes[0]._id;
    expect(t.mutation(api.rowLevelSecurityExample.deleteNote, {
      note: personANote,
      sessionId: personBSessionId
    })).rejects.toThrow(/no read access/)
  });
});
