import { ConvexError } from "convex/values";

export type ApiErrorData = { code: string; status: number; message: string };

/** Throws an error the REST layer turns into `{ error: { code, message } }`. */
export function apiError(code: string, status: number, message = code): never {
  throw new ConvexError<ApiErrorData>({ code, status, message });
}

export function isApiErrorData(data: unknown): data is ApiErrorData {
  return (
    !!data &&
    typeof data === "object" &&
    "code" in data &&
    "status" in data &&
    typeof (data as ApiErrorData).code === "string" &&
    typeof (data as ApiErrorData).status === "number"
  );
}
