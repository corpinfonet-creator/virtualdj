import { ZodError } from "zod";

export function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "VALIDATION_ERROR", issues: error.issues }, { status: 400 });
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message === "UNAUTHORIZED" || message === "INVALID_SESSION" || message === "INVALID_ROLE") {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (message.includes("DATABASE_URL") || message.includes("connect") || message.includes("ECONNREFUSED")) {
    return Response.json({ error: "DATABASE_UNAVAILABLE", message: "PostgreSQL no está disponible." }, { status: 503 });
  }
  console.error(error);
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
