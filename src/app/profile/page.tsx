"use client";

import { useRef, useState } from "react";
import {
  User,
  Mail,
  KeyRound,
  Camera,
  Trash2,
  Loader2,
  Check,
  Crown,
  ShieldCheck,
  AlertTriangle,
  Briefcase,
  LogOut,
} from "lucide-react";
import { useAccess } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { compressImage } from "@/lib/image";
import { ROLE_META } from "@/lib/permissions";
import { MEMBER_ROLES } from "@/lib/types";
import { avatarColor, initials, contrastText, cn } from "@/lib/utils";

type Msg = { kind: "ok" | "err"; text: string } | null;

export default function ProfilePage() {
  const { me, loading, updateMyProfile, deleteMyProfile } = useAccess();
  const { user, updateEmail, updatePassword, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <User className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">Профиль недоступен</h1>
        <p className="max-w-sm text-sm text-muted">
          Профиль не найден или аккаунт деактивирован. Обратитесь к администратору проекта.
        </p>
        <button className="btn-outline mt-2" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </div>
    );
  }

  return (
    <ProfileInner
      key={me.id}
      me={me}
      email={user?.email ?? me.email}
      updateMyProfile={updateMyProfile}
      deleteMyProfile={deleteMyProfile}
      updateEmail={updateEmail}
      updatePassword={updatePassword}
      signOut={signOut}
    />
  );
}

function ProfileInner({
  me,
  email,
  updateMyProfile,
  deleteMyProfile,
  updateEmail,
  updatePassword,
  signOut,
}: {
  me: NonNullable<ReturnType<typeof useAccess>["me"]>;
  email: string;
  updateMyProfile: ReturnType<typeof useAccess>["updateMyProfile"];
  deleteMyProfile: ReturnType<typeof useAccess>["deleteMyProfile"];
  updateEmail: ReturnType<typeof useAuth>["updateEmail"];
  updatePassword: ReturnType<typeof useAuth>["updatePassword"];
  signOut: ReturnType<typeof useAuth>["signOut"];
}) {
  const roleMeta = ROLE_META[me.role];
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(me.name);
  const [jobRole, setJobRole] = useState(me.jobRole);
  const [avatar, setAvatar] = useState<string | null>(me.avatar ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [confirmDel, setConfirmDel] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delMsg, setDelMsg] = useState<Msg>(null);

  const dirtyProfile = name !== me.name || jobRole !== me.jobRole || (avatar ?? null) !== (me.avatar ?? null);

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 320, 0.8); // маленький квадрат — экономим место
      setAvatar(dataUrl);
      setProfileMsg(null);
    } catch {
      setProfileMsg({ kind: "err", text: "Не удалось обработать изображение" });
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    const err = await updateMyProfile({ name: name.trim(), jobRole: jobRole.trim(), avatar });
    setSavingProfile(false);
    setProfileMsg(err ? { kind: "err", text: err } : { kind: "ok", text: "Профиль сохранён" });
  };

  const changeEmail = async () => {
    if (!newEmail.trim()) return;
    setEmailBusy(true);
    setEmailMsg(null);
    const { error } = await updateEmail(newEmail.trim());
    setEmailBusy(false);
    if (error) setEmailMsg({ kind: "err", text: error });
    else {
      setEmailMsg({
        kind: "ok",
        text: `На ${newEmail.trim()} отправлено письмо. Перейдите по ссылке, чтобы подтвердить новую почту.`,
      });
      setNewEmail("");
    }
  };

  const changePassword = async () => {
    if (pw1.length < 6) {
      setPwMsg({ kind: "err", text: "Пароль — минимум 6 символов" });
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg({ kind: "err", text: "Пароли не совпадают" });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await updatePassword(pw1);
    setPwBusy(false);
    if (error) setPwMsg({ kind: "err", text: error });
    else {
      setPwMsg({ kind: "ok", text: "Пароль изменён" });
      setPw1("");
      setPw2("");
    }
  };

  const doDelete = async () => {
    setDelBusy(true);
    setDelMsg(null);
    const err = await deleteMyProfile();
    if (err) {
      setDelBusy(false);
      setDelMsg({ kind: "err", text: err });
      return;
    }
    // профиль помечен удалённым — выходим из аккаунта
    await signOut();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
        <h1 className="text-2xl font-bold">Профиль</h1>
        <p className="mt-1 text-sm text-muted">Управляйте своим аккаунтом: имя, фото, почта, пароль.</p>

        {/* ── Карточка профиля ── */}
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt={name} className="h-20 w-20 rounded-2xl object-cover" />
              ) : (
                <span
                  className="grid h-20 w-20 place-items-center rounded-2xl text-2xl font-bold"
                  style={{ backgroundColor: avatarColor(name || email), color: contrastText(avatarColor(name || email)) }}
                >
                  {initials(name || email || "U")}
                </span>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-brand text-white shadow-md transition hover:opacity-90"
                title="Загрузить фото"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickAvatar(e.target.files?.[0])}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{name || "Без имени"}</div>
              <div className="truncate text-sm text-muted">{email}</div>
              <span
                className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: `${roleMeta.color}22`, color: roleMeta.color }}
              >
                {me.role === "owner" && <Crown className="h-3 w-3" />}
                {me.role === "admin" && <ShieldCheck className="h-3 w-3" />}
                {roleMeta.label}
              </span>
            </div>
            {avatar && (
              <button
                onClick={() => setAvatar(null)}
                className="ml-auto self-start text-xs text-muted underline hover:text-red-500"
              >
                Убрать фото
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Имя</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input className="input pl-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" />
              </div>
            </div>
            <div>
              <label className="label">Должность</label>
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input
                  className="input pl-9"
                  value={jobRole}
                  onChange={(e) => setJobRole(e.target.value)}
                  placeholder="напр. Frontend"
                  list="job-roles"
                />
                <datalist id="job-roles">
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" onClick={saveProfile} disabled={savingProfile || !dirtyProfile}>
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Сохранить
            </button>
            {profileMsg && <Feedback msg={profileMsg} />}
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Роль назначает владелец проекта в разделе «Администрирование» — свою роль изменить нельзя.
          </p>
        </section>

        {/* ── Почта ── */}
        <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4 text-brand" /> Почта
          </h2>
          <p className="mt-1 text-xs text-muted">
            Текущая: <span className="font-medium text-fg">{email}</span>. Смена — через подтверждение по ссылке на новый адрес.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              className="input flex-1"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="новый email"
            />
            <button className="btn-outline" onClick={changeEmail} disabled={emailBusy || !newEmail.trim()}>
              {emailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Сменить почту
            </button>
          </div>
          {emailMsg && <div className="mt-2"><Feedback msg={emailMsg} /></div>}
        </section>

        {/* ── Пароль ── */}
        <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-brand" /> Пароль
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="password"
              className="input"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              placeholder="новый пароль"
              autoComplete="new-password"
            />
            <input
              type="password"
              className="input"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="повторите пароль"
              autoComplete="new-password"
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn-outline" onClick={changePassword} disabled={pwBusy || !pw1 || !pw2}>
              {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Сменить пароль
            </button>
            {pwMsg && <Feedback msg={pwMsg} />}
          </div>
        </section>

        {/* ── Опасная зона ── */}
        {me.role !== "owner" && (
          <section className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" /> Удалить профиль
            </h2>
            <p className="mt-1 text-xs text-muted">
              Аккаунт деактивируется, и вы выйдете из системы. <b>Ваши доски, задачи, журнал и карты
              останутся</b> — рядом с вашим именем будет помечено «удалённый аккаунт». Ничего не
              стирается и не ломается.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="input flex-1"
                value={confirmDel}
                onChange={(e) => setConfirmDel(e.target.value)}
                placeholder="Введите УДАЛИТЬ, чтобы подтвердить"
              />
              <button
                className="btn bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                onClick={doDelete}
                disabled={delBusy || confirmDel.trim().toUpperCase() !== "УДАЛИТЬ"}
              >
                {delBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Удалить профиль
              </button>
            </div>
            {delMsg && <div className="mt-2"><Feedback msg={delMsg} /></div>}
          </section>
        )}
      </div>
    </div>
  );
}

function Feedback({ msg }: { msg: NonNullable<Msg> }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        msg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      {msg.kind === "ok" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {msg.text}
    </span>
  );
}
