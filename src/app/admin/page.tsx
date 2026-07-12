"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  ShieldOff,
  Trash2,
  Crown,
  UserCog,
  Check,
  Loader2,
  Lock,
  AlertTriangle,
  Search,
  LayoutDashboard,
  BookOpenText,
  FileBarChart,
  Users,
  Waypoints,
  ChevronRight,
} from "lucide-react";
import { useAccess, type OrphanAccount } from "@/lib/access";
import {
  PERMISSION_GROUPS,
  ROLE_META,
  ALL_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
  canAssignAdmin,
  type PermissionKey,
  type Profile,
} from "@/lib/permissions";
import { MEMBER_ROLES } from "@/lib/types";
import { initials, cn } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";

const GROUP_ICONS: Record<string, typeof ShieldCheck> = {
  LayoutDashboard,
  BookOpenText,
  FileBarChart,
  Users,
  Waypoints,
  ShieldCheck,
};

export default function AdminPage() {
  const access = useAccess();
  const { can, loading, me, profiles, fetchOrphans, deleteAccount } = access;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [orphans, setOrphans] = useState<OrphanAccount[]>([]);

  const reloadOrphans = useCallback(() => {
    fetchOrphans().then((r) => setOrphans(r.orphans));
  }, [fetchOrphans]);

  useEffect(() => {
    reloadOrphans();
  }, [reloadOrphans, profiles.length]);

  const removeOrphan = async (id: string) => {
    if (!confirm("Удалить осиротевший аккаунт из Auth? Email освободится. Действие необратимо.")) return;
    const e = await deleteAccount(id);
    if (e) alert(e);
    else setOrphans((prev) => prev.filter((o) => o.id !== id));
  };

  const sorted = useMemo(() => {
    const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    return [...profiles]
      .filter((p) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.jobRole.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
  }, [profiles, query]);

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!can("admin.access")) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">Раздел только для администраторов</h1>
        <p className="max-w-sm text-sm text-muted">
          У вас нет доступа к администрированию. Обратитесь к владельцу проекта.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Список пользователей ── */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-border sm:w-[340px] sm:shrink-0",
          selected && "hidden sm:flex",
        )}
      >
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-500">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Администрирование</h1>
              <p className="text-xs text-muted">Права доступа пользователей</p>
            </div>
          </div>
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
          {sorted.map((p) => (
            <UserRow
              key={p.id}
              profile={p}
              isMe={p.id === me?.id}
              active={p.id === selectedId}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
          {sorted.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-faint">Никого не найдено</p>
          )}

          {/* Осиротевшие аккаунты (есть в Auth, нет в profiles) */}
          {orphans.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" /> Без профиля ({orphans.length})
              </div>
              <p className="px-2 pb-2 text-[11px] text-faint">
                Аккаунты входа без прав в проекте. Можно удалить, чтобы освободить email.
              </p>
              {orphans.map((o) => (
                <div
                  key={o.id}
                  className="group flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-surface-2/60"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-500/15 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {initials(o.email || "?")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{o.email || o.id}</span>
                  <button
                    onClick={() => removeOrphan(o.id)}
                    className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                    title="Удалить аккаунт из Auth"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Детали / конструктор прав ── */}
      <div className={cn("min-h-0 flex-1", !selected && "hidden sm:block")}>
        {selected ? (
          <UserEditor
            key={selected.id}
            profile={selected}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted">
            <UserCog className="h-10 w-10 opacity-30" />
            <p className="text-sm">Выберите пользователя, чтобы настроить права</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Profile["role"] }) {
  const meta = ROLE_META[role];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
    >
      {role === "owner" && <Crown className="h-3 w-3" />}
      {role === "admin" && <ShieldCheck className="h-3 w-3" />}
      {meta.label}
    </span>
  );
}

function UserRow({
  profile,
  isMe,
  active,
  onClick,
}: {
  profile: Profile;
  isMe: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const grantedCount =
    profile.role === "member" ? profile.permissions.length : ALL_PERMISSIONS.length;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
        active ? "bg-surface-2 shadow-soft" : "hover:bg-surface-2/60",
      )}
    >
      <Avatar name={profile.name || profile.email || "U"} size={36} src={profile.avatar} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">
            {profile.name || "Без имени"}
          </span>
          {isMe && <span className="text-[10px] text-faint">(вы)</span>}
        </span>
        <span className="block truncate text-xs text-muted">{profile.email}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <RoleBadge role={profile.role} />
        <span className="text-[10px] text-faint">
          {profile.role === "member" ? `${grantedCount} прав` : "все права"}
        </span>
      </span>
    </button>
  );
}

function UserEditor({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const access = useAccess();
  const { me, setPermissions, promoteToAdmin, demoteToMember, deleteAccount } = access;

  const editable = access.canManage(profile) && profile.role === "member";
  const canEditFields = access.canEditProfile(profile);
  const isSelf = profile.id === me?.id;
  const canAdminToggle = me ? canAssignAdmin(me.role) : false;

  const [nameDraft, setNameDraft] = useState(profile.name);
  const [roleDraft, setRoleDraft] = useState(profile.jobRole);
  const [draft, setDraft] = useState<Set<PermissionKey>>(new Set(profile.permissions));

  const saveName = () => {
    const v = nameDraft.trim();
    if (v !== profile.name) access.updateProfile(profile.id, { name: v });
  };
  const saveRole = () => {
    if (roleDraft.trim() !== profile.jobRole) access.updateProfile(profile.id, { jobRole: roleDraft.trim() });
  };
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dirty = useMemo(() => {
    const a = new Set(profile.permissions);
    if (a.size !== draft.size) return true;
    for (const k of draft) if (!a.has(k)) return true;
    return false;
  }, [draft, profile.permissions]);

  const toggle = (key: PermissionKey) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const flash = (setter: (v: string | null) => void, text: string) => {
    setter(text);
    setTimeout(() => setter(null), 2500);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    const e = await setPermissions(profile.id, Array.from(draft));
    setSaving(false);
    if (e) flash(setErr, e);
    else flash(setMsg, "Права сохранены");
  };

  const grantAll = () => setDraft(new Set(ALL_PERMISSIONS));
  const clearAll = () => setDraft(new Set());
  const resetDefault = () => setDraft(new Set(DEFAULT_MEMBER_PERMISSIONS));

  const doPromote = async () => {
    setBusy(true);
    const e = await promoteToAdmin(profile.id);
    setBusy(false);
    if (e) flash(setErr, e);
    else flash(setMsg, "Назначен администратором");
  };
  const doDemote = async () => {
    setBusy(true);
    const e = await demoteToMember(profile.id);
    setBusy(false);
    if (e) flash(setErr, e);
    else flash(setMsg, "Снят с администраторов");
  };
  const doRemove = async () => {
    if (
      !confirm(
        `Удалить аккаунт ${profile.name || profile.email}?\n\n` +
          `Удалится логин (email освободится) и профиль. Доски, задачи и карты, которые он создавал, ОСТАНУТСЯ в проекте (автор просто обнулится). Действие необратимо.`,
      )
    )
      return;
    setBusy(true);
    const e = await deleteAccount(profile.id);
    setBusy(false);
    if (e) flash(setErr, e);
    else onBack();
  };

  const grantedCount = profile.role === "member" ? draft.size : ALL_PERMISSIONS.length;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="border-b border-border p-4 sm:px-6">
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1 text-sm text-muted transition hover:text-fg sm:hidden"
        >
          <ChevronRight className="h-4 w-4 rotate-180" /> К списку
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={profile.name || profile.email || "U"} size={48} src={profile.avatar} />
          <div className="min-w-0 flex-1">
            {canEditFields ? (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    placeholder="Имя пользователя"
                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-bold outline-none transition hover:border-border focus:border-brand focus:bg-surface"
                  />
                  <RoleBadge role={profile.role} />
                </div>
                <input
                  value={roleDraft}
                  onChange={(e) => setRoleDraft(e.target.value)}
                  onBlur={saveRole}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  list="job-roles"
                  placeholder="Должность / направление"
                  className="w-full max-w-[240px] rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-sm text-muted outline-none transition hover:border-border focus:border-brand focus:bg-surface"
                />
                <datalist id="job-roles">
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                <p className="px-2 text-xs text-faint">{profile.email}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-bold">{profile.name || "Без имени"}</h2>
                  <RoleBadge role={profile.role} />
                </div>
                <p className="truncate text-sm text-muted">{profile.email}</p>
                {profile.jobRole && <p className="text-xs text-faint">{profile.jobRole}</p>}
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {canAdminToggle && !isSelf && profile.role === "member" && (
              <button className="btn-outline" onClick={doPromote} disabled={busy}>
                <ShieldCheck className="h-4 w-4" /> Сделать админом
              </button>
            )}
            {canAdminToggle && !isSelf && profile.role === "admin" && (
              <button className="btn-outline" onClick={doDemote} disabled={busy}>
                <ShieldOff className="h-4 w-4" /> Снять админа
              </button>
            )}
            {access.canManage(profile) && !isSelf && (
              <button
                className="btn-ghost text-red-500 hover:bg-red-500/10"
                onClick={doRemove}
                disabled={busy}
                title="Удалить из проекта"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* статусы */}
        {(msg || err) && (
          <div
            className={cn(
              "mt-3 rounded-lg px-3 py-2 text-sm",
              err ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            )}
          >
            {err || msg}
          </div>
        )}
      </div>

      {/* тело */}
      <div className="board-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {profile.role === "owner" && (
          <InfoCard
            icon={<Crown className="h-5 w-5" />}
            color="#f59e0b"
            title="Владелец проекта"
            text="У владельца есть все возможности. Его нельзя понизить или удалить."
          />
        )}
        {profile.role === "admin" && (
          <InfoCard
            icon={<ShieldCheck className="h-5 w-5" />}
            color="#8b5cf6"
            title="Администратор"
            text={
              canAdminToggle
                ? "У администратора есть все возможности. Управлять правами админов может только владелец."
                : "У администратора есть все возможности. Изменять его может только владелец."
            }
          />
        )}

        {profile.role === "member" && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">
                Выдано прав: <b className="text-fg">{grantedCount}</b> из {ALL_PERMISSIONS.length}
              </span>
              {editable && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <button className="btn-ghost text-xs" onClick={resetDefault}>
                    По умолчанию
                  </button>
                  <button className="btn-ghost text-xs" onClick={clearAll}>
                    Снять все
                  </button>
                  <button className="btn-ghost text-xs" onClick={grantAll}>
                    Выдать все
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {PERMISSION_GROUPS.map((group) => {
                const Icon = GROUP_ICONS[group.icon] ?? ShieldCheck;
                return (
                  <div key={group.title} className="card overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                      <span
                        className="grid h-7 w-7 place-items-center rounded-lg"
                        style={{ backgroundColor: `${group.color}22`, color: group.color }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-semibold">{group.title}</span>
                    </div>
                    <div className="divide-y divide-border">
                      {group.permissions.map((perm) => {
                        const on = draft.has(perm.key);
                        return (
                          <label
                            key={perm.key}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-surface-2/50",
                              !editable && "cursor-not-allowed opacity-70",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{perm.label}</div>
                              <div className="text-xs text-muted">{perm.hint}</div>
                            </div>
                            <Toggle
                              checked={on}
                              disabled={!editable}
                              onChange={() => toggle(perm.key)}
                              color={group.color}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {!editable && (
              <p className="mt-4 text-center text-xs text-faint">
                У вас нет прав изменять этого пользователя.
              </p>
            )}
          </>
        )}
      </div>

      {/* футер сохранения */}
      {profile.role === "member" && editable && (
        <div className="flex items-center justify-end gap-3 border-t border-border p-4 sm:px-6">
          {dirty && <span className="mr-auto text-xs text-amber-500">Есть несохранённые изменения</span>}
          <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Сохранить права
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  color,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) onChange();
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "" : "bg-surface-2 ring-1 ring-inset ring-border",
        disabled && "opacity-60",
      )}
      style={checked ? { backgroundColor: color } : undefined}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

function InfoCard({
  icon,
  color,
  title,
  text,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  text: string;
}) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {icon}
      </span>
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-0.5 text-sm text-muted">{text}</p>
      </div>
    </div>
  );
}
