"use client";

import { useRef, useState } from "react";
import { CheckSquare, Square, Plus, Trash2, Paperclip, LinkIcon, ExternalLink, Upload, FileText, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { ChecklistItem, Attachment } from "@/lib/types";
import { uploadTaskFile, signedUrl, deleteTaskFile, isFileAttachment } from "@/lib/storage";
import { cn } from "@/lib/utils";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function TaskExtras({ taskId }: { taskId: string }) {
  const { tasks, updateTask } = useStore();
  const task = tasks.find((t) => t.id === taskId);

  const [newItem, setNewItem] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!task) return null;
  const checklist = task.checklist ?? [];
  const attachments = task.attachments ?? [];
  const doneCount = checklist.filter((i) => i.done).length;

  const setChecklist = (items: ChecklistItem[]) => updateTask(taskId, { checklist: items });
  const setAttachments = (items: Attachment[]) => updateTask(taskId, { attachments: items });

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setChecklist([...checklist, { id: uid(), text, done: false }]);
    setNewItem("");
  };

  const addLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    setAttachments([...attachments, { id: uid(), name: linkName.trim() || normalized, url: normalized }]);
    setLinkName("");
    setLinkUrl("");
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    const added: Attachment[] = [];
    for (const f of list) {
      const res = await uploadTaskFile(taskId, f);
      if (res) added.push({ id: uid(), name: res.name, url: res.path });
    }
    if (added.length) setAttachments([...(task.attachments ?? []), ...added]);
    setUploading(false);
  };

  const openAttachment = async (a: Attachment) => {
    if (isFileAttachment(a.url)) {
      const u = await signedUrl(a.url);
      if (u) window.open(u, "_blank");
    } else {
      window.open(a.url, "_blank");
    }
  };

  const removeAttachment = (a: Attachment) => {
    setAttachments(attachments.filter((x) => x.id !== a.id));
    if (isFileAttachment(a.url)) deleteTaskFile(a.url);
  };

  return (
    <div className="space-y-5">
      {/* Checklist */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="label mb-0 flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" /> Чек-лист
          </span>
          {checklist.length > 0 && (
            <span className="text-xs text-muted">
              {doneCount}/{checklist.length}
            </span>
          )}
        </div>

        {checklist.length > 0 && (
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${(doneCount / checklist.length) * 100}%` }}
            />
          </div>
        )}

        <div className="space-y-1">
          {checklist.map((item) => (
            <div key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2/50">
              <button
                onClick={() =>
                  setChecklist(checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
                }
                className="shrink-0 text-muted transition hover:text-emerald-500"
              >
                {item.done ? (
                  <CheckSquare className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <input
                defaultValue={item.text}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== item.text)
                    setChecklist(checklist.map((i) => (i.id === item.id ? { ...i, text: v } : i)));
                  else if (!v) e.target.value = item.text;
                }}
                className={cn(
                  "flex-1 border-0 bg-transparent text-sm outline-none",
                  item.done && "text-muted line-through"
                )}
              />
              <button
                onClick={() => setChecklist(checklist.filter((i) => i.id !== item.id))}
                className="shrink-0 rounded p-1 text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-1.5 flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
            placeholder="Добавить пункт…"
            className="input py-1.5 text-sm"
          />
          <button onClick={addItem} className="btn-outline px-3" disabled={!newItem.trim()}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Attachments */}
      <div>
        <span className="label flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" /> Файлы и ссылки
        </span>
        <div className="space-y-1.5">
          {attachments.map((a) => {
            const isFile = isFileAttachment(a.url);
            return (
              <div key={a.id} className="group flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                {isFile ? <FileText className="h-4 w-4 shrink-0 text-muted" /> : <LinkIcon className="h-4 w-4 shrink-0 text-muted" />}
                <button
                  onClick={() => openAttachment(a)}
                  className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-sm text-brand hover:underline"
                >
                  <span className="truncate">{a.name}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </button>
                <button
                  onClick={() => removeAttachment(a)}
                  className="shrink-0 rounded p-1 text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Зона загрузки: перетащи файл или кликни */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            uploadFiles(e.dataTransfer.files);
          }}
          className={cn(
            "mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition",
            dragOver ? "border-brand bg-brand/5 text-brand" : "border-border text-muted hover:border-brand hover:text-brand",
          )}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Загрузка…" : "Перетащи файл или нажми, чтобы прикрепить"}
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Ссылка */}
        <div className="mt-2 flex flex-wrap gap-2 sm:flex-nowrap">
          <input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Название"
            className="input w-full py-1.5 text-sm sm:w-40"
          />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
            placeholder="https://ссылка…"
            className="input py-1.5 text-sm"
          />
          <button onClick={addLink} className="btn-outline px-3" disabled={!linkUrl.trim()}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
