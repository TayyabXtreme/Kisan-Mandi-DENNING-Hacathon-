import { env } from "../_generated/server";

/** Admin sign-in emails from the ADMIN_EMAILS env var (comma-separated). */
export const adminEmails = () =>
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** True for a verified sign-in email listed in ADMIN_EMAILS. */
export const isAdminEmail = (email: string | undefined, verified: boolean | undefined) =>
  !!email && !!verified && adminEmails().includes(email.toLowerCase());
