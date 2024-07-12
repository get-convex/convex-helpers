import {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  DocumentByInfo,
  DocumentByName,
  FunctionArgs,
  GenericDataModel,
  GenericTableInfo,
  GenericMutationCtx,
  NamedTableInfo,
  GenericQueryCtx,
  QueryInitializer,
  TableNamesInDataModel,
  WithoutSystemFields,
} from "convex/server";
import { GenericId } from "convex/values";
import { filter } from "./filter.js";

type Rule<Ctx, D> = (ctx: Ctx, doc: D) => Promise<boolean>;

export type Rules<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: {
    read?: Rule<Ctx, DocumentByName<DataModel, T>>;
    modify?: Rule<Ctx, DocumentByName<DataModel, T>>;
    insert?: Rule<Ctx, WithoutSystemFields<DocumentByName<DataModel, T>>>;
  };
};

/**
 * Apply row level security (RLS) to queries and mutations with the returned
 * middleware functions.
 * @deprecated Use `wrapDatabaseReader`/`Writer` with `customFunction` instead.
 *
 * Example:
 * ```
 * // Defined in a common file so it can be used by all queries and mutations.
 * import { Auth } from "convex/server";
 * import { DataModel } from "./_generated/dataModel";
 * import { DatabaseReader } from "./_generated/server";
 * import { RowLevelSecurity } from "./rowLevelSecurity";
 *
 * export const {withMutationRLS} = RowLevelSecurity<{auth: Auth, db: DatabaseReader}, DataModel>(
 *  {
 *    cookies: {
 *      read: async ({auth}, cookie) => !cookie.eaten,
 *      modify: async ({auth, db}, cookie) => {
 *        const user = await getUser(auth, db);
 *        return user.isParent;  // only parents can reach the cookies.
 *      },
 *  }
 * );
 * // Mutation with row level security enabled.
 * export const eatCookie = mutation(withMutationRLS(
 *  async ({db}, {cookieId}) => {
 *   // throws "does not exist" error if cookie is already eaten or doesn't exist.
 *   // throws "write access" error if authorized user is not a parent.
 *   await db.patch(cookieId, {eaten: true});
 * }));
 * ```
 *
 * Notes:
 * * Rules may read any row in `db` -- rules do not apply recursively within the
 *   rule functions themselves.
 * * Tables with no rule default to full access.
 * * Middleware functions like `withUser` can be composed with RowLevelSecurity
 *   to cache fetches in `ctx`. e.g.
 * ```
 * const {withQueryRLS} = RowLevelSecurity<{user: Doc<"users">}, DataModel>(
 *  {
 *    cookies: async ({user}, cookie) => user.isParent,
 *  }
 * );
 * export default query(withUser(withRLS(...)));
 * ```
 *
 * @param rules - rule for each table, determining whether a row is accessible.
 *  - "read" rule says whether a document should be visible.
 *  - "modify" rule says whether to throw an error on `replace`, `patch`, and `delete`.
 *  - "insert" rule says whether to throw an error on `insert`.
 *
 * @returns Functions `withQueryRLS` and `withMutationRLS` to be passed to
 * `query` or `mutation` respectively.
 *  For each row read, modified, or inserted, the security rules are applied.
 */
export const RowLevelSecurity = <RuleCtx, DataModel extends GenericDataModel>(
  rules: Rules<RuleCtx, DataModel>,
) => {
  const withMutationRLS = <
    Ctx extends GenericMutationCtx<DataModel>,
    Args extends ArgsArray,
    Output,
  >(
    f: Handler<Ctx, Args, Output>,
  ): Handler<Ctx, Args, Output> => {
    return ((ctx: any, ...args: any[]) => {
      const wrappedDb = new WrapWriter(ctx, ctx.db, rules);
      return (f as any)({ ...ctx, db: wrappedDb }, ...args);
    }) as Handler<Ctx, Args, Output>;
  };
  const withQueryRLS = <
    Ctx extends GenericQueryCtx<DataModel>,
    Args extends ArgsArray,
    Output,
  >(
    f: Handler<Ctx, Args, Output>,
  ): Handler<Ctx, Args, Output> => {
    return ((ctx: any, ...args: any[]) => {
      const wrappedDb = new WrapReader(ctx, ctx.db, rules);
      return (f as any)({ ...ctx, db: wrappedDb }, ...args);
    }) as Handler<Ctx, Args, Output>;
  };
  return {
    withMutationRLS,
    withQueryRLS,
  };
};

/**
 * If you just want to read from the DB, you can copy this.
 * Later, you can use `generateQueryWithMiddleware` along
 * with a custom function using wrapQueryDB with rules that
 * depend on values generated once at the start of the function.
 * E.g. Looking up a user to use for your rules:
 * //TODO: Add example
export function BasicRowLevelSecurity(
  rules: Rules<GenericQueryCtx<DataModel>, DataModel>
) {
  return {
    queryWithRLS: customQuery(
      query,
      customCtx((ctx) => ({ db: wrapDatabaseReader(ctx, ctx.db, rules) }))
    ),

    mutationWithRLS: customMutation(
      mutation,
      customCtx((ctx) => ({ db: wrapDatabaseWriter(ctx, ctx.db, rules) }))
    ),

    internalQueryWithRLS: customQuery(
      internalQuery,
      customCtx((ctx) => ({ db: wrapDatabaseReader(ctx, ctx.db, rules) }))
    ),

    internalMutationWithRLS: customMutation(
      internalMutation,
      customCtx((ctx) => ({ db: wrapDatabaseWriter(ctx, ctx.db, rules) }))
    ),
  };
}
 */

export function wrapDatabaseReader<Ctx, DataModel extends GenericDataModel>(
  ctx: Ctx,
  db: GenericDatabaseReader<DataModel>,
  rules: Rules<Ctx, DataModel>,
): GenericDatabaseReader<DataModel> {
  return new WrapReader(ctx, db, rules);
}

export function wrapDatabaseWriter<Ctx, DataModel extends GenericDataModel>(
  ctx: Ctx,
  db: GenericDatabaseWriter<DataModel>,
  rules: Rules<Ctx, DataModel>,
): GenericDatabaseWriter<DataModel> {
  return new WrapWriter(ctx, db, rules);
}

type ArgsArray = [] | [FunctionArgs<any>];
type Handler<Ctx, Args extends ArgsArray, Output> = (
  ctx: Ctx,
  ...args: Args
) => Output;

class WrapReader<Ctx, DataModel extends GenericDataModel>
  implements GenericDatabaseReader<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseReader<DataModel>;
  system: GenericDatabaseReader<DataModel>["system"];
  rules: Rules<Ctx, DataModel>;

  constructor(
    ctx: Ctx,
    db: GenericDatabaseReader<DataModel>,
    rules: Rules<Ctx, DataModel>,
  ) {
    this.ctx = ctx;
    this.db = db;
    this.system = db.system;
    this.rules = rules;
  }

  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string,
  ): GenericId<TableName> | null {
    return this.db.normalizeId(tableName, id);
  }

  tableName<TableName extends string>(
    id: GenericId<TableName>,
  ): TableName | null {
    for (const tableName of Object.keys(this.rules)) {
      if (this.db.normalizeId(tableName, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }

  async predicate<T extends GenericTableInfo>(
    tableName: string,
    doc: DocumentByInfo<T>,
  ): Promise<boolean> {
    if (!this.rules[tableName]?.read) {
      return true;
    }
    return await this.rules[tableName]!.read!(this.ctx, doc);
  }

  async get<TableName extends string>(
    id: GenericId<TableName>,
  ): Promise<DocumentByName<DataModel, TableName> | null> {
    const doc = await this.db.get(id);
    if (doc) {
      const tableName = this.tableName(id);
      if (tableName && !(await this.predicate(tableName, doc))) {
        return null;
      }
      return doc;
    }
    return null;
  }

  query<TableName extends string>(
    tableName: TableName,
  ): QueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return filter(this.db.query(tableName), (d) =>
      this.predicate(tableName, d),
    );
  }
}

class WrapWriter<Ctx, DataModel extends GenericDataModel>
  implements GenericDatabaseWriter<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseWriter<DataModel>;
  system: GenericDatabaseWriter<DataModel>["system"];
  reader: GenericDatabaseReader<DataModel>;
  rules: Rules<Ctx, DataModel>;

  async modifyPredicate<T extends GenericTableInfo>(
    tableName: string,
    doc: DocumentByInfo<T>,
  ): Promise<boolean> {
    if (!this.rules[tableName]?.modify) {
      return true;
    }
    return await this.rules[tableName]!.modify!(this.ctx, doc);
  }

  constructor(
    ctx: Ctx,
    db: GenericDatabaseWriter<DataModel>,
    rules: Rules<Ctx, DataModel>,
  ) {
    this.ctx = ctx;
    this.db = db;
    this.system = db.system;
    this.reader = new WrapReader(ctx, db, rules);
    this.rules = rules;
  }
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string,
  ): GenericId<TableName> | null {
    return this.db.normalizeId(tableName, id);
  }
  async insert<TableName extends string>(
    table: TableName,
    value: any,
  ): Promise<any> {
    const rules = this.rules[table];
    if (rules?.insert && !(await rules.insert(this.ctx, value))) {
      throw new Error("insert access not allowed");
    }
    return await this.db.insert(table, value);
  }
  tableName<TableName extends string>(
    id: GenericId<TableName>,
  ): TableName | null {
    for (const tableName of Object.keys(this.rules)) {
      if (this.db.normalizeId(tableName, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }
  async checkAuth<TableName extends string>(id: GenericId<TableName>) {
    // Note all writes already do a `db.get` internally, so this isn't
    // an extra read; it's just populating the cache earlier.
    // Since we call `this.get`, read access controls apply and this may return
    // null even if the document exists.
    const doc = await this.get(id);
    if (doc === null) {
      throw new Error("no read access or doc does not exist");
    }
    const tableName = this.tableName(id);
    if (tableName === null) {
      return;
    }
    if (!(await this.modifyPredicate(tableName, doc))) {
      throw new Error("write access not allowed");
    }
  }
  async patch<TableName extends string>(
    id: GenericId<TableName>,
    value: Partial<any>,
  ): Promise<void> {
    await this.checkAuth(id);
    return await this.db.patch(id, value);
  }
  async replace<TableName extends string>(
    id: GenericId<TableName>,
    value: any,
  ): Promise<void> {
    await this.checkAuth(id);
    return await this.db.replace(id, value);
  }
  async delete(id: GenericId<string>): Promise<void> {
    await this.checkAuth(id);
    return await this.db.delete(id);
  }
  get<TableName extends string>(id: GenericId<TableName>): Promise<any> {
    return this.reader.get(id);
  }
  query<TableName extends string>(tableName: TableName): QueryInitializer<any> {
    return this.reader.query(tableName);
  }
}
