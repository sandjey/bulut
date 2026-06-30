import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";

// ─── GET /api/boards ──────────────────────────────────────────────────────────
// Returns all boards with column definitions and task count per column.

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;

  const [{ data: boards, error: bErr }, { data: tasks, error: tErr }] = await Promise.all([
    db.from("boards").select("*").order("position", { ascending: true }),
    db.from("tasks").select("board_id,column_id,status"),
  ]);

  if (bErr) return err(bErr.message, 500);
  if (tErr) return err(tErr.message, 500);

  const data = (boards ?? []).map((b: Record<string, unknown>) => {
    const bt = (tasks ?? []).filter((t) => t.board_id === b.id);
    const columns = ((b.columns ?? []) as { id: string; name: string }[]).map((col) => {
      const ct = bt.filter((t) => t.column_id === col.id);
      return {
        id:     col.id,
        name:   col.name,
        total:  ct.length,
        active: ct.filter((t) => t.status !== "done").length,
        done:   ct.filter((t) => t.status === "done").length,
      };
    });

    return {
      id:        b.id,
      name:      b.name,
      color:     b.color,
      createdAt: b.created_at,
      columns,
      taskCount: bt.length,
    };
  });

  return ok({ data, total: data.length });
}
