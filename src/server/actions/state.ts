export type ActionState = { ok: boolean; message: string; id?: string };

export const initialActionState: ActionState = { ok: true, message: "" };

export function rethrowRedirect(error: unknown): void {
  if (typeof error === "object" && error !== null && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
    throw error;
  }
}
