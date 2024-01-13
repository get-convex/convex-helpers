import {
  DocumentByName,
  GenericDataModel,
  TableNamesInDataModel,
  WithoutSystemFields,
} from "convex/server";

type Rule<Ctx, D> = (ctx: Ctx, doc: D) => Promise<boolean>;

export type Rules<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: {
    read?: Rule<Ctx, DocumentByName<DataModel, T>>;
    modify?: Rule<Ctx, DocumentByName<DataModel, T>>;
    insert?: Rule<Ctx, WithoutSystemFields<DocumentByName<DataModel, T>>>;
  };
};
