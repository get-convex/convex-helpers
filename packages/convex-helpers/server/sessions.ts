/**
 * Allows you to persist state server-side, associated with a sessionId stored
 * on the client (in localStorage, e.g.). You wrap your mutation / query with
 * withSession or withOptionalSession and it passes in "session" in the "ctx"
 * (first parameter) argument to your function.
 *
 * There are two base wrappers:
 * - withSession
 * - withOptionalSession -- allows the sessionId to be null or a non-existent document and passes `session: null` if so
 * And two composed wrappers:
 * - mutationWithSession -- this defaults to requiring the sessionId
 * - queryWithSession -- this defaults to allowing a null sessionId
 */
import {
  DocumentByName,
  GenericDataModel,
  GenericMutationCtx,
  MutationBuilder,
  RegisteredMutation,
  TableNamesInDataModel,
  mutationGeneric,
} from "convex/server";
import { GenericId, v } from "convex/values";

export function makeSessionValidator<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>
>(
  sessionTable: TableName,
  create?: (
    ctx: GenericMutationCtx<DataModel>
  ) => Promise<GenericId<TableName>>,
  validate?: (
    ctx: GenericMutationCtx<DataModel>,
    session: DocumentByName<DataModel, TableName>
  ) => boolean | Promise<boolean>
): RegisteredMutation<
  "public",
  { sessionId: string | null },
  Promise<GenericId<TableName>>
> {
  type SessionId = GenericId<TableName>;

  return (mutationGeneric as MutationBuilder<DataModel, "public">)({
    args: { sessionId: v.union(v.null(), v.string()) },
    handler: async (ctx, args): Promise<SessionId> => {
      if (args.sessionId) {
        const sessionId = ctx.db.normalizeId(sessionTable, args.sessionId);
        if (sessionId) {
          const session = await ctx.db.get(sessionId);
          if (!session) {
            console.debug({
              sessionError: "Session has disappeared",
              sessionId,
            });
          } else if (validate && !(await validate(ctx, session))) {
            console.debug({ sessionError: "Session invalid", sessionId });
          } else {
            return sessionId;
          }
        }
      }
      return create ? create(ctx) : ctx.db.insert(sessionTable, {} as any);
    },
  });
}
