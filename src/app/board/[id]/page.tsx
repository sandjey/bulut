"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { Plus, Download, ArrowLeft, Pencil, Check, Columns3, List as ListIcon, CalendarDays, GanttChartSquare, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useCan } from "@/lib/access";
import { BoardColumn } from "@/components/BoardColumn";
import { BoardListView } from "@/components/board/BoardListView";
import { BoardCalendarView } from "@/components/board/BoardCalendarView";
import { BoardTimelineView } from "@/components/board/BoardTimelineView";
import { TaskModal } from "@/components/TaskModal";
import { FilterBar } from "@/components/FilterBar";
import { ExportModal } from "@/components/ExportModal";
import { BoardSettingsDialog } from "@/components/BoardSettingsDialog";
import { rulesPatchFor } from "@/lib/board-rules";
import { Settings as SettingsIcon } from "lucide-react";
import { RequirePerm } from "@/components/RequirePerm";
import { Task, BOARD_COLORS } from "@/lib/types";
import { applyFilters, DEFAULT_FILTERS, FilterState } from "@/lib/filters";

type GroupKey = "none" | "assignee" | "priority" | "epic" | "sprint";
const SWIM_SEP = "\u0001"; // разделитель дорожки и колонки в droppableId
const GROUP_LABELS: Record<GroupKey, string> = {
  none: "Без группировки",
  assignee: "По исполнителю",
  priority: "По приоритету",
  epic: "По эпику",
  sprint: "По спринту",
};

export default function BoardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
        </div>
      }
    >
      <RequirePerm perm="board.view" title="Нет доступа к доскам">
        <BoardPageInner />
      </RequirePerm>
    </Suspense>
  );
}

function BoardPageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardId = params.id as string;

  const { boards, tasks, moveTask, addColumn, updateBoard, createTask, updateTask } = useStore();
  const can = useCan();
  // Права по разрешениям
  const permManage = can("board.manage");
  const permCreate = can("card.create");
  const permMove = can("card.move");
  const permEdit = can("card.edit");
  const permStatus = can("card.status");
  const canExport = can("reports.export");
  // Режим редактирования (по умолчанию — просмотр). Права действуют только в нём.
  const [editMode, setEditMode] = useState(false);
  const canAnyEdit = permManage || permCreate || permMove || permEdit || permStatus;
  const canManage = permManage && editMode;
  const canCreate = permCreate && editMode;
  const canMove = permMove && editMode;
  const board = boards.find((b) => b.id === boardId);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultCol, setDefaultCol] = useState<string | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [view, setView] = useState<"board" | "list" | "calendar" | "timeline">("board");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");

  useEffect(() => {
    const v = localStorage.getItem("bulut.boardView");
    if (v === "list" || v === "calendar" || v === "board" || v === "timeline") setView(v);
    const g = localStorage.getItem("bulut.groupBy") as GroupKey | null;
    if (g && ["none", "assignee", "priority", "epic", "sprint"].includes(g)) setGroupBy(g);
    setEditMode(localStorage.getItem("bulut.boardEdit") === "1");
  }, []);
  const toggleEdit = () =>
    setEditMode((v) => {
      const n = !v;
      localStorage.setItem("bulut.boardEdit", n ? "1" : "0");
      return n;
    });
  const changeView = (v: "board" | "list" | "calendar" | "timeline") => {
    setView(v);
    localStorage.setItem("bulut.boardView", v);
  };
  const changeGroup = (g: GroupKey) => {
    setGroupBy(g);
    localStorage.setItem("bulut.groupBy", g);
  };

  const boardTasks = useMemo(
    () => tasks.filter((t) => t.boardId === boardId && !t.parentId), // подзадачи — внутри родителя
    [tasks, boardId]
  );

  const filtered = useMemo(() => applyFilters(boardTasks, filters), [boardTasks, filters]);

  // Дорожки (swimlanes): значение группы у задачи
  const groupField: Record<Exclude<GroupKey, "none">, keyof Task> = {
    assignee: "assignee",
    priority: "priority",
    epic: "epic",
    sprint: "sprint",
  };
  const groupValue = (t: Task): string =>
    groupBy === "none" ? "" : String((t as unknown as Record<string, unknown>)[groupField[groupBy]] ?? "");

  const lanes = useMemo(() => {
    if (groupBy === "none") return [] as { key: string; label: string }[];
    if (groupBy === "priority")
      return [
        { key: "high", label: "Высокий" },
        { key: "medium", label: "Средний" },
        { key: "low", label: "Низкий" },
      ];
    const field = groupField[groupBy];
    const vals = new Set(filtered.map((t) => String((t as unknown as Record<string, unknown>)[field] ?? "")));
    const arr = Array.from(vals).filter(Boolean).sort().map((v) => ({ key: v, label: v }));
    if (vals.has(""))
      arr.push({
        key: "",
        label: groupBy === "assignee" ? "Без исполнителя" : groupBy === "epic" ? "Без эпика" : "Без спринта",
      });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, groupBy]);

  // open a task from ?task= query (deep link from search)
  useEffect(() => {
    const taskId = searchParams.get("task");
    if (taskId) {
      const t = tasks.find((x) => x.id === taskId);
      if (t) {
        setEditingTask(t);
        setModalOpen(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, boards]);

  // Горячая клавиша: N — новая задача (когда не печатаешь в поле)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (board && canCreate) {
          e.preventDefault();
          setEditingTask(null);
          setDefaultCol(board.columns[0]?.id);
          setModalOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, canCreate]);

  if (!board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-semibold">Доска не найдена</p>
        <Link href="/" className="btn-primary">
          <ArrowLeft className="h-4 w-4" /> К доскам
        </Link>
      </div>
    );
  }

  const tasksByColumn = (columnId: string) => {
    const inCol = filtered.filter((t) => t.columnId === columnId);
    // Default ("created") keeps manual drag order; any explicit sort overrides it.
    return filters.sort === "created"
      ? inCol.sort((a, b) => a.order - b.order)
      : inCol;
  };

  const parseDrop = (id: string): [string | null, string] => {
    const i = id.indexOf(SWIM_SEP);
    return i >= 0 ? [id.slice(0, i), id.slice(i + 1)] : [null, id];
  };

  // при быстром добавлении в дорожке — сразу проставить значение группы
  const laneExtra = (
    key: string,
  ): { assignee?: string; priority?: "low" | "medium" | "high"; epic?: string; sprint?: string } => {
    if (groupBy === "assignee") return { assignee: key };
    if (groupBy === "priority") return { priority: key as "low" | "medium" | "high" };
    if (groupBy === "epic") return { epic: key };
    if (groupBy === "sprint") return { sprint: key };
    return {};
  };

  const onDragEnd = (result: DropResult) => {
    if (!canMove) return;
    const { destination, source, draggableId } = result;
    if (!destination) return;
    const [destLane, destCol] = parseDrop(destination.droppableId);
    const [srcLane] = parseDrop(source.droppableId);
    moveTask(draggableId, destCol, destination.index);
    if (groupBy !== "none" && destLane !== null && destLane !== srcLane) {
      updateTask(draggableId, { [groupField[groupBy]]: destLane } as Partial<Task>);
    }
    // Автоматизация: правила при перемещении в колонку
    const moving = tasks.find((t) => t.id === draggableId);
    if (moving && moving.columnId !== destCol) {
      const patch = rulesPatchFor(board.id, destCol);
      if (patch) updateTask(draggableId, patch);
    }
  };

  const openCreate = (columnId: string) => {
    setEditingTask(null);
    setDefaultCol(columnId);
    setModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingTask(null);
    // strip ?task= from url
    if (searchParams.get("task")) router.replace(`/board/${boardId}`);
  };

  const commitColumn = () => {
    if (newColName.trim()) addColumn(board.id, newColName.trim());
    setNewColName("");
    setAddingCol(false);
  };

  const commitName = () => {
    if (nameDraft.trim()) updateBoard(board.id, { name: nameDraft.trim() });
    setEditingName(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Board header */}
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg lg:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: board.color }} />
          {editingName && canManage ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="input py-1 text-lg font-bold"
              />
              <button onClick={commitName} className="btn-ghost p-1.5">
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : canManage ? (
            <button
              onClick={() => {
                setNameDraft(board.name);
                setEditingName(true);
              }}
              className="group flex items-center gap-2"
            >
              <h1 className="text-xl font-bold tracking-tight">{board.name}</h1>
              <Pencil className="h-4 w-4 text-muted opacity-0 transition group-hover:opacity-100" />
            </button>
          ) : (
            <h1 className="text-xl font-bold tracking-tight">{board.name}</h1>
          )}

          <span className="text-sm text-muted">
            {boardTasks.filter((t) => t.status === "done").length}/{boardTasks.length}
          </span>

          {/* color picker */}
          {canManage && (
            <div className="hidden items-center gap-1.5 sm:flex">
              {BOARD_COLORS.slice(0, 6).map((c) => (
                <button
                  key={c}
                  onClick={() => updateBoard(board.id, { color: c })}
                  className="h-4 w-4 rounded-full transition hover:scale-125"
                  style={{
                    backgroundColor: c,
                    outline: board.color === c ? `2px solid ${c}` : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Режим просмотра / редактирования — защита от случайных изменений */}
            {canAnyEdit && (
              <button
                onClick={toggleEdit}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition",
                  editMode
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:bg-surface-2 hover:text-fg",
                )}
                title={editMode ? "Редактирование включено — клик, чтобы вернуть просмотр" : "Только просмотр — клик, чтобы редактировать"}
              >
                {editMode ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="hidden sm:inline">{editMode ? "Редактирование" : "Просмотр"}</span>
              </button>
            )}
            {/* Переключатель вида — один компактный сегмент */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2/50 p-0.5">
              {([
                ["board", Columns3, "Доска"],
                ["list", ListIcon, "Список"],
                ["calendar", CalendarDays, "Календарь"],
                ["timeline", GanttChartSquare, "Таймлайн"],
              ] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  onClick={() => changeView(v)}
                  title={label}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition ${
                    view === v ? "bg-surface font-medium text-fg shadow-soft" : "text-muted hover:text-fg"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{label}</span>
                </button>
              ))}
            </div>
            {view === "board" && (
              <select
                value={groupBy}
                onChange={(e) => changeGroup(e.target.value as GroupKey)}
                className="input h-9 w-auto py-1 text-sm"
                title="Группировка (дорожки)"
              >
                {(Object.keys(GROUP_LABELS) as GroupKey[]).map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
            )}
            {canManage && (
              <button className="btn-outline" onClick={() => setSettingsOpen(true)} title="Настройки доски (поля, автоматизация)">
                <SettingsIcon className="h-4 w-4" />
              </button>
            )}
            {canExport && (
              <button className="btn-outline" onClick={() => setExportOpen(true)}>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Экспорт</span>
              </button>
            )}
            {canCreate && (
              <button className="btn-primary" onClick={() => openCreate(board.columns[0].id)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Задача</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          <FilterBar filters={filters} onChange={setFilters} tasks={boardTasks} boardId={board.id} />
        </div>
      </div>

      {/* Список / Календарь / Таймлайн */}
      {view === "list" && <BoardListView board={board} tasks={filtered} onOpen={openEdit} />}
      {view === "calendar" && <BoardCalendarView tasks={filtered} onOpen={openEdit} />}
      {view === "timeline" && <BoardTimelineView tasks={filtered} onOpen={openEdit} />}

      {/* Доска (канбан) */}
      {view === "board" && (
      <DragDropContext onDragEnd={onDragEnd}>
        {groupBy === "none" ? (
        <div className="board-scroll flex flex-1 gap-4 overflow-x-auto p-4 sm:p-6">
          {board.columns.map((col) => (
            <BoardColumn
              key={col.id}
              board={board}
              columnId={col.id}
              columnName={col.name}
              tasks={tasksByColumn(col.id)}
              editMode={editMode}
              onAddTask={openCreate}
              onQuickAdd={(colId, title) =>
                createTask({ boardId: board.id, columnId: colId, title })
              }
              onOpenTask={openEdit}
            />
          ))}

          {/* add column */}
          {canManage && (
          <div className="w-[300px] shrink-0">
            {addingCol ? (
              <div className="card p-2">
                <input
                  autoFocus
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onBlur={commitColumn}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitColumn();
                    if (e.key === "Escape") setAddingCol(false);
                  }}
                  placeholder="Название колонки"
                  className="input"
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingCol(true)}
                className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-border px-3 py-2.5 text-sm text-muted transition hover:border-brand hover:text-brand"
              >
                <Plus className="h-4 w-4" /> Добавить колонку
              </button>
            )}
          </div>
          )}
        </div>
        ) : (
        // ── Дорожки (swimlanes) ──
        <div className="board-scroll flex-1 overflow-auto p-4 sm:p-6">
          {lanes.length === 0 && <p className="py-16 text-center text-sm text-faint">Нет задач</p>}
          {lanes.map((lane) => {
            const count = filtered.filter((t) => groupValue(t) === lane.key).length;
            if (count === 0) return null;
            return (
              <div key={lane.key || "__none"} className="mb-5">
                <div className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
                  <span>{lane.label}</span>
                  <span className="text-xs font-normal text-muted">{count}</span>
                </div>
                <div className="board-scroll flex gap-4 overflow-x-auto pb-1">
                  {board.columns.map((col) => (
                    <BoardColumn
                      key={col.id}
                      board={board}
                      columnId={col.id}
                      columnName={col.name}
                      tasks={tasksByColumn(col.id).filter((t) => groupValue(t) === lane.key)}
                      droppableId={`${lane.key}${SWIM_SEP}${col.id}`}
                      compact
                      editMode={editMode}
                      onAddTask={openCreate}
                      onQuickAdd={(colId, title) =>
                        createTask({ boardId: board.id, columnId: colId, title, ...laneExtra(lane.key) })
                      }
                      onOpenTask={openEdit}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </DragDropContext>
      )}

      <TaskModal
        open={modalOpen}
        onClose={closeModal}
        board={board}
        task={editingTask}
        defaultColumnId={defaultCol}
        viewOnly={!editMode}
      />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} defaultBoardId={board.id} />
      <BoardSettingsDialog board={board} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
