import {
  GenericActionCtx,
  GenericDataModel,
  TableNamesInDataModel,
  DocumentByName,
  GenericQueryCtx,
  GenericMutationCtx,
} from "convex/server";

const DEFAULT = Symbol("default");

export type CallbackArgs<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> =
  | {
      op: "read";
      doc: DocumentByName<DataModel, TableName>;
      update: undefined;
      ctx: GenericQueryCtx<DataModel>;
    }
  | {
      op: "create";
      doc: DocumentByName<DataModel, TableName>;
      update: undefined;
      ctx: GenericMutationCtx<DataModel>;
    }
  | {
      op: "delete";
      doc: DocumentByName<DataModel, TableName>;
      update: undefined;
      ctx: GenericMutationCtx<DataModel>;
    }
  | {
      op: "update";
      doc: DocumentByName<DataModel, TableName>;
      update: Partial<DocumentByName<DataModel, TableName>>;
      ctx: GenericMutationCtx<DataModel>;
    };

export function wrapDB<
  DataModel extends GenericDataModel,
  Ctx extends GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
>(
  ctx: Ctx,
  _callbacks: {
    [T in TableNamesInDataModel<DataModel>]?: (
      args: CallbackArgs<DataModel, T>,
    ) => Promise<boolean | void> | boolean | void;
  } & {
    [DEFAULT]?: <TableName extends TableNamesInDataModel<DataModel>>(
      table: TableName,
      args: CallbackArgs<DataModel, TableName>,
    ) => Promise<boolean | void> | boolean | void;
  },
) {
  return ctx;
}
