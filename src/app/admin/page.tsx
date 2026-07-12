"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  UserCog,
  Search,
  Loader2,
  Lock,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Check,
  Trash2,
  Boxes,
  LayoutDashboard,
  BookOpenText,
  FileBarChart,
  Users,
  Waypoints,
  Settings as SettingsIcon,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import {
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
  type PermissionKey,
  type AppRole,
} from "@/lib/permissions";
import { Avatar } from "@/components/Avatar";
import { RoleBadge } from "@/components/RoleBadge";
import type { WorkspaceMember } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const GROUP_ICONS: Record<string, typeof ShieldCheck> = {
  LayoutDashboard,
  BookOpenText,
  FileBarChart,
  Users,
  Waypoints,
  ShieldCheck,
  Settings: SettingsIcon,
};

export default function AdminPage() {
  const { active, myRole, members, updateMember, removeMember, refreshRoom } = useWorkspace();
  const { user } = useAuth();
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwnerActor = myRole === "owner";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    refreshRoom();
  }, [refreshRoom]);

  const sorted = useMemo(() => {
    const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    const q = query.trim().toLowerCase();
    return [...members]
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name, "ru"));
  }, [members, query]);

  const selected = useMemo(() => members.find((m) => m.id === selectedId) ?? null, [members, selectedId]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">Только для владельца и админов комнаты</h1>
        <p className="max-w-sm text-sm text-muted">Управлять участниками может владелец или администратор комнаты.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Список участников комнаты */}
      <div className={cn("flex w-full flex-col border-r border-border sm:w-[340px] sm:shrink-0", selected && "hidden sm:flex")}>
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-500">
              <UserCog className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight">Администрирование</h1>
              <p className="truncate text-xs text-muted">Участники комнаты «{active.name}»</p>
            </div>
          </div>
          <Link
            href="/admin/room"
            className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-sm font-medium transition hover:bg-surface-2"
          >
            <Boxes className="h-4 w-4 text-brand" /> Настройки комнаты
            <ChevronRight className="ml-auto h-4 w-4 text-muted" />
          </Link>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-9"
              placeholder="Поиск по имени или почте"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="board-scroll flex-1 space-y-1 overflow-y-auto p-2">
          {sorted.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                m.id === selectedId ? "bg-surface-2 shadow-soft" : "hover:bg-surface-2/60",
              )}
            >
              <Avatar name={m.name} size={36} src={m.avatar} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{m.name}</span>
                  {m.userId === user?.id && <span className="text-[10px] text-faint">(вы)</span>}
                </span>
                <span className="block truncate text-xs text-muted">{m.email}</span>
              </span>
              <RoleBadge role={m.role} />
            </button>
          ))}
          {sorted.length === 0 && <p className="px-3 py-6 text-center text-sm text-faint">Никого не найдено</p>}
        </div>
      </div>

      {/* Редактор участника */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto", !selected && "hidden sm:block")}>
        {selected ? (
          <MemberEditor
            key={selected.id}
            member={selected}
            isOwnerActor={isOwnerActor}
            isSelf={selected.userId === user?.id}
            onUpdate={updateMember}
            onRemove={async (id) => {
              await removeMember(id);
              setSelectedId(null);
            }}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="hidden h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted sm:flex">
            <UserCog className="h-10 w-10 text-faint" />
            <p className="text-sm">Выберите участника, чтобы настроить роль и права</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberEditor({
  member,
  isOwnerActor,
  isSelf,
  onUpdate,
  onRemove,
  onBack,
}: {
  member: WorkspaceMember;
  isOwnerActor: boolean;
  isSelf: boolean;
  onUpdate: (id: string, patch: { role?: AppRole; permissions?: PermissionKey[] }) => Promise<void>;
  onRemove: (id: string) => void;
  onBack: () => void;
}) {
  const isOwnerMember = member.role === "owner";
  const canChangeRole = isOwnerActor && !isOwnerMember && !isSelf;
  const canRemove = !isOwnerMember && !isSelf;

  const [draft, setDraft] = useState<Set<PermissionKey>>(new Set(member.permissions));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(new Set(member.permissions.length ? member.permissions : DEFAULT_MEMBER_PERMISSIONS));
  }, [member.id, member.permissions]);

  const dirty = useMemo(() => {
    const cur = new Set(member.permissions.length ? member.permissions : DEFAULT_MEMBER_PERMISSIONS);
    if (cur.size !== draft.size) return true;
    for (const k of draft) if (!cur.has(k)) return true;
    return false;
  }, [draft, member.permissions]);

  const toggle = (k: PermissionKey) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const savePerms = async () => {
    setBusy(true);
    await onUpdate(member.id, { permissions: [...draft] });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const changeRole = async (role: AppRole) => {
    setBusy(true);
    await onUpdate(member.id, {
      role,
      permissions: role === "admin" ? [] : member.permissions.length ? member.permissions : DEFAULT_MEMBER_PERMISSIONS,
    });
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-muted transition hover:text-fg sm:hidden">
        <ChevronLeft className="h-4 w-4" /> К списку
      </button>

      {/* Шапка участника */}
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.name} size={48} src={member.avatar} />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold">{member.name}{isSelf && <span className="ml-1 text-xs font-normal text-faint">(вы)</span>}</div>
          <div className="truncate text-sm text-muted">{member.email}</div>
        </div>
        <RoleBadge role={member.role} />
      </div>

      {/* Роль */}
      <div className="mt-5">
        <label className="label">Роль в комнате</label>
        {isOwnerMember ? (
          <p className="text-sm text-muted">Владелец комнаты — роль изменить нельзя.</p>
        ) : canChangeRole ? (
          <div className="flex gap-2">
            <button
              onClick={() => changeRole("member")}
              disabled={busy}
              className={cn("btn flex-1 justify-center", member.role === "member" ? "btn-primary" : "btn-outline")}
            >
              Участник
            </button>
            <button
              onClick={() => changeRole("admin")}
              disabled={busy}
              className={cn("btn flex-1 justify-center", member.role === "admin" ? "btn-primary" : "btn-outline")}
            >
              <ShieldCheck className="h-4 w-4" /> Администратор
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {isSelf ? "Свою роль изменить нельзя." : "Роль назначает владелец комнаты."}
          </p>
        )}
      </div>

      {/* Права (только для участника; админ и владелец имеют все права) */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <label className="label mb-0">Права доступа</label>
          {member.role !== "member" && <span className="text-xs text-muted">полный доступ</span>}
        </div>

        {member.role !== "member" ? (
          <p className="mt-2 text-sm text-muted">
            {member.role === "owner" ? "Владелец" : "Администратор"} имеет полный доступ ко всем разделам комнаты.
          </p>
        ) : (
          <>
            <div className="mt-2 space-y-3">
              {PERMISSION_GROUPS.map((g) => {
                const Icon = GROUP_ICONS[g.icon] ?? ShieldCheck;
                return (
                  <div key={g.title} className="rounded-xl border border-border p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Icon className="h-4 w-4" style={{ color: g.color }} /> {g.title}
                    </div>
                    <div className="space-y-1">
                      {g.permissions.map((p) => (
                        <label
                          key={p.key}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-2/50"
                        >
                          <input
                            type="checkbox"
                            checked={draft.has(p.key)}
                            onChange={() => toggle(p.key)}
                            className="mt-0.5 h-4 w-4 accent-[color:rgb(var(--brand))]"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm">{p.label}</span>
                            <span className="block text-xs text-muted">{p.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="btn-primary" onClick={savePerms} disabled={busy || !dirty}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Сохранить права
              </button>
              {saved && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Сохранено</span>}
              <button
                type="button"
                className="btn-ghost ml-auto text-xs"
                onClick={() => setDraft(new Set(ALL_PERMISSIONS))}
              >
                Отметить все
              </button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setDraft(new Set(DEFAULT_MEMBER_PERMISSIONS))}>
                Сбросить
              </button>
            </div>
          </>
        )}
      </div>

      {/* Убрать из комнаты */}
      {canRemove && (
        <div className="mt-6 border-t border-border pt-4">
          <button
            className="btn-ghost text-red-500 hover:bg-red-500/10"
            onClick={() => confirm(`Убрать ${member.name} из комнаты? Доступ к её данным пропадёт.`) && onRemove(member.id)}
          >
            <Trash2 className="h-4 w-4" /> Убрать из комнаты
          </button>
        </div>
      )}
    </div>
  );
}
