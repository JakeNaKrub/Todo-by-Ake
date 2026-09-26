"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Check,
  Circle,
  CircleAlert,
  Pencil,
  PersonStanding,
  Plus,
  Radio,
  Send,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react";
import {
  db,
  defaultSettings,
  removeTask,
  saveTask,
  type AppSettings,
  type Category,
  type Task,
  type ThemeOption,
  type Urgency,
  type SortOption,
} from "@/lib/db";
import { flushSyncQueue } from "@/lib/sync";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { ensureReminderJob, getNextReminderAt, markReminderDelivered, shouldSendReminder } from "@/lib/reminders";
import { playCompletionSound } from "@/lib/sound";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

type Filter = "all" | Category | "completed";
const categories: { value: Category; label: string; color: string }[] = [
  { value: "work", label: "Work", color: "#3974a8" },
  { value: "school", label: "School", color: "#4a8a5b" },
  { value: "personal", label: "Personal", color: "#8d58aa" },
];
const urgencies: { value: Urgency; label: string; color: string }[] = [
  { value: "high", label: "High", color: "#d94b43" },
  { value: "medium", label: "Medium", color: "#d17a34" },
  { value: "low", label: "Low", color: "#78818a" },
];

function localDateTimeParts(value?: string) {
  if (!value) return { date: "", time: "" };
  const current = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return { date: `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`, time: `${pad(current.getHours())}:${pad(current.getMinutes())}` };
}

function isoFromLocalParts(date: string, time: string) {
  return date ? new Date(`${date}T${time || "00:00"}`).toISOString() : undefined;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("work");
  const [newUrgency, setNewUrgency] = useState<Urgency>("medium");
  const [filter, setFilter] = useState<Filter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [online, setOnline] = useState(true);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [pendingCompletions, setPendingCompletions] = useState<Set<string>>(new Set());
  const completionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reminderTimer = useRef<number | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([db.tasks.toArray(), db.settings.get("settings")]).then(
      ([storedTasks, storedSettings]) => {
        if (!active) return;
        setTasks(storedTasks);
        if (storedSettings) setSettings({ ...defaultSettings, ...storedSettings });
      },
    );
    const goOnline = () => {
      setOnline(true);
      void flushSyncQueue();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void flushSyncQueue();
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
    return () => {
      active = false;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setAuthEmail(data.user?.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    void db.settings.put(settings);
  }, [settings]);
  useEffect(() => {
    if (!settings.globalRemindersEnabled) {
      if (reminderTimer.current) window.clearTimeout(reminderTimer.current);
      return;
    }

    const scheduleNextReminder = () => {
      const nextReminder = tasks
        .filter((task) => !task.isCompleted)
        .map((task) => ({ task, nextAt: getNextReminderAt(task, settings) }))
        .filter((item): item is { task: Task; nextAt: Date } => item.nextAt !== null)
        .sort((a, b) => a.nextAt.getTime() - b.nextAt.getTime())[0];

      if (!nextReminder) {
        if (reminderTimer.current) window.clearTimeout(reminderTimer.current);
        reminderTimer.current = null;
        return;
      }

      const delay = Math.max(nextReminder.nextAt.getTime() - Date.now(), 0);
      if (reminderTimer.current) window.clearTimeout(reminderTimer.current);

      reminderTimer.current = window.setTimeout(() => {
        const task = nextReminder.task;
        if (Notification.permission === "granted" && shouldSendReminder(task, settings, new Date())) {
          new Notification(task.title, {
            body: task.deadline ? `Deadline: ${new Date(task.deadline).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "You still have unfinished tasks waiting.",
            icon: "/icon.svg",
            badge: "/icon.svg",
            tag: `todo-reminder-${task.id}`,
            requireInteraction: true,
          });
          void markReminderDelivered(task.id, settings);
        }
        void ensureReminderJob(task, settings);
        scheduleNextReminder();
      }, delay);
    };

    scheduleNextReminder();
    return () => {
      if (reminderTimer.current) window.clearTimeout(reminderTimer.current);
      reminderTimer.current = null;
    };
  }, [settings, tasks]);
  useEffect(() => () => {
    completionTimers.current.forEach((timer) => clearTimeout(timer));
    if (reminderTimer.current) window.clearTimeout(reminderTimer.current);
  }, []);
  const visibleTasks = useMemo(() => {
    const priority = { high: 0, medium: 1, low: 2 };
    return tasks
      .filter((task) =>
          filter === "all"
            ? !task.isCompleted || pendingCompletions.has(task.id)
            : filter === "completed"
              ? task.isCompleted && !pendingCompletions.has(task.id)
              : task.category === filter,
        )
      .sort((a, b) => (settings.sortOption ?? "priority") === "priority"
        ? priority[a.urgency] - priority[b.urgency] || b.createdAt.localeCompare(a.createdAt)
        : settings.sortOption === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt));
  }, [tasks, filter, pendingCompletions, settings.sortOption]);
  const themeClass =
    settings.theme === "dark"
      ? styles.dark
      : settings.theme === "bright"
        ? styles.bright
        : "";
  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      category: newCategory,
      urgency: newUrgency,
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };
    setTasks((current) => [task, ...current]);
    setNewTitle("");
    await saveTask(task);
  }
  async function toggleTask(task: Task) {
    const updated = {
      ...task,
      isCompleted: !task.isCompleted,
      updatedAt: new Date().toISOString(),
    };
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? updated : item)),
    );
    const existingTimer = completionTimers.current.get(task.id);
    if (existingTimer) clearTimeout(existingTimer);
    setPendingCompletions((current) => {
      const next = new Set(current);
      if (updated.isCompleted) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
    if (updated.isCompleted) {
      const timer = setTimeout(() => {
        setPendingCompletions((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
        completionTimers.current.delete(task.id);
      }, 5000);
      completionTimers.current.set(task.id, timer);
    }
    if (updated.isCompleted && settings.soundEnabled) playCompletionSound();
    await saveTask(updated);
  }
  async function deleteTask(task: Task) {
    if (settings.confirmBeforeDelete && !window.confirm(`Delete "${task.title}"?`)) return;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    await removeTask(task.id);
  }
  async function updateTask(updated: Task) {
    const next = {
      ...updated,
      title: updated.title.trim(),
      updatedAt: new Date().toISOString(),
    };
    if (!next.title) return;
    setTasks((current) =>
      current.map((item) => (item.id === next.id ? next : item)),
    );
    setEditing(null);
    await saveTask(next);
  }
  const pageStyle = { "--font-size": `${settings.fontSize}px`, "--font-weight": settings.boldText ? "700" : "400" } as React.CSSProperties;
  return (
    <main className={`${styles.page} ${themeClass}`} style={pageStyle}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>BEST WAY TO REMEMBER IS TO WRITE IT DOWN</p>
            <h1>To-Do by Ake</h1>
          </div>
          <div className={styles.headerActions}>
            <span className={`${styles.status} ${online ? styles.online : ""}`}>
              <span />
              {online ? "Online" : "Offline"}
            </span>
            <button
              className={styles.iconButton}
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon size={20} />
            </button>
          </div>
        </header>
        {!authEmail && <div className={styles.accountNotice}>You are using local-only mode. <button onClick={() => setSettingsOpen(true)}>Sign in</button> to sync tasks and enable push notifications.</div>}
        <nav className={styles.filters} aria-label="Task filters">
          {(["all", "work", "school", "personal", "completed"] as Filter[]).map(
            (item) => (
              <button
                key={item}
                className={filter === item ? styles.activeFilter : ""}
                onClick={() => setFilter(item)}
              >
                {item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}
              </button>
            ),
          )}
        </nav>
        <section className={styles.quickAdd}>
          <div className={styles.addRow}>
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addTask();
              }}
              placeholder="Type a task..."
              aria-label="Task title"
            />
            <button
              className={styles.addButton}
              aria-label="Add task"
              onClick={() => void addTask()}
              disabled={!newTitle.trim()}
            >
              <Plus size={22} />
            </button>
          </div>
          <div className={styles.segmentRow}>
            <Segment
                options={urgencies}
                value={newUrgency}
                onChange={setNewUrgency}
            />
            <Segment
              options={categories}
              value={newCategory}
              onChange={setNewCategory}
            />
          </div>
        </section>
        <div className={styles.listOptions}>
          <label htmlFor="task-order">Task order</label>
          <select id="task-order" value={settings.sortOption ?? "priority"} onChange={(event) => setSettings((current) => ({ ...current, sortOption: event.target.value as SortOption }))}>
            <option value="priority">Priority first</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <section className={styles.list} aria-live="polite">
          {visibleTasks.length ? (
            visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => void toggleTask(task)}
                onEdit={() => setEditing(task)}
                onDelete={() => void deleteTask(task)}
              />
            ))
          ) : (
            <div className={styles.empty}>
              <Check size={22} />
              <p>{filter === "all" ? "No tasks yet" : "Nothing here"}</p>
              <span>Add something small to get started.</span>
            </div>
          )}
        </section>
      </section>
      {settingsOpen && (
        <Settings
          settings={settings}
          authEmail={authEmail}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {editing && (
        <Editor
          task={editing}
          onSave={updateTask}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segment}>
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? styles.selected : ""}
          onClick={() => onChange(option.value)}
        >
          {options === categories ? (
            <CategoryIcon
              category={option.value as Category}
              color={option.color}
            />
          ) : (
            <UrgencyIcon
              urgency={option.value as Urgency}
              color={option.color}
            />
          )}
          {option.label}
        </button>
      ))}
    </div>
  );
}
function CategoryIcon({
  category,
  color,
  size = 15,
}: {
  category: Category;
  color?: string;
  size?: number;
}) {
  const Icon =
    category === "work"
      ? BriefcaseBusiness
      : category === "school"
        ? BookOpen
        : PersonStanding;
  return <Icon size={size} style={{ color }} />;
}
function UrgencyIcon({
  urgency,
  color,
  size = 15,
}: {
  urgency: Urgency;
  color?: string;
  size?: number;
}) {
  return urgency === "low" ? (
    <Circle size={size} style={{ color }} />
  ) : (
    <CircleAlert size={size} style={{ color }} />
  );
}
function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const category = categories.find((item) => item.value === task.category)!;
  const urgency = urgencies.find((item) => item.value === task.urgency)!;
  return (
    <article
      className={`${styles.taskRow} ${task.isCompleted ? styles.completed : ""}`}
    >
      <button
        className={styles.checkButton}
        onClick={onToggle}
        aria-label={task.isCompleted ? "Mark incomplete" : "Mark complete"}
      >
        {task.isCompleted ? <Check size={18} /> : <Circle size={22} />}
      </button>
      <div className={styles.taskBody}>
        <h2>{task.title}</h2>
        {task.notes && <p className={styles.notes}>{task.notes}</p>}
        {task.deadline && (
          <p className={styles.deadline}>
            Deadline:{" "}
            {new Date(task.deadline).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
        <div className={styles.pills}>
          <span
            style={{ "--pill-color": category.color } as React.CSSProperties}
          >
            <CategoryIcon category={task.category} size={13} />
            {category.label}
          </span>
          <span
            style={{ "--pill-color": urgency.color } as React.CSSProperties}
          >
            <UrgencyIcon urgency={task.urgency} size={13} />
            {urgency.label}
          </span>
        </div>
      </div>
      <div className={styles.rowActions}>
        <button aria-label="Edit task" onClick={onEdit}>
          <Pencil size={17} />
        </button>
        <button className={styles.deleteAction} aria-label="Delete task" onClick={onDelete}>
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}
function Settings({
  settings,
  authEmail,
  onChange,
  onClose,
}: {
  settings: AppSettings;
  authEmail: string | null;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}) {
  const update = (patch: Partial<AppSettings>) =>
    onChange({ ...settings, ...patch });
  const [pushState, setPushState] = useState("Enable Push Notifications");
  const [testPushState, setTestPushState] = useState("Test Push Notification");
  async function enablePush() {
    setPushState("Requesting permission...");
    try {
      await subscribeToPush();
      setPushState("Push Notifications Enabled");
    } catch (error) {
      setPushState(
        error instanceof Error ? error.message : "Push setup failed",
      );
    }
  }
  async function disablePush() {
    setPushState("Disabling push...");
    try {
      await unsubscribeFromPush();
      setPushState("Enable Push Notifications");
    } catch {
      setPushState("Push disable failed");
    }
  }
  async function testPush() {
    setTestPushState("Sending test...");
    try {
      const response = await fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "To-Do test", message: "Push notifications are working." }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      setTestPushState(response.ok ? "Test push sent" : result.error ?? "Push test failed");
    } catch {
      setTestPushState("Push test failed");
    }
  }
  return (
    <div className={styles.overlay}>
      <section className={styles.sheet}>
        <header>
          <div>
            <p className={styles.eyebrow}>Preferences</p>
            <h2>Settings</h2>
          </div>
          <button
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </header>
        <div className={styles.form}>
          <div className={styles.about}>
            <strong>To-Do List by Ake</strong>
            <span>Version 1.0</span>
          </div>
          <AuthPanel authEmail={authEmail} />
          <label>
            Font size{" "}
            <input
              type="range"
              min="14"
              max="28"
              step="1"
              value={settings.fontSize}
              onChange={(event) =>
                update({ fontSize: Number(event.target.value) })
              }
            />
          </label>
          <label className={styles.toggle}>
            <span>Bold Text</span>
            <input
              type="checkbox"
              checked={settings.boldText}
              onChange={(event) => update({ boldText: event.target.checked })}
            />
          </label>
          <label className={styles.toggle}>
            <span>Ask before deleting</span>
            <input type="checkbox" checked={settings.confirmBeforeDelete} onChange={(event) => update({ confirmBeforeDelete: event.target.checked })} />
          </label>
          <fieldset>
            <legend>Appearance</legend>
            <div className={styles.themeOptions}>
              {(["auto", "bright", "dark"] as ThemeOption[]).map((theme) => (
                <button
                  key={theme}
                  className={settings.theme === theme ? styles.selected : ""}
                  onClick={() => update({ theme })}
                >
                  {theme[0].toUpperCase() + theme.slice(1)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className={styles.toggle}>
            <span>
              <Bell size={16} /> Play completion sound
            </span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(event) =>
                update({ soundEnabled: event.target.checked })
              }
            />
          </label>
          <button className={styles.pushButton} onClick={() => playCompletionSound()}>
            <Bell size={16} /> Test Completion Sound
          </button>
          <button
            className={styles.pushButton}
            onClick={() => void (pushState === "Push Notifications Enabled" ? disablePush() : enablePush())}
          >
            <Radio size={16} />
            {pushState}
          </button>
          {authEmail && <button className={styles.pushButton} onClick={() => void testPush()}><Send size={16} /> {testPushState}</button>}
          <fieldset>
            <legend>Reminders</legend>
            <label className={styles.toggle}>
              <span>Enable Reminder Notifications</span>
              <input
                type="checkbox"
                checked={settings.globalRemindersEnabled}
                onChange={(event) =>
                  update({ globalRemindersEnabled: event.target.checked })
                }
              />
            </label>
            <select
              value={settings.reminderFrequency}
              onChange={(event) =>
                update({
                  reminderFrequency: event.target
                    .value as AppSettings["reminderFrequency"],
                })
              }
            >
              <option value="thirtyMinutes">30 Minutes</option>
              <option value="oneHour">1 Hour</option>
              <option value="custom">Custom</option>
            </select>
            {settings.reminderFrequency === "custom" && (
              <input
                type="number"
                min="1"
                value={settings.customReminderMinutes}
                onChange={(event) =>
                  update({ customReminderMinutes: Number(event.target.value) })
                }
                placeholder="Custom Minutes"
              />
            )}
          </fieldset>
        </div>
        <button className={styles.doneButton} onClick={onClose}>
          Done
        </button>
      </section>
    </div>
  );
}

function AuthPanel({ authEmail }: { authEmail: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  async function authenticate(mode: "signIn" | "signUp") {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured");
      return;
    }
    const result = mode === "signIn"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setMessage(result.error?.message ?? (mode === "signUp" ? "Check your email to confirm your account" : "Signed in"));
  }
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
  }
  if (authEmail) return <div className={styles.authPanel}><span>Signed in as {authEmail}</span><button className={styles.pushButton} onClick={() => void signOut()}>Sign out</button></div>;
  return <fieldset className={styles.authPanel}><legend>Cloud account</legend><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="email" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete="current-password" /><div className={styles.authActions}><button className={styles.pushButton} onClick={() => void authenticate("signIn")}>Sign in</button><button className={styles.pushButton} onClick={() => void authenticate("signUp")}>Create account</button></div>{message && <span className={styles.authMessage}>{message}</span>}</fieldset>;
}

function Editor({
  task,
  onSave,
  onClose,
}: {
  task: Task;
  onSave: (task: Task) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(task);
  const update = (patch: Partial<Task>) =>
    setDraft((current) => ({ ...current, ...patch }));
  return (
    <div className={styles.overlay}>
      <section className={styles.sheet}>
        <header>
          <div>
            <p className={styles.eyebrow}>Task details</p>
            <h2>Edit Task</h2>
          </div>
          <button
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Close editor"
          >
            <X size={20} />
          </button>
        </header>
        <div className={styles.form}>
          <label>
            Title
            <input
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>
          <fieldset>
            <legend>Category</legend>
            <Segment
              options={categories}
              value={draft.category}
              onChange={(category) => update({ category })}
            />
          </fieldset>
          <fieldset>
            <legend>Urgency</legend>
            <Segment
              options={urgencies}
              value={draft.urgency}
              onChange={(urgency) => update({ urgency })}
            />
          </fieldset>
          <label>
            Notes
            <textarea
              value={draft.notes ?? ""}
              onChange={(event) => update({ notes: event.target.value })}
              rows={5}
            />
          </label>
          <fieldset>
            <legend>Deadline</legend>
            <div className={styles.deadlineInputs}>
              <label>Date<input type="date" value={localDateTimeParts(draft.deadline).date} onChange={(event) => update({ deadline: isoFromLocalParts(event.target.value, localDateTimeParts(draft.deadline).time) })} /></label>
              <label>Time<input type="time" value={localDateTimeParts(draft.deadline).time} onChange={(event) => update({ deadline: isoFromLocalParts(localDateTimeParts(draft.deadline).date, event.target.value) })} /></label>
            </div>
          </fieldset>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.doneButton} onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
