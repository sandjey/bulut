import { NextRequest } from "next/server";
import { authenticate, err, ok } from "@/lib/api-auth";

type Column = { id: string; name: string; wip?: number };

function uuid() {
  return crypto.randomUUID();
}

function boardResponse(b: Record<string, unknown>, tasks: { column_id: string; status: string }[]) {
  const columns = ((b.columns ?? []) as Column[]).map((col) => {
    const ct = tasks.filter((t) => t.column_id === col.id);
    return {
      id: col.id,
      name: col.name,
      wip: col.wip ?? 0,
      total: ct.length,
      active: ct.filter((t) => t.status !== "done").length,
      done: ct.filter((t) => t.status === "done").length,
    };
  });
  return {
    id: b.id,
    name: b.name,
    color: b.color,
    position: b.position ?? 0,
    columns,
    customFields: b.custom_fields ?? [],
    taskCount: tasks.length,
    createdAt: b.created_at,
    deletedAt: b.deleted_at ?? null,
  };
}

// ─── GET /api/boards/:id ── одна доска с колонками и счётчиками ────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;

  const { data: board, error } = await db.from("boards").select("*").eq("id", params.id).single();
  if (error || !board) return err("Board not found", 404);

  const { data: tasks } = await db
    .from("tasks")
    .select("column_id,status")
    .eq("board_id", params.id)
    .is("deleted_at", null);

  return ok({ data: boardResponse(board, (tasks ?? []) as { column_id: string; status: string }[]) });
}

// ─── PATCH /api/boards/:id ── переименовать, перекрасить, изменить колонки ─────
// Body (любое подмножество):
//   name, color, position,
//   columns:      string[]  → колонки создаются заново
//                 | { id?, name, wip? }[] → id сохраняются (задачи не «повиснут»)
//   customFields: { id?, name }[]
//   restore:      true → вернуть доску и её задачи из Корзины
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Некорректный JSON");
  }

  const { data: board, error: bErr } = await db
    .from("boards")
    .select("id,columns")
    .eq("id", params.id)
    .single();
  if (bErr || !board) return err("Board not found", 404);

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 200);
  if (body.color !== undefined) patch.color = String(body.color);
  if (body.position !== undefined && Number.isFinite(Number(body.position)))
    patch.position = Number(body.position);
  if (body.restore === true) patch.deleted_at = null;

  // ── Колонки ────────────────────────────────────────────────────────────────
  if (Array.isArray(body.columns)) {
    const old = (board.columns ?? []) as Column[];
    const next: Column[] = (body.columns as unknown[]).map((raw) => {
      if (typeof raw === "string") {
        // строка = имя. Сохраняем id уже существующей колонки с таким именем.
        const same = old.find((c) => c.name === raw);
        return { id: same?.id ?? uuid(), name: raw };
      }
      const o = (raw ?? {}) as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      const id = o.id ? String(o.id) : (old.find((c) => c.name === name)?.id ?? uuid());
      const col: Column = { id, name };
      if (o.wip !== undefined && Number.isFinite(Number(o.wip))) col.wip = Number(o.wip);
      return col;
    }).filter((c) => c.name);

    if (next.length === 0) return err("'columns' не может быть пустым");

    // Осиротевшие задачи: колонка удалена, а карточки в ней остались.
    const keep = new Set(next.map((c) => c.id));
    const { data: orphanRows } = await db
      .from("tasks")
      .select("id,column_id")
      .eq("board_id", params.id)
      .is("deleted_at", null);
    const orphans = (orphanRows ?? []).filter((t) => !keep.has(t.column_id as string));
    if (orphans.length && body.moveOrphansTo === undefined) {
      return err(
        `Колонки удалены, но в них ${orphans.length} задач. Передайте "moveOrphansTo":"<columnId>" ` +
          `или сначала перенесите задачи (PATCH /api/tasks/:id { "columnId": … }).`,
        409,
      );
    }
    if (orphans.length) {
      const target = String(body.moveOrphansTo);
      if (!keep.has(target)) return err(`'moveOrphansTo' — колонки '${target}' нет в новом наборе`, 400);
      const { error: mErr } = await db
        .from("tasks")
        .update({ column_id: target })
        .in("id", orphans.map((t) => t.id as string));
      if (mErr) return err(mErr.message, 500);
    }

    patch.columns = next;
  }

  if (Array.isArray(body.customFields)) {
    patch.custom_fields = (body.customFields as Record<string, unknown>[])
      .map((f) => ({ id: f.id ? String(f.id) : uuid(), name: String(f.name ?? "").trim() }))
      .filter((f) => f.name);
  }

  if (Object.keys(patch).length === 0) return err("Нет полей для изменения");

  const { data, error } = await db.from("boards").update(patch).eq("id", params.id).select().single();
  if (error || !data) return err(error?.message ?? "Board not found", error ? 500 : 404);

  // восстановление из Корзины поднимает и задачи доски
  if (body.restore === true) {
    await db.from("tasks").update({ deleted_at: null }).eq("board_id", params.id);
  }

  const { data: tasks } = await db
    .from("tasks")
    .select("column_id,status")
    .eq("board_id", params.id)
    .is("deleted_at", null);

  return ok({ data: boardResponse(data, (tasks ?? []) as { column_id: string; status: string }[]) });
}

// ─── DELETE /api/boards/:id ───────────────────────────────────────────────────
// По умолчанию — в Корзину вместе с задачами (обратимо). ?hard=true — навсегда
// (задачи и комментарии уходят каскадом).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticate(req);
  if (!auth.ok) return err(auth.error, auth.status);
  const { db } = auth;
  const hard = req.nextUrl.searchParams.get("hard") === "true";

  if (hard) {
    const { error } = await db.from("boards").delete().eq("id", params.id);
    if (error) return err(error.message, 500);
    return ok({ deleted: true, id: params.id, hard: true });
  }

  const at = new Date().toISOString();
  const { error } = await db.from("boards").update({ deleted_at: at }).eq("id", params.id);
  if (error) return err(error.message, 500);
  const { error: tErr } = await db
    .from("tasks")
    .update({ deleted_at: at })
    .eq("board_id", params.id)
    .is("deleted_at", null);
  if (tErr) return err(tErr.message, 500);

  return ok({ deleted: true, id: params.id, hard: false, restore: `PATCH /api/boards/${params.id} { "restore": true }` });
}
