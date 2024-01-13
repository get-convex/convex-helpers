import {
  DocumentByName,
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDocument,
  TableNamesInDataModel,
  WithoutSystemFields,
} from "convex/server";
import {
  ReadCallbacks,
  WrapReader,
  ReadWriteCallbacks,
  WrapWriter,
} from "./wrapDatabase";

type ReadArgs<Ctx, Doc extends GenericDocument> = {
  ctx: Ctx;
  operation: "read";
  doc: Doc;
  update: undefined;
};

type ReadWriteArgs<Ctx, Doc extends GenericDocument> =
  | ReadArgs<Ctx, Doc>
  | {
      ctx: Ctx;
      operation: "create";
      doc: WithoutSystemFields<Doc>;
      update: undefined;
    }
  | {
      ctx: Ctx;
      operation: "update";
      doc: Doc;
      update: Partial<Doc>;
    }
  | {
      ctx: Ctx;
      operation: "delete";
      doc: Doc;
      update: undefined;
    };
// type ReadRules<Ctx, D> = (ctx: Ctx, doc: D) => Promise<boolean>;

export type ReadRules<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: (
    args: ReadArgs<Ctx, DocumentByName<DataModel, T>>
  ) => boolean | Promise<boolean>;
};
export type ReadWriteRules<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: (
    args: ReadWriteArgs<Ctx, DocumentByName<DataModel, T>>
  ) => boolean | Promise<boolean>;
};
// export type Rules<Ctx, Doc extends GenericDocument> = (args: {
//   ctx: Ctx;
//   operation: "read";
//   doc: Doc;
// }) => TransformedDoc<Doc>;
type WriteArgs<Ctx, Doc extends GenericDocument> =
  | ((args: {
      ctx: Ctx;
      operation: "create";
      doc: WithoutSystemFields<Doc>;
    }) => void | Doc | Promise<void> | Promise<Doc>)
  | ((args: {
      ctx: Ctx;
      operation: "update";
      doc: Doc;
      update: Partial<Doc>;
    }) => void | Promise<void>)
  | ((args: {
      ctx: Ctx;
      operation: "delete";
      doc: Doc;
    }) => void | Promise<void>);
/**
 * Wraps the
 */

export function rlsDatabaseReader<Ctx, DataModel extends GenericDataModel>(
  ctx: Ctx,
  db: GenericDatabaseReader<DataModel>,
  callbacks: ReadCallbacks<Ctx, DataModel>
): GenericDatabaseReader<DataModel> {
  return new WrapReader(ctx, db, callbacks);
}

export function rlsDatabaseWriter<Ctx, DataModel extends GenericDataModel>(
  ctx: Ctx,
  db: GenericDatabaseWriter<DataModel>,
  callbacks: ReadWriteCallbacks<Ctx, DataModel>
): GenericDatabaseWriter<DataModel> {
  return new WrapWriter(ctx, db, callbacks);
}
