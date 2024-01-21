/**
 * asyncMap returns the results of applying an async function over an list.
 *
 * @param list - Iterable object of items, e.g. an Array, Set, Object.keys
 * @param asyncTransform
 * @returns
 */
export async function asyncMap<FromType, ToType>(
  list: Iterable<FromType>,
  asyncTransform: (item: FromType, index: number) => Promise<ToType>
): Promise<ToType[]> {
  const promises: Promise<ToType>[] = [];
  let index = 0;
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
