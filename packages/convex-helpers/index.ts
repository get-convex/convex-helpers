/**
 * asyncMap returns the results of applying an async function over an list.
 *
 * The list can even be a promise, or an iterable like a Set.
 * @param list - Iterable object of items, e.g. an Array, Set, Object.keys
 * @param asyncTransform
 * @returns
 */
export async function asyncMap<FromType, ToType>(
  list: Iterable<FromType> | Promise<Iterable<FromType>>,
  asyncTransform: (item: FromType, index: number) => Promise<ToType>,
): Promise<ToType[]> {
  const promises: Promise<ToType>[] = [];
  let index = 0;
  list = await list;
  for (const item of list) {
    promises.push(asyncTransform(item, index));
    index += 1;
  }
  return Promise.all(promises);
}

/**
 * Filters out null elements from an array.
 * @param list List of elements that might be null.
 * @returns List of elements with nulls removed.
 */
export function pruneNull<T>(list: (T | null)[]): T[] {
  return list.filter((i) => i !== null) as T[];
}

export class NullDocumentError extends Error {}

/**
 * Throws if there is a null element in the array.
 * @param list List of elements that might have a null element.
 * @returns Same list of elements with a refined type.
 */
export function nullThrows<T>(doc: T | null, message?: string): T {
  if (doc === null) {
    throw new NullDocumentError(message ?? "Unexpected null document.");
  }
  return doc;
}

/**
 * pick helps you pick keys from an object more concisely.
 *
 * e.g. `pick({a: v.string(), b: v.number()}, ["a"])` is equivalent to
 * `{a: v.string()}`
 * The alternative could be something like:
 * ```js
 * const obj = { a: v.string(), b: v.number() };
 * // pick does the following
 * const { a } = obj;
 * const onlyA = { a };
 * ```
 *
 * @param obj The object to pick from. Often like { a: v.string() }
 * @param keys The keys to pick from the object.
 * @returns A new object with only the keys you picked and their values.
 */
export function pick<T extends Record<string, any>, Keys extends (keyof T)[]>(
  obj: T,
  keys: Keys,
) {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => keys.includes(k as Keys[number])),
  ) as {
    [K in Keys[number]]: T[K];
  };
}

/**
 * omit helps you omit keys from an object more concisely.
 *
 * e.g. `omit({a: v.string(), b: v.number()}, ["a"])` is equivalent to
 * `{b: v.number()}`
 *
 * The alternative could be something like:
 * ```js
 * const obj = { a: v.string(), b: v.number() };
 * // omit does the following
 * const { a, ...rest } = obj;
 * const withoutA = rest;
 * ```
 *
 * @param obj The object to return a copy of without the specified keys.
 * @param keys The keys to omit from the object.
 * @returns A new object with the keys you omitted removed.
 */
export function omit<T extends Record<string, any>, Keys extends (keyof T)[]>(
  obj: T,
  keys: Keys,
) {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keys.includes(k as Keys[number])),
  ) as BetterOmit<T, Keys[number]>;
}

// Type utils:
const error = Symbol();
export type ErrorMessage<Reason extends string> = Reason & {
  __error: typeof error;
};

// Copied from convex/server since it wasn't exported
export type EmptyObject = Record<string, never>;
/**
 * An `Omit<>` type that:
 * 1. Applies to each element of a union.
 * 2. Preserves the index signature of the underlying type.
 */
export type BetterOmit<T, K extends keyof T> = {
  [Property in keyof T as Property extends K ? never : Property]: T[Property];
};

/**
 * Hack! This type causes TypeScript to simplify how it renders object types.
 *
 * It is functionally the identity for object types, but in practice it can
 * simplify expressions like `A & B`.
 */
export type Expand<ObjectType extends Record<any, any>> =
  ObjectType extends Record<any, any>
    ? {
        [Key in keyof ObjectType]: ObjectType[Key];
      }
    : never;

/**
 * TESTS
 */
/**
 * Tests if two types are exactly the same.
 * Taken from https://github.com/Microsoft/TypeScript/issues/27024#issuecomment-421529650
 * (Apache Version 2.0, January 2004)
 */
export type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/**
 * A utility for both compile-time type assertions and runtime assertions.
 *
 * @example
 * ```ts
 * // Compile-time assertion
 * assert<Equals<1, 1>>();
 * ```
 * @param arg A value to assert the truthiness of.
 */
export function assert<T extends true>(arg?: T) {
  // no need to do anything! we're just asserting at compile time that the type
  // parameter is true.
  if (arg !== undefined && !arg) throw new Error(`Assertion failed: ${arg}`);
}
