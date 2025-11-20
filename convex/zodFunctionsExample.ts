import { zCustomQuery } from "convex-helpers/server/zod4";
import { query } from "./_generated/server";
import { NoOp } from "convex-helpers/server/customFunctions";
import { z } from "zod/v4";

export const zQuery = zCustomQuery(query, NoOp);

export const noArgs = zQuery({
  args: {},
  handler: async (_ctx) => {
    return "Hello world!";
  },
});

const stringToDate = z.codec(z.iso.datetime(), z.date(), {
  decode: (isoString) => new Date(isoString),
  encode: (date) => date.toISOString(),
});
const dateToString = z.codec(z.date(), z.iso.datetime(), {
  decode: (date) => date.toISOString(),
  encode: (isoString) => new Date(isoString),
});

export const withArgs = zQuery({
  args: {
    date: stringToDate,
  },
  returns: {
    oneDayAfter: dateToString,
  },
  handler: async (_ctx, args) => {
    return {
      oneDayAfter: new Date(args.date.getTime() + 24 * 60 * 60 * 1000),
    };
  },
});
