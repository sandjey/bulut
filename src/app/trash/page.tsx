"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Trash2,
  RotateCcw,
  Database,
  Download,
  Upload,
  AlertTriangle,
  Loader2,
  Save,
  Lock,
  LayoutDashboard,
  ListTodo,
  BookOpenText,
  Waypoints,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useMaps } from "@/lib/maps";
import { useAccess } from "@/lib/access";
import { cn } from "@/lib/utils";

function whenText(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TrashPage() {
  const { isAdmin, loading } = useAccess();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">Раздел только для администраторов</h1>
        <p className="max-w-sm text-sm text-muted">
          Корзина и бэкапы доступны владельцу и администраторам проекта.
        </p>
      </div>
    );
  }
  return <TrashInner />;
}

function TrashInner() {
  const {
    trash,
    refreshTrash,
    restoreBoard,
    restoreTask,
    restoreJournal,
    purgeBoard,
    purgeTask,
    purgeJournal,
    emptyTrash,
    backups,
    refreshBackups,
    createBackup,
    deleteBackup,
    downloadBackup,
    restoreBackup,
  } = useStore();
  const { trashedMaps, refreshTrashedMaps, restoreMap, purgeMap } = useMaps();

  const [tab, setTab] = useState<"trash" | "backups">("trash");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    refreshTrash();
    refreshTrashedMaps();
    refreshBackups();
  }, [refreshTrash, refreshTrashedMaps, refreshBackups]);

  const trashCount =
    trash.boards.length + trash.tasks.length + trash.journal.length + trashedMaps.length;

  const doCreateBackup = async () => {
    setBusy(true);
    await createBackup(label);
    setLabel("");
    setBusy(false);
  };

  const doRestoreBackup = async (id: string, name: string) => {
    if (
      !confirm(
        `Восстановить всё из бэкапа «${name || "без названия"}»?\n\nДанные из снимка будут записаны обратно (существующие — обновлены, удалённые — воссозданы). Текущие данные не стираются.`,
      )
    )
      return;
    setBusy(true);
    try {
      await restoreBackup(id);
      alert("Восстановление завершено.");
    } catch (e) {
      alert("Не удалось восстановить: " + (e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-5 p-5 sm:p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Trash2 className="h-6 w-6 text-slate-500" /> Корзина и бэкапы
        </h1>
        <p className="mt-1 text-sm text-muted">
          Удалённое не пропадает сразу — оно хранится здесь и его можно восстановить. Бэкапы — снимки
          всех данных «на всякий случай».
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-2/60 p-1">
        <button
          onClick={() => setTab("trash")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
            tab === "trash" ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          Корзина {trashCount > 0 && <span className="ml-1 text-xs text-faint">({trashCount})</span>}
        </button>
        <button
          onClick={() => setTab("backups")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition",
            tab === "backups" ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          Бэкапы {backups.length > 0 && <span className="ml-1 text-xs text-faint">({backups.length})</span>}
        </button>
      </div>

      {tab === "trash" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
          {trashCount === 0 && (
            <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
              <Trash2 className="h-10 w-10 text-faint" />
              <p className="text-sm text-muted">Корзина пуста</p>
            </div>
          )}

          {trashCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (
                    confirm(
                      `Безвозвратно удалить всё из Корзины (${trashCount})?\n\nПеред очисткой автоматически создаётся бэкап. Карты нужно очищать отдельной кнопкой у карт.`,
                    )
                  )
                    emptyTrash();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Очистить корзину (доски/задачи/журнал)
              </button>
            </div>
          )}

          <TrashSection
            title="Доски"
            icon={LayoutDashboard}
            items={trash.boards.map((b) => ({ id: b.id, primary: b.name, secondary: whenText(b.deletedAt) }))}
            onRestore={restoreBoard}
            onPurge={(id, name) =>
              confirm(`Удалить доску «${name}» навсегда вместе с задачами?`) && purgeBoard(id)
            }
          />
          <TrashSection
            title="Задачи"
            icon={ListTodo}
            items={trash.tasks.map((t) => ({ id: t.id, primary: t.title, secondary: whenText(t.deletedAt) }))}
            onRestore={restoreTask}
            onPurge={(id, name) => confirm(`Удалить задачу «${name}» навсегда?`) && purgeTask(id)}
          />
          <TrashSection
            title="Карты"
            icon={Waypoints}
            items={trashedMaps.map((m) => ({ id: m.id, primary: m.name, secondary: whenText(m.deletedAt) }))}
            onRestore={restoreMap}
            onPurge={(id, name) => confirm(`Удалить карту «${name}» навсегда?`) && purgeMap(id)}
          />
          <TrashSection
            title="Журнал"
            icon={BookOpenText}
            items={trash.journal.map((j) => ({
              id: j.id,
              primary: j.taskTitle || j.stage || "Запись",
              secondary: `${j.boardName} · ${whenText(j.deletedAt)}`,
            }))}
            onRestore={restoreJournal}
            onPurge={(id, name) => confirm(`Удалить запись «${name}» навсегда?`) && purgeJournal(id)}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
          {/* Create backup */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-brand" /> Создать бэкап
            </div>
            <p className="mt-1 text-xs text-muted">
              Снимок всех досок, задач, журнала, карт, команды и профилей. Хранится в базе данных;
              можно скачать файлом.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Название (необязательно), напр. «Перед крупными правками»"
                className="flex-1 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={doCreateBackup}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Создать
              </button>
            </div>
          </div>

          {/* Backups list */}
          {backups.length === 0 ? (
            <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center">
              <Database className="h-10 w-10 text-faint" />
              <p className="text-sm text-muted">Бэкапов пока нет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{b.label || "Без названия"}</span>
                      {b.kind === "auto" && (
                        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          авто
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {whenText(b.createdAt)}
                      {b.authorName && ` · ${b.authorName}`}
                    </div>
                    <div className="mt-1 text-[11px] text-faint">
                      {["boards", "tasks", "journal", "project_maps", "members"]
                        .filter((k) => b.counts[k])
                        .map((k) => `${LABELS[k] ?? k}: ${b.counts[k]}`)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <IconBtn title="Скачать JSON" onClick={() => downloadBackup(b.id)}>
                      <Download className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      title="Восстановить из этого бэкапа"
                      onClick={() => doRestoreBackup(b.id, b.label)}
                    >
                      <Upload className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      title="Удалить бэкап"
                      danger
                      onClick={() => confirm("Удалить этот бэкап?") && deleteBackup(b.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LABELS: Record<string, string> = {
  boards: "доски",
  tasks: "задачи",
  journal: "журнал",
  project_maps: "карты",
  members: "команда",
};

function TrashSection({
  title,
  icon: Icon,
  items,
  onRestore,
  onPurge,
}: {
  title: string;
  icon: typeof Trash2;
  items: { id: string; primary: string; secondary: string }[];
  onRestore: (id: string) => void;
  onPurge: (id: string, name: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted" /> {title}
        <span className="text-xs font-normal text-faint">({items.length})</span>
      </div>
      <div className="space-y-1">
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-surface-2/50"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{it.primary}</div>
              <div className="truncate text-[11px] text-faint">Удалено: {it.secondary}</div>
            </div>
            <button
              onClick={() => onRestore(it.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Вернуть
            </button>
            <button
              onClick={() => onPurge(it.id, it.primary)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-red-500/10 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-lg p-2 text-muted transition",
        danger ? "hover:bg-red-500/10 hover:text-red-500" : "hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
