import type { ZodType, z } from "zod";
import { Errors } from "./errors";

/** Validate untrusted input. Error messages never echo the submitted values. */
export function parse<S extends ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (issue.code === "unrecognized_keys") fields[key === "_" ? "_" : key] = "Unexpected field.";
    else fields[key] ??= issue.message.slice(0, 120);
  }
  throw Errors.validation(fields);
}
