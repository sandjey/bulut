"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { Plus, Download, ArrowLeft, Pencil, Check, Columns3, List as ListIcon, CalendarDays } from "lucide-react";
import { useStore } from "@/lib/store";
import { useCan } from "@/lib/access";
import { BoardColumn } from "@/components/BoardColumn";
import { BoardListView } from "@/components/board/BoardListView";
import { BoardCalendarView } from "@/components/board/BoardCalendarView";
import { TaskModal } from "@/components/TaskModal";
import { FilterBar } from "@/components/FilterBar";
import { ExportModal } from "@/components/ExportModal";
import { RequirePerm } from "@/components/RequirePerm";
import { Task, BOARD_COLORS } from "@/lib/types";
import { applyFilters, DEFAULT_FILTERS, FilterState } from "@/lib/filters";

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

  const { boards, tasks, moveTask, addColumn, updateBoard, createTask } = useStore();
  const can = useCan();
  const canManage = can("board.manage");
  const canCreate = can("card.create");
  const canMove = can("card.move");
  const canExport = can("reports.export");
  const board = boards.find((b) => b.id === boardId);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultCol, setDefaultCol] = useState<string | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [view, setView] = useState<"board" | "list" | "calendar">("board");

  useEffect(() => {
    const v = localStorage.getItem("bulut.boardView");
    if (v === "list" || v === "calendar" || v === "board") setView(v);
  }, []);
  const changeView = (v: "board" | "list" | "calendar") => {
    setView(v);
    localStorage.setItem("bulut.boardView", v);
  };

  const boardTasks = useMemo(
    () => tasks.filter((t) => t.boardId === boardId && !t.parentId), // подзадачи — внутри родителя
    [tasks, boardId]
  );

  const filtered = useMemo(() => applyFilters(boardTasks, filters), [boardTasks, filters]);

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

  const onDragEnd = (result: DropResult) => {
    if (!canMove) return;
    const { destination, draggableId } = result;
    if (!destination) return;
    moveTask(draggableId, destination.droppableId, destination.index);
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
            {/* Переключатель вида — один компактный сегмент */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2/50 p-0.5">
              {([
                ["board", Columns3, "Доска"],
                ["list", ListIcon, "Список"],
                ["calendar", CalendarDays, "Календарь"],
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

      {/* Список / Календарь */}
      {view === "list" && <BoardListView board={board} tasks={filtered} onOpen={openEdit} />}
      {view === "calendar" && <BoardCalendarView tasks={filtered} onOpen={openEdit} />}

      {/* Доска (канбан) */}
      {view === "board" && (
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="board-scroll flex flex-1 gap-4 overflow-x-auto p-4 sm:p-6">
          {board.columns.map((col) => (
            <BoardColumn
              key={col.id}
              board={board}
              columnId={col.id}
              columnName={col.name}
              tasks={tasksByColumn(col.id)}
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
      </DragDropContext>
      )}

      <TaskModal
        open={modalOpen}
        onClose={closeModal}
        board={board}
        task={editingTask}
        defaultColumnId={defaultCol}
      />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} defaultBoardId={board.id} />
    </div>
  );
}
