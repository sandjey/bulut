import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";

// ─── DELETE /api/journal/:id ── удалить запись журнала (мягко) ─────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const hard = req.nextUrl.searchParams.get("hard") === "true";
  const q = hard
    ? auth.db.from("journal").delete().eq("id", params.id)
    : auth.db.from("journal").update({ deleted_at: new Date().toISOString() }).eq("id", params.id);
  const { error } = await q;
  if (error) return err(error.message, 500);
  return ok({ id: params.id, deleted: true });
}
