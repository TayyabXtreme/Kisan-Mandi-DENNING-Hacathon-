import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

/**
 * Validates react-hook-form values with a zod schema. Replaces
 * @hookform/resolvers, whose optional peers conflict with this project's zod 4.
 *
 * useForm({ resolver: zodResolver(schema), defaultValues: { ... } })
 */
export function zodResolver<T extends FieldValues>(
  schema: z.ZodType<T>,
): Resolver<T> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      // Nest errors by path, e.g. ["address", "city"] -> errors.address.city.
      let target = errors;
      const path = issue.path.map(String);
      path.slice(0, -1).forEach((key) => {
        target[key] ??= {};
        target = target[key] as Record<string, unknown>;
      });
      const leaf = path.at(-1) ?? "root";
      target[leaf] ??= { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<T> };
  };
}
