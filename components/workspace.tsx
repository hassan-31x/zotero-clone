"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Home,
  Library as LibraryIcon,
  Compass,
  ListTodo,
  NotebookPen,
  Users,
  Settings as SettingsIcon,
  Plus,
  Search,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  FileText,
  Folder,
  Star,
  MoreHorizontal,
  Upload,
  Link as LinkIcon,
  X,
  Check,
  Grid2X2,
  List,
  Trash2,
  Archive,
  BookOpen,
  Menu,
  Copy,
  Download,
  LoaderCircle,
  CircleHelp,
  BookMarked,
  RotateCcw,
  Sun,
  ShieldCheck,
  CheckCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import { api, ApiError, downloadText } from "@/lib/client";
import { bibtex } from "@/lib/research";
import {
  defaultSettings,
  type Paper,
  type Library,
  type Identity,
  type Note,
  type Settings,
} from "@/lib/types";
const Reader = dynamic(() => import("./reader"), {
  ssr: false,
  loading: () => <div className="reader-loading skeleton" />,
});
const navigation = [
  { name: "Overview", path: "/app", icon: Home },
  { name: "Library", path: "/app/library", icon: LibraryIcon },
  { name: "Discover", path: "/app/discover", icon: Compass },
  { name: "Reading queue", path: "/app/queue", icon: ListTodo },
  { name: "Notes", path: "/app/notes", icon: NotebookPen },
];
const queryClientFactory = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  });
export default function Workspace() {
  const [client] = useState(queryClientFactory);
  return (
    <QueryClientProvider client={client}>
      <WorkspaceContent />
    </QueryClientProvider>
  );
}
function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <BookOpen size={18} />
      </span>
      margin<span className="brand-dot">.</span>
    </span>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content">
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Complete the details below."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Welcome({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"start" | "join" | "recover">("start");
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState("");
  const [saved, setSaved] = useState(false);
  const schema = z.object({
    displayName: z
      .string()
      .trim()
      .min(2, "Enter at least two characters.")
      .max(80),
    code: z.string().optional(),
  });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", code: "" },
  });
  const submit = form.handleSubmit(async (v) => {
    setError("");
    try {
      const result = await api("identity/start", "POST", {
        displayName: v.displayName,
      });
      setRecovery(result.recoveryKey);
      if (mode === "join" && v.code)
        await api("teams/join", "POST", { code: v.code });
    } catch (e) {
      setError((e as Error).message);
    }
  });
  return (
    <div className="welcome">
      <header>
        <Brand />
        <span className="muted text-sm">A little space for big ideas.</span>
      </header>
      <main id="main" className="welcome-main">
        <section className="welcome-copy">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR RESEARCH WORKSPACE
          </div>
          <h1>
            Read papers with context,
            <br />
            <span>not confusion.</span>
          </h1>
          <p>
            A quiet place to read, connect ideas, and make research your own.
            Bring your papers. Keep your thinking beside them.
          </p>
          <div className="welcome-benefits">
            <span>
              <FileText size={18} /> The paper, always in view
            </span>
            <span>
              <NotebookPen size={18} /> Notes that stay connected
            </span>
            <span>
              <Users size={18} /> Better thinking, together
            </span>
          </div>
          <div className="welcome-illustration" aria-hidden="true">
            <div className="illustration-toolbar">
              <span />
              <span />
              <span />
              <span className="illustration-name">
                Your next idea starts here
              </span>
            </div>
            <div className="illustration-body">
              <div className="illustration-page">
                <div className="line heading" />
                <div className="line short" />
                <div className="line" />
                <div className="line" />
                <div className="line highlighted" />
                <div className="line" />
                <div className="line short" />
              </div>
              <div className="illustration-note">
                <NotebookPen size={20} />
                <div className="line heading" />
                <div className="line" />
                <div className="line short" />
                <div className="note-connector">Source ↔ understanding</div>
              </div>
            </div>
          </div>
        </section>
        <section className="welcome-form">
          {recovery ? (
            <>
              <div className="empty-icon">
                <ShieldCheck size={24} />
              </div>
              <h2>Your workspace is ready.</h2>
              <p className="muted">
                Save this recovery key. It restores your identity on another
                device. We only show it once.
              </p>
              <code className="recovery-key">{recovery}</code>
              <Button
                onClick={() => {
                  downloadText("margin-recovery-key.txt", recovery);
                  setSaved(true);
                }}
              >
                <Download size={16} /> Save recovery key
              </Button>
              <Button variant="primary" onClick={onDone}>
                {saved ? "Open workspace" : "I saved my key, continue"}
                <ArrowRight size={16} />
              </Button>
              {error && <p className="error">{error}</p>}
            </>
          ) : (
            <>
              <span className="small-label">MAKE ROOM FOR YOUR RESEARCH</span>
              <h2>
                {mode === "recover"
                  ? "Welcome back."
                  : mode === "join"
                    ? "Research is better together."
                    : "Your next chapter starts here."}
              </h2>
              <p className="muted">
                {mode === "recover"
                  ? "Paste your recovery key to restore your workspace."
                  : "Just your name. No passwords, no inbox detours."}
              </p>
              <div className="segmented">
                <button
                  className={mode === "start" ? "active" : ""}
                  onClick={() => setMode("start")}
                >
                  Personal workspace
                </button>
                <button
                  className={mode === "join" ? "active" : ""}
                  onClick={() => setMode("join")}
                >
                  Join a team
                </button>
              </div>
              {mode === "recover" ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError("");
                    try {
                      await api("identity/recover", "POST", {
                        recoveryKey: form.getValues("code"),
                      });
                      onDone();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <label>
                    Recovery key
                    <input
                      {...form.register("code")}
                      required
                      placeholder="Paste your saved key"
                    />
                  </label>
                  <Button variant="primary" type="submit">
                    Restore workspace
                    <ArrowRight size={16} />
                  </Button>
                </form>
              ) : (
                <form onSubmit={submit}>
                  <label>
                    Your name
                    <input
                      {...form.register("displayName")}
                      placeholder="How should we call you?"
                      autoComplete="name"
                    />
                    {form.formState.errors.displayName && (
                      <span className="error">
                        {form.formState.errors.displayName.message}
                      </span>
                    )}
                  </label>
                  {mode === "join" && (
                    <label>
                      Team invitation code
                      <input
                        {...form.register("code")}
                        required
                        placeholder="LAB-…"
                      />
                    </label>
                  )}
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <ArrowRight size={16} />
                    )}{" "}
                    {mode === "join" ? "Join workspace" : "Create my workspace"}
                  </Button>
                </form>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="privacy-line">
                <ShieldCheck size={16} />
                <span>
                  Private by default. Your papers stay on this server.
                  <br />
                  Excerpts go to OpenRouter only when you use AI.
                </span>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  setMode(mode === "recover" ? "start" : "recover")
                }
              >
                {mode === "recover"
                  ? "Create a new identity"
                  : "Already have a recovery key?"}
              </button>
            </>
          )}
        </section>
      </main>
      <footer>
        <span>Made for thoughtful work.</span>
        <span>Lightweight access for trusted research teams.</span>
      </footer>
    </div>
  );
}
function WorkspaceContent() {
  const router = useRouter(),
    path = usePathname(),
    query = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api("session"),
    retry: false,
  });
  const [libraryId, setLibraryId] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const sessionData = session.data as
    | {
        identity: Identity;
        libraries: Library[];
        settings: Settings;
        aiConfigured: boolean;
      }
    | undefined;
  const library =
    sessionData?.libraries.find(
      (l) =>
        l._id ===
        (path.startsWith("/app/library/") ? path.split("/")[3] : libraryId),
    ) || sessionData?.libraries[0];
  const activeLibrary = library?._id || "";
  const papersQuery = useQuery<Paper[]>({
    queryKey: ["papers", activeLibrary],
    queryFn: () => api(`papers?libraryId=${activeLibrary}`),
    enabled: !!activeLibrary,
    refetchInterval: 5000,
  });
  const collections = useQuery<any[]>({
    queryKey: ["collections", activeLibrary],
    queryFn: () => api(`collections?libraryId=${activeLibrary}`),
    enabled: !!activeLibrary,
    refetchInterval: 10000,
  });
  useEffect(() => {
    const theme = sessionData?.settings.theme || "light";
    document.documentElement.dataset.theme =
      theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
  }, [sessionData?.settings.theme]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (
        (e.target as HTMLElement).matches(
          "input,textarea,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n") setImportOpen(true);
      if (e.key === "Escape") setSidebar(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const notify = (s: string) => setToast(s);
  const refresh = () => {
    query.invalidateQueries({ queryKey: ["papers"] });
    query.invalidateQueries({ queryKey: ["collections"] });
  };
  if (session.isPending)
    return (
      <div className="boot">
        <Brand />
        <div className="skeleton boot-line" />
        <p className="muted">Opening your workspace…</p>
      </div>
    );
  if (
    !sessionData &&
    session.error &&
    (!(session.error instanceof ApiError) || session.error.status !== 401)
  )
    return (
      <div className="boot">
        <Brand />
        <p className="error" role="alert">
          {session.error.message}
        </p>
        <Button onClick={() => session.refetch()}>Retry connection</Button>
        <p className="muted text-sm">
          Check that MongoDB and the app server are running.
        </p>
      </div>
    );
  if (!sessionData)
    return (
      <Welcome
        onDone={() => {
          query.invalidateQueries({ queryKey: ["session"] });
          router.push("/app");
        }}
      />
    );
  const readerId = path.startsWith("/app/papers/") ? path.split("/")[3] : "";
  if (readerId)
    return (
      <>
        <Reader
          paperId={readerId}
          user={sessionData.identity}
          settings={sessionData.settings}
          aiConfigured={sessionData.aiConfigured}
          notify={notify}
        />
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
      </>
    );
  const papers = papersQuery.data || [];
  const currentNav = navigation.find((n) => n.path === path);
  const isOverview = path === "/" || path === "/app";
  const title = isOverview
    ? "Overview"
    : currentNav?.name ||
      (path.startsWith("/app/teams")
        ? "Teams"
        : path.startsWith("/app/library")
          ? "Library"
          : "Settings");
  return (
    <div className={`workspace ${sidebar ? "sidebar-open" : ""}`}>
      <aside className="sidebar">
        <Link href="/app" className="brand-link">
          <Brand />
        </Link>
        <label className="workspace-select">
          <span className="workspace-avatar">
            {library?.teamId ? (
              <Users size={15} />
            ) : (
              sessionData.identity.displayName.slice(0, 1).toUpperCase()
            )}
          </span>
          <select
            aria-label="Active library"
            value={activeLibrary}
            onChange={(e) => {
              setLibraryId(e.target.value);
              setCollection("");
            }}
          >
            {sessionData.libraries.map((l) => (
              <option key={l._id} value={l._id}>
                {l.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <Link
              key={n.path}
              href={n.path}
              onClick={() => {
                setSidebar(false);
                setCollection("");
                setSearch("");
              }}
              className={
                (isOverview && n.path === "/app") || path === n.path
                  ? "active"
                  : ""
              }
            >
              <n.icon size={18} />
              {n.name}
              {n.name === "Library" && papers.length > 0 && (
                <span className="nav-count">
                  {papers.filter((p) => !p.deleted && !p.archived).length}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="nav-label collection-label">
          COLLECTIONS
          <Button
            variant="ghost"
            size="icon"
            aria-label="Create collection"
            onClick={async () => {
              setCollection("new");
              router.push("/app/library");
            }}
          >
            <Plus size={14} />
          </Button>
        </div>
        <nav aria-label="Collections">
          {(collections.data || [])
            .filter((c) => !c.parentId)
            .map((c) => (
              <div key={c._id}>
                <button
                  className={collection === c._id ? "active" : ""}
                  onClick={() => {
                    setCollection(c._id);
                    router.push("/app/library");
                  }}
                >
                  <Folder size={16} />
                  <span className="truncate">{c.name}</span>
                  <span className="nav-count">
                    {papers.filter(
                      (p) => p.collectionIds.includes(c._id) && !p.deleted,
                    ).length || ""}
                  </span>
                </button>
                {(collections.data || [])
                  .filter((child) => child.parentId === c._id)
                  .map((child) => (
                    <button
                      key={child._id}
                      className={`nested ${collection === child._id ? "active" : ""}`}
                      onClick={() => {
                        setCollection(child._id);
                        router.push("/app/library");
                      }}
                    >
                      <Folder size={14} />
                      {child.name}
                    </button>
                  ))}
              </div>
            ))}
          {!collections.data?.length && (
            <p className="sidebar-empty">A place for each line of inquiry.</p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <nav>
            <Link
              href="/app/teams"
              className={path.startsWith("/app/teams") ? "active" : ""}
            >
              <Users size={18} />
              Teams
            </Link>
            <Link
              href="/app/settings"
              className={path === "/app/settings" ? "active" : ""}
            >
              <SettingsIcon size={18} />
              Settings
            </Link>
          </nav>
          <div className="profile">
            <span className="avatar">
              {sessionData.identity.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{sessionData.identity.displayName}</strong>
              <span>Personal workspace</span>
            </div>
            <span className="online-dot" title="Session active" />
          </div>
        </div>
      </aside>
      {sidebar && (
        <button
          aria-label="Close navigation"
          className="sidebar-backdrop"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="workspace-body">
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setSidebar(true)}
          >
            <Menu size={20} />
          </Button>
          <span className="breadcrumb">
            Workspace <span>/</span> <strong>{title}</strong>
          </span>
          <label className="global-search">
            <Search size={16} />
            <input
              ref={searchRef}
              placeholder="Search your research…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (
                  e.target.value &&
                  !path.startsWith("/app/library") &&
                  path !== "/app/notes" &&
                  path !== "/app/discover"
                ) {
                  setCollection("");
                  router.push("/app/library");
                }
              }}
              aria-label="Search your research"
            />
            <kbd>⌘ K</kbd>
          </label>
          <Button
            variant="primary"
            onClick={() => setImportOpen(true)}
            disabled={library?.role === "viewer"}
          >
            <Plus size={16} />
            Add paper
          </Button>
        </header>
        <main id="main" className="main-content">
          {papersQuery.error && (
            <div className="error-banner" role="alert">
              {papersQuery.error.message}
              <Button size="sm" onClick={() => papersQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {isOverview ? (
            <Overview
              user={sessionData.identity}
              papers={papers.filter((p) => !p.deleted && !p.archived)}
              library={library!}
              collections={collections.data || []}
              onImport={() => setImportOpen(true)}
              search={search}
            />
          ) : path.startsWith("/app/library") || path === "/app/queue" ? (
            <LibraryView
              papers={papers}
              library={library!}
              collections={collections.data || []}
              collection={collection}
              onCollection={setCollection}
              search={search}
              queue={path === "/app/queue"}
              onImport={() => setImportOpen(true)}
              refresh={refresh}
              notify={notify}
            />
          ) : path === "/app/notes" ? (
            <GlobalNotes search={search} />
          ) : path === "/app/discover" ? (
            <Discover
              papers={papers}
              libraryId={activeLibrary}
              search={search}
              interests={sessionData.settings.interests}
              refresh={refresh}
              notify={notify}
            />
          ) : path.startsWith("/app/teams") ? (
            <Teams
              libraries={sessionData.libraries}
              user={sessionData.identity}
              activeLibrary={library!}
              notify={notify}
              onChange={() =>
                query.invalidateQueries({ queryKey: ["session"] })
              }
            />
          ) : (
            <SettingsView
              settings={sessionData.settings}
              aiConfigured={sessionData.aiConfigured}
              user={sessionData.identity}
              notify={notify}
              onSave={() => query.invalidateQueries({ queryKey: ["session"] })}
            />
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            <span className="status-dot" /> Your workspace, your pace.
          </span>
          <span>Stored privately on this server</span>
        </footer>
      </div>
      <ImportDialog
        open={importOpen}
        close={() => setImportOpen(false)}
        library={library!}
        onImported={refresh}
        notify={notify}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
function matchPaper(p: Paper, q: string) {
  return `${p.title} ${p.authors.join(" ")} ${p.tags.join(" ")} ${p.doi || ""} ${p.arxivId || ""}`
    .toLowerCase()
    .includes(q.toLowerCase());
}
function Overview({
  user,
  papers,
  library,
  collections,
  onImport,
  search,
}: {
  user: Identity;
  papers: Paper[];
  library: Library;
  collections: any[];
  onImport: () => void;
  search: string;
}) {
  const recent = papers.filter((p) => matchPaper(p, search)).slice(0, 5);
  const continuing = papers.filter(
    (p) => p.status === "Reading" || (p.progress && p.progress < 100),
  );
  const activity = useQuery<any[]>({
    queryKey: ["activity", library._id],
    queryFn: () => api(`activity?libraryId=${library._id}`),
    refetchInterval: 10000,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow muted">A SPACE TO THINK</div>
          <h1>Welcome back, {user.displayName.split(" ")[0]}.</h1>
          <p>Pick up a thought. Follow a question. Find your next idea.</p>
        </div>
        <span className="date-label">
          {new Date().toLocaleDateString("en", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
      <div className="overview-stats">
        <div>
          <LibraryIcon size={19} />
          <strong>{papers.length}</strong>
          <span>In your library</span>
        </div>
        <div>
          <BookOpen size={19} />
          <strong>{papers.filter((p) => p.status === "Reading").length}</strong>
          <span>Currently reading</span>
        </div>
        <div>
          <CheckCheck size={19} />
          <strong>
            {papers.filter((p) => p.status === "Finished").length}
          </strong>
          <span>Papers finished</span>
        </div>
        <div>
          <Folder size={19} />
          <strong>{collections.length}</strong>
          <span>Collections</span>
        </div>
      </div>
      <div className="overview-grid">
        <section>
          <div className="section-heading">
            <h2>Continue reading</h2>
            <Link href="/app/queue">
              Reading queue <ArrowRight size={14} />
            </Link>
          </div>
          {continuing.length ? (
            <div className="reading-cards">
              {continuing.slice(0, 2).map((p) => (
                <Link
                  href={`/app/papers/${p._id}`}
                  className="reading-card"
                  key={p._id}
                >
                  <div className="paper-cover">
                    <FileText size={32} />
                    <span>{p.year || "PDF"}</span>
                  </div>
                  <div>
                    <span className="badge">IN PROGRESS</span>
                    <h3>{p.title}</h3>
                    <p>
                      {p.authors.slice(0, 2).join(", ") ||
                        "Authors not specified"}
                    </p>
                    <div className="progress-track">
                      <span style={{ width: `${p.progress || 0}%` }} />
                    </div>
                    <span className="muted text-xs">
                      Page {p.readingPage || 1} of {p.pageCount || "…"}{" "}
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="continue-empty">
              <div className="document-stack" aria-hidden="true">
                <FileText size={32} />
              </div>
              <div>
                <h3>Your next read is waiting.</h3>
                <p>
                  Add a paper to start building your research story.
                  <br />
                  Your place, notes, and highlights will be right here.
                </p>
                <Button onClick={onImport}>
                  <Plus size={15} /> Add your first paper
                </Button>
              </div>
            </div>
          )}
          <div className="section-heading recent-heading">
            <h2>Recently added</h2>
            <Link href="/app/library">
              View library <ArrowRight size={14} />
            </Link>
          </div>
          {recent.length ? (
            <div className="paper-list">
              {recent.map((p) => (
                <PaperRow paper={p} key={p._id} />
              ))}
            </div>
          ) : (
            <div className="empty-list">
              <LibraryIcon size={22} />
              <span>No papers yet. A URL or a PDF is all you need.</span>
              <button className="text-button" onClick={onImport}>
                Import a paper <ArrowRight size={14} />
              </button>
            </div>
          )}
        </section>
        <aside className="overview-aside">
          <section className="getting-started">
            <span className="small-label">MAKE YOURSELF AT HOME</span>
            <h3>A good place to start</h3>
            <button onClick={onImport}>
              <span className="step-circle">1</span>
              <span>
                <strong>Bring your first paper</strong>
                <small>Paste a link or upload a PDF</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
            <Link href="/app/library">
              <span className="step-circle">2</span>
              <span>
                <strong>Find a place for your ideas</strong>
                <small>Organize with collections and tags</small>
              </span>
              <ArrowUpRight size={16} />
            </Link>
            <Link href="/app/teams">
              <span className="step-circle">3</span>
              <span>
                <strong>Invite a different perspective</strong>
                <small>Create a shared team library</small>
              </span>
              <ArrowUpRight size={16} />
            </Link>
          </section>
          <section>
            <div className="section-heading">
              <h2>Activity</h2>
              <span className="badge subtle">LIVE</span>
            </div>
            {activity.data?.length ? (
              <div className="activity-list">
                {activity.data.slice(0, 5).map((a) => (
                  <div key={a._id}>
                    <span className="activity-dot" />
                    <p>
                      <strong>{a.author}</strong> {a.action}
                      <span>{a.detail}</span>
                      <small>
                        {new Date(a.createdAt).toLocaleDateString()}
                      </small>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="activity-empty">
                <span className="activity-dot" />
                <div>
                  <strong>A fresh start.</strong>
                  <p>
                    As your library grows, your research activity appears here.
                  </p>
                </div>
              </div>
            )}
          </section>
          <div className="workspace-tip">
            <BookMarked size={19} />
            <div>
              <strong>A little less friction</strong>
              <p>
                Press <kbd>N</kbd> to add a paper, or <kbd>⌘ K</kbd> to search
                your workspace.
              </p>
            </div>
          </div>
        </aside>
      </div>
      {papers.some((p) => p.assignedTo === user._id) && (
        <section>
          <h2>Assigned to you</h2>
          {papers
            .filter((p) => p.assignedTo === user._id)
            .map((p) => (
              <PaperRow key={p._id} paper={p} />
            ))}
        </section>
      )}
    </>
  );
}
function PaperRow({ paper }: { paper: Paper }) {
  return (
    <Link href={`/app/papers/${paper._id}`} className="paper-row">
      <span className="file-icon">
        <FileText size={20} />
      </span>
      <div className="paper-row-info">
        <h3>{paper.title}</h3>
        <p>
          {paper.authors.slice(0, 3).join(", ") || "Authors not specified"}
          {paper.year ? ` · ${paper.year}` : ""}
        </p>
      </div>
      <span
        className={`status-pill ${paper.jobState === "ready" ? "" : "pending"}`}
      >
        {paper.jobState === "ready" || paper.jobState === "metadata"
          ? paper.status
          : paper.jobState}
      </span>
      <ArrowUpRight size={16} />
    </Link>
  );
}
function LibraryView({
  papers,
  library,
  collections,
  collection,
  onCollection,
  search,
  queue,
  onImport,
  refresh,
  notify,
}: {
  papers: Paper[];
  library: Library;
  collections: any[];
  collection: string;
  onCollection: (id: string) => void;
  search: string;
  queue: boolean;
  onImport: () => void;
  refresh: () => void;
  notify: (s: string) => void;
}) {
  const [view, setView] = useState("list");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<Paper | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [columns, setColumns] = useState(false);
  const [showAuthors, setShowAuthors] = useState(true);
  const activeCollection = collections.find((c) => c._id === collection);
  let shown = papers
    .filter((p) =>
      filter === "trash"
        ? p.deleted
        : filter === "archive"
          ? p.archived && !p.deleted
          : !p.deleted && !p.archived,
    )
    .filter((p) => matchPaper(p, search))
    .filter((p) => !queue || ["To read", "Reading"].includes(p.status))
    .filter(
      (p) =>
        !activeCollection ||
        (activeCollection.query
          ? matchPaper(p, activeCollection.query)
          : p.collectionIds.includes(collection)),
    )
    .filter((p) =>
      filter === "favorites"
        ? p.favorite
        : ["To read", "Reading", "Finished", "Reference"].includes(filter)
          ? p.status === filter
          : true,
    );
  shown = shown.sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title)
      : sort === "year"
        ? (b.year || 0) - (a.year || 0)
        : b.createdAt.localeCompare(a.createdAt),
  );
  async function bulk(fields: Record<string, unknown>) {
    setError("");
    try {
      for (const paperId of selected) {
        const existing = papers.find((p) => p._id === paperId);
        const patch = Array.isArray(fields.collectionIds)
          ? {
              ...fields,
              collectionIds: [
                ...new Set([
                  ...(existing?.collectionIds || []),
                  ...fields.collectionIds,
                ]),
              ],
            }
          : fields;
        await api(`papers/${paperId}`, "PATCH", patch);
      }
      setSelected([]);
      refresh();
      notify("Library updated.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow muted">{library.name.toUpperCase()}</div>
          <h1>
            {queue
              ? "Your reading queue"
              : activeCollection?.name || "Your library"}
            <span className="heading-count">{shown.length}</span>
          </h1>
          <p>
            {queue
              ? "One paper at a time. Make room for what comes next."
              : "All your sources. A little more organized."}
          </p>
        </div>
        <div className="heading-actions">
          <a
            className="btn secondary"
            href={`/api/export/bibtex?libraryId=${library._id}`}
          >
            <Download size={15} />
            Export
          </a>
          <Button
            onClick={onImport}
            variant="primary"
            disabled={library.role === "viewer"}
          >
            <Plus size={16} />
            Add paper
          </Button>
        </div>
      </div>
      {collection === "new" && (
        <form
          className="inline-form collection-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api(`libraries/${library._id}/collections`, "POST", {
                name,
                parentId: parent || null,
                ...(collectionQuery ? { query: collectionQuery } : {}),
              });
              setName("");
              setCollectionQuery("");
              onCollection("");
              refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Collection name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Language models"
            />
          </label>
          <label>
            Parent
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">None</option>
              {collections.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Saved search (optional)
            <input
              value={collectionQuery}
              onChange={(e) => setCollectionQuery(e.target.value)}
              placeholder="Match a title, author, or tag"
            />
          </label>
          <Button variant="primary" type="submit">
            Create
          </Button>
          <Button onClick={() => onCollection("")} type="button">
            Cancel
          </Button>
        </form>
      )}
      <div className="library-controls">
        <div className="filter-tabs">
          {[
            "all",
            "favorites",
            "To read",
            "Reading",
            "Finished",
            "archive",
            "trash",
          ].map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setSelected([]);
              }}
              className={filter === f ? "active" : ""}
            >
              {f === "all" ? (
                "All papers"
              ) : f === "favorites" ? (
                <>
                  <Star size={13} />
                  Favorites
                </>
              ) : f === "archive" ? (
                <>
                  <Archive size={13} />
                  Archive
                </>
              ) : f === "trash" ? (
                <>
                  <Trash2 size={13} />
                  Trash
                </>
              ) : (
                f
              )}
            </button>
          ))}
        </div>
        <div className="view-controls">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort papers"
          >
            <option value="newest">Recently added</option>
            <option value="title">Title</option>
            <option value="year">Year</option>
          </select>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Customize columns"
            onClick={() => setColumns(!columns)}
          >
            <SlidersHorizontal size={16} />
          </Button>
          <Button
            size="icon"
            variant={view === "list" ? "secondary" : "ghost"}
            aria-label="List view"
            onClick={() => setView("list")}
          >
            <List size={17} />
          </Button>
          <Button
            size="icon"
            variant={view === "grid" ? "secondary" : "ghost"}
            aria-label="Grid view"
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={16} />
          </Button>
        </div>
      </div>
      {columns && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showAuthors}
            onChange={(e) => setShowAuthors(e.target.checked)}
          />{" "}
          Show authors column
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {selected.length > 0 && (
        <div className="bulk-toolbar">
          <strong>{selected.length} selected</strong>
          <Button size="sm" onClick={() => bulk({ favorite: true })}>
            <Star size={14} />
            Favorite
          </Button>
          <Button size="sm" onClick={() => bulk({ status: "Finished" })}>
            <Check size={14} />
            Mark finished
          </Button>
          <Button
            size="sm"
            onClick={() => bulk({ archived: filter !== "archive" })}
          >
            <Archive size={14} />
            {filter === "archive" ? "Unarchive" : "Archive"}
          </Button>
          <Button
            size="sm"
            onClick={() => bulk({ deleted: filter !== "trash" })}
          >
            <Trash2 size={14} />
            {filter === "trash" ? "Restore" : "Move to trash"}
          </Button>
          <select
            aria-label="Move selected papers to collection"
            onChange={(e) => {
              if (e.target.value) bulk({ collectionIds: [e.target.value] });
            }}
            value=""
          >
            <option value="">Add to collection…</option>
            {collections
              .filter((c) => !c.query)
              .map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
          </select>
          <Button size="sm" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}
      {shown.length ? (
        view === "grid" ? (
          <div className="library-grid">
            {shown.map((p) => (
              <article key={p._id} className="library-paper">
                <div className="grid-paper-head">
                  <span className="file-icon">
                    <FileText size={24} />
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${p.title}`}
                    onClick={() => setEdit(p)}
                  >
                    <MoreHorizontal size={18} />
                  </Button>
                </div>
                <Link href={`/app/papers/${p._id}`}>
                  <h3>{p.title}</h3>
                  <p className="muted text-sm">
                    {p.authors.slice(0, 2).join(", ") ||
                      "Authors not specified"}
                  </p>
                </Link>
                <div className="paper-tags">
                  {p.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="grid-paper-bottom">
                  <span className="status-pill">{p.status}</span>
                  <span className="muted text-xs">{p.year || "No year"}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="library-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all papers"
                      checked={
                        selected.length === shown.length && shown.length > 0
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? shown.map((p) => p._id) : [],
                        )
                      }
                    />
                  </th>
                  <th>Title</th>
                  {showAuthors && <th>Authors</th>}
                  <th>Year</th>
                  <th>Status</th>
                  <th>Tags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.title}`}
                        checked={selected.includes(p._id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, p._id]
                              : selected.filter((id) => id !== p._id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <Link
                        className="table-title"
                        href={`/app/papers/${p._id}`}
                      >
                        <FileText size={17} />
                        <span>
                          {p.title}
                          {!["ready", "metadata"].includes(p.jobState) && (
                            <small
                              className={
                                p.jobState === "failed" ? "error" : "muted"
                              }
                            >
                              {p.jobState}
                            </small>
                          )}
                        </span>
                      </Link>
                    </td>
                    {showAuthors && (
                      <td className="author-cell">
                        {p.authors.slice(0, 2).join(", ") || "—"}
                      </td>
                    )}
                    <td>{p.year || "—"}</td>
                    <td>
                      <span className="status-pill">{p.status}</span>
                    </td>
                    <td>
                      {p.tags.slice(0, 2).map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${p.title}`}
                        onClick={() => setEdit(p)}
                      >
                        <MoreHorizontal size={18} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="large-empty">
          <div className="empty-icon">
            <LibraryIcon size={28} />
          </div>
          <h2>
            {search || filter !== "all"
              ? "No papers match this view."
              : "A home for your research."}
          </h2>
          <p>
            {search || filter !== "all"
              ? "Try another search or change your filters."
              : "Add a PDF, paste an arXiv link, or save a reference.\nEvery good idea begins with a first paper."}
          </p>
          <Button variant="primary" onClick={onImport}>
            <Plus size={16} />
            Add a paper
          </Button>
          <span className="muted text-xs">
            PDF files, direct URLs, arXiv, and DOI references
          </span>
        </div>
      )}
      <MetadataDialog
        paper={edit}
        close={() => setEdit(null)}
        collections={collections}
        library={library}
        onSave={refresh}
        notify={notify}
      />
    </>
  );
}
export function ImportDialog({
  open,
  close,
  library,
  onImported,
  notify,
  paperId,
}: {
  open: boolean;
  close: () => void;
  library: Library;
  onImported: () => void;
  notify: (s: string) => void;
  paperId?: string;
}) {
  const [tab, setTab] = useState("url");
  const [input, setInput] = useState("");
  const [references, setReferences] = useState("");
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setError("");
    if (file.size > 50 * 1024 * 1024) {
      setError("This file exceeds 50 MB.");
      return;
    }
    setBusy(true);
    setProgress(0);
    const form = new FormData();
    form.append("file", file);
    form.append("libraryId", library._id);
    if (paperId) form.append("paperId", paperId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/papers/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status >= 400)
          throw new Error(result.error?.message || "Upload failed.");
        onImported();
        close();
        notify(
          result.data.duplicate
            ? "This PDF is already in your library."
            : "PDF uploaded. Extracting pages…",
        );
      } catch (e) {
        setError((e as Error).message);
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setError("Upload failed. Check your connection and try again.");
    };
    xhr.send(form);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        tab === "references"
          ? await api("papers/import-references", "POST", {
              libraryId: library._id,
              text: references,
            })
          : tab === "metadata"
            ? await api("papers", "POST", {
                libraryId: library._id,
                title,
                authors: authors
                  .split(";")
                  .map((a) => a.trim())
                  .filter(Boolean),
                url: input || undefined,
              })
            : await api("papers/import-url", "POST", {
                libraryId: library._id,
                input,
              });
      onImported();
      close();
      notify(
        tab === "references"
          ? `${result.count} references imported.`
          : result.duplicate
            ? "This reference is already in your library."
            : tab === "metadata"
              ? "Reference saved."
              : "Import started. You can keep working.",
      );
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && close()}
      title={paperId ? "Attach a PDF" : "Bring a paper into your workspace"}
      description={`Adding to ${library.name}. Your original document stays intact.`}
    >
      <div className="dialog-tabs">
        {["url", "upload", "metadata", "references"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              setError("");
            }}
          >
            {t === "url" ? (
              <>
                <LinkIcon size={16} /> From a link
              </>
            ) : t === "upload" ? (
              <>
                <Upload size={16} /> Upload PDF
              </>
            ) : t === "references" ? (
              <>
                <BookMarked size={16} />
                BibTeX / RIS
              </>
            ) : (
              <>
                <FileText size={16} /> Reference
              </>
            )}
          </button>
        ))}
      </div>
      {tab === "upload" ? (
        <>
          <div
            className={`dropzone ${drag ? "drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
            }}
          >
            <Upload size={28} />
            <h3>Drop your PDF here</h3>
            <p>or choose a file from your device</p>
            <input
              type="file"
              ref={fileRef}
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.[0]) upload(e.target.files[0]);
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              Choose PDF
            </Button>
            <small>PDF only · Up to 50 MB</small>
          </div>
          {busy && (
            <>
              <div className="progress-track">
                <span style={{ width: `${progress}%` }} />
              </div>
              <p className="muted text-sm">Uploading {progress}%</p>
            </>
          )}
        </>
      ) : (
        <form onSubmit={submit}>
          {tab === "references" ? (
            <label>
              BibTeX or RIS references
              <textarea
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                rows={8}
                required
                placeholder={"@article{key, title={Paper title}, author={...}}"}
              />
            </label>
          ) : (
            <>
              {tab === "metadata" && (
                <>
                  <label>
                    Paper title
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      placeholder="The title of your reference"
                    />
                  </label>
                  <label>
                    Authors
                    <input
                      value={authors}
                      onChange={(e) => setAuthors(e.target.value)}
                      placeholder="Separate authors with semicolons"
                    />
                  </label>
                </>
              )}
              <label>
                {tab === "url"
                  ? "PDF URL, arXiv link, or DOI"
                  : "Source URL (optional)"}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  required={tab === "url"}
                  placeholder={
                    tab === "url" ? "https://arxiv.org/abs/…" : "https://…"
                  }
                />
              </label>
              <p className="field-help">
                {tab === "url"
                  ? "We download accessible PDFs and extract their pages. For publisher links, we save the reference if a PDF is unavailable."
                  : "You can attach a PDF later from the reader."}
              </p>
            </>
          )}
          <div className="dialog-footer">
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Plus size={16} />
              )}{" "}
              {tab === "url"
                ? "Import paper"
                : tab === "references"
                  ? "Import references"
                  : "Save reference"}
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
function MetadataDialog({
  paper,
  close,
  collections,
  library,
  onSave,
  notify,
}: {
  paper: Paper | null;
  close: () => void;
  collections: any[];
  library: Library;
  onSave: () => void;
  notify: (s: string) => void;
}) {
  const [error, setError] = useState("");
  return (
    <Modal
      open={!!paper}
      onOpenChange={(v) => !v && close()}
      title="Paper details"
      description="Keep your sources accurate and easy to find."
    >
      {paper && (
        <form
          key={paper._id}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const form = new FormData(e.currentTarget);
            try {
              await api(`papers/${paper._id}`, "PATCH", {
                title: form.get("title"),
                authors: String(form.get("authors"))
                  .split(";")
                  .map((a) => a.trim())
                  .filter(Boolean),
                year: form.get("year") ? Number(form.get("year")) : undefined,
                doi: String(form.get("doi")),
                venue: String(form.get("venue")),
                abstract: String(form.get("abstract")),
                citationKey: String(form.get("citationKey")),
                tags: String(form.get("tags"))
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                status: form.get("status"),
                collectionIds: form.getAll("collectionIds"),
              });
              onSave();
              close();
              notify("Paper details saved.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Title
            <input name="title" defaultValue={paper.title} required />
          </label>
          <label>
            Authors
            <input
              name="authors"
              defaultValue={paper.authors.join("; ")}
              placeholder="Separate with semicolons"
            />
          </label>
          <div className="form-row">
            <label>
              Year
              <input
                type="number"
                name="year"
                defaultValue={paper.year}
                min="1000"
                max="2100"
              />
            </label>
            <label>
              Status
              <select name="status" defaultValue={paper.status}>
                {["To read", "Reading", "Finished", "Reference"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              DOI
              <input name="doi" defaultValue={paper.doi} />
            </label>
            <label>
              Venue
              <input name="venue" defaultValue={paper.venue} />
            </label>
          </div>
          <label>
            Abstract
            <textarea name="abstract" rows={3} defaultValue={paper.abstract} />
          </label>
          <div className="form-row">
            <label>
              Tags
              <input
                name="tags"
                defaultValue={paper.tags.join(", ")}
                placeholder="Comma separated"
              />
            </label>
            <label>
              Citation key
              <input name="citationKey" defaultValue={paper.citationKey} />
            </label>
          </div>
          {collections.length > 0 && (
            <fieldset>
              <legend>Collections</legend>
              <div className="collection-checkboxes">
                {collections
                  .filter((c) => !c.query)
                  .map((c) => (
                    <label key={c._id} className="checkbox-label">
                      <input
                        type="checkbox"
                        name="collectionIds"
                        value={c._id}
                        defaultChecked={paper.collectionIds.includes(c._id)}
                      />
                      {c.name}
                    </label>
                  ))}
              </div>
            </fieldset>
          )}
          <div className="dialog-footer">
            <Button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(bibtex(paper));
                notify("BibTeX copied.");
              }}
            >
              <Copy size={15} />
              Copy BibTeX
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={library.role === "viewer"}
            >
              Save details
            </Button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
function GlobalNotes({ search }: { search: string }) {
  const notes = useQuery<(Note & { paperTitle: string })[]>({
    queryKey: ["all-notes"],
    queryFn: () => api("notes"),
    refetchInterval: 10000,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow muted">CONNECTED THINKING</div>
          <h1>Your notes</h1>
          <p>Ideas in your own words, with a path back to the source.</p>
        </div>
        <Link className="btn secondary" href="/app/library">
          <BookOpen size={16} />
          Open a paper
        </Link>
      </div>
      {notes.isPending ? (
        <div className="skeleton note-skeleton" />
      ) : notes.error ? (
        <p className="error">{notes.error.message}</p>
      ) : notes.data?.filter((n) =>
          `${n.title} ${n.content} ${n.paperTitle}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        ).length ? (
        <div className="global-notes">
          {notes.data
            .filter((n) =>
              `${n.title} ${n.content} ${n.paperTitle}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((n) => (
              <Link
                href={`/app/papers/${n.paperId}?tab=Notes`}
                className="note-entry"
                key={n._id}
              >
                <div>
                  <NotebookPen size={20} />
                  <span className="badge subtle">
                    {n.shared ? "TEAM NOTE" : "PRIVATE NOTE"}
                  </span>
                </div>
                <h2>{n.title}</h2>
                <p>
                  {n.content.replace(/[#*`]/g, "").slice(0, 220) ||
                    "Start writing in the paper workspace."}
                </p>
                <footer>
                  <span>{n.paperTitle}</span>
                  <ArrowUpRight size={16} />
                </footer>
              </Link>
            ))}
        </div>
      ) : (
        <div className="large-empty">
          <div className="empty-icon">
            <NotebookPen size={28} />
          </div>
          <h2>Keep the thought, not just the paper.</h2>
          <p>
            Open a paper and write a note beside the PDF.
            <br />
            All your connected thinking will appear here.
          </p>
          <Link className="btn primary" href="/app/library">
            Go to library
            <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
function Discover({
  papers,
  libraryId,
  search,
  interests,
  refresh,
  notify,
}: {
  papers: Paper[];
  libraryId: string;
  search: string;
  interests: string[];
  refresh: () => void;
  notify: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const local = papers
    .filter(
      (p) => !p.deleted && !dismissed.includes(p._id) && matchPaper(p, search),
    )
    .filter(
      (p) => !interests.length || interests.some((i) => matchPaper(p, i)),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow muted">FOLLOW YOUR CURIOSITY</div>
          <h1>Discover</h1>
          <p>New directions from your library and public research sources.</p>
        </div>
        <Link className="btn secondary" href="/app/settings">
          Edit interests
          <SlidersHorizontal size={15} />
        </Link>
      </div>
      <form
        className="discovery-search"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api(`discover/search?q=${encodeURIComponent(q)}`);
            setResults(r.results);
            setMessage(
              r.message ||
                `${r.results.length} public metadata results from Crossref`,
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Search size={20} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search public research by topic, author, or title"
          required
          aria-label="Search public research"
        />
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Searching…" : "Search papers"}
        </Button>
      </form>
      {message && <p className="field-help">{message}</p>}
      {results.length > 0 && (
        <section>
          <div className="section-heading">
            <h2>Public research</h2>
            <span className="muted text-xs">
              Metadata only. PDF access varies.
            </span>
          </div>
          {results.map((p) => (
            <article className="discovery-result" key={p.doi}>
              <span className="file-icon">
                <FileText size={22} />
              </span>
              <div>
                <h3>{p.title}</h3>
                <p className="muted text-sm">
                  {p.authors.slice(0, 3).join(", ")} ·{" "}
                  {p.year || "Year unknown"}
                </p>
                <span className="muted text-xs">
                  Found through Crossref for “{q}”
                </span>
              </div>
              <a
                className="btn ghost"
                href={p.url}
                target="_blank"
                rel="noreferrer"
              >
                Source
                <ArrowUpRight size={14} />
              </a>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await api("papers/import-url", "POST", {
                      libraryId,
                      input: p.doi,
                    });
                    refresh();
                    notify("Reference added. Checking for an accessible PDF.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <Plus size={14} />
                Add
              </Button>
            </article>
          ))}
        </section>
      )}
      <div className="section-heading recent-heading">
        <h2>From your library</h2>
        <span className="muted text-sm">
          {interests.length
            ? `Based on ${interests.join(", ")}`
            : "Your imported papers"}
        </span>
      </div>
      {local.length ? (
        <div className="paper-list">
          {local.map((p) => (
            <div className="local-recommendation" key={p._id}>
              <PaperRow paper={p} />
              <div>
                <span className="muted text-xs">
                  {interests.length
                    ? `Matches your interests: ${interests.filter((i) => matchPaper(p, i)).join(", ")}`
                    : "Already in your research library"}
                </span>
                <button
                  className="text-button"
                  onClick={() => setDismissed([...dismissed, p._id])}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="large-empty">
          <div className="empty-icon">
            <Compass size={28} />
          </div>
          <h2>Let your interests lead.</h2>
          <p>
            Add papers and choose your research interests.
            <br />
            We’ll surface relevant sources from your own library.
          </p>
          <Link className="btn secondary" href="/app/settings">
            Choose interests
            <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
function Teams({
  libraries,
  user,
  activeLibrary,
  notify,
  onChange,
}: {
  libraries: Library[];
  user: Identity;
  activeLibrary: Library;
  notify: (s: string) => void;
  onChange: () => void;
}) {
  const teamPath = usePathname();
  const [mode, setMode] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [invitation, setInvitation] = useState("");
  const [teamId, setTeamId] = useState(
    teamPath.split("/")[3] ||
      activeLibrary.teamId ||
      libraries.find((l) => l.teamId)?.teamId ||
      "",
  );
  const [error, setError] = useState("");
  const team = useQuery<any>({
    queryKey: ["team", teamId],
    queryFn: () => api(`teams/${teamId}`),
    enabled: !!teamId,
    refetchInterval: 5000,
  });
  const qc = useQueryClient();
  const refresh = () => {
    onChange();
    qc.invalidateQueries({ queryKey: ["team"] });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow muted">A SHARED PERSPECTIVE</div>
          <h1>Research together</h1>
          <p>
            A shared library, a simple invitation, a little more perspective.
          </p>
        </div>
        <div className="heading-actions">
          <Button onClick={() => setMode("join")}>Join a team</Button>
          <Button variant="primary" onClick={() => setMode("create")}>
            <Plus size={16} />
            Create team
          </Button>
        </div>
      </div>
      {invitation && (
        <div className="invitation-banner">
          <Users size={24} />
          <div>
            <strong>Your invitation code</strong>
            <p>
              Valid for 30 days. Share with trusted teammates. They join as
              editors.
            </p>
            <code>{invitation}</code>
          </div>
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(invitation);
              notify("Invitation copied.");
            }}
          >
            <Copy size={15} />
            Copy code
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Dismiss invitation"
            onClick={() => setInvitation("")}
          >
            <X size={16} />
          </Button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {libraries.some((l) => l.teamId) ? (
        <div className="team-layout">
          <nav className="team-list">
            {libraries
              .filter((l) => l.teamId)
              .map((l) => (
                <button
                  key={l._id}
                  onClick={() => {
                    setTeamId(l.teamId!);
                    setInvitation("");
                  }}
                  className={teamId === l.teamId ? "active" : ""}
                >
                  <span className="workspace-avatar">
                    <Users size={16} />
                  </span>
                  <div>
                    <strong>{l.name}</strong>
                    <small>{l.role}</small>
                  </div>
                </button>
              ))}
          </nav>
          <section className="team-detail">
            {team.isPending ? (
              <div className="skeleton note-skeleton" />
            ) : (
              team.data && (
                <>
                  <div className="section-heading">
                    <h2>{team.data.team.name}</h2>
                    <span className="badge subtle">{team.data.role}</span>
                  </div>
                  <p className="muted">
                    {team.data.team.description ||
                      "Shared papers and connected thinking."}
                  </p>
                  <h3 className="members-heading">Members</h3>
                  {team.data.members.map((m: any) => (
                    <div className="member-row" key={m.identityId}>
                      <span className="avatar">
                        {m.displayName?.slice(0, 1)}
                      </span>
                      <div>
                        <strong>
                          {m.displayName}
                          {m.identityId === user._id ? " (you)" : ""}
                        </strong>
                        <small>{m.role}</small>
                      </div>
                      {team.data.role === "owner" && m.role !== "owner" ? (
                        <>
                          <select
                            aria-label={`Role for ${m.displayName}`}
                            value={m.role}
                            onChange={async (e) => {
                              await api(
                                `teams/${teamId}/members/${m.identityId}`,
                                "PATCH",
                                { role: e.target.value },
                              );
                              refresh();
                            }}
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${m.displayName}`}
                            onClick={async () => {
                              await api(
                                `teams/${teamId}/members/${m.identityId}`,
                                "DELETE",
                              );
                              refresh();
                            }}
                          >
                            <X size={15} />
                          </Button>
                        </>
                      ) : (
                        <span className="muted text-sm">
                          {m.role === "owner" ? "Team owner" : "Member"}
                        </span>
                      )}
                    </div>
                  ))}
                  <div className="team-controls">
                    {team.data.role === "owner" ? (
                      <>
                        <Button
                          onClick={async () => {
                            try {
                              const r = await api(
                                `teams/${teamId}/rotate-code`,
                                "POST",
                                { revoke: false },
                              );
                              setInvitation(r.code);
                              notify("Previous invitation code revoked.");
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <RotateCcw size={15} />
                          Create new invitation
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await api(`teams/${teamId}/rotate-code`, "POST", {
                              revoke: true,
                            });
                            setInvitation("");
                            notify("All invitation codes revoked.");
                          }}
                        >
                          Revoke invitations
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={async () => {
                          await api(`teams/${teamId}/leave`, "POST", {});
                          setTeamId("");
                          refresh();
                          notify("You left the team.");
                        }}
                      >
                        Leave team
                      </Button>
                    )}
                  </div>
                  <p className="field-help">
                    Reading progress stays personal. Shared notes use version
                    checks to protect concurrent edits.
                  </p>
                </>
              )
            )}
          </section>
        </div>
      ) : (
        <div className="large-empty">
          <div className="empty-icon">
            <Users size={28} />
          </div>
          <h2>Good research welcomes another view.</h2>
          <p>
            Create a team to share papers, notes, and highlights.
            <br />
            Invite friends with a code. No email setup needed.
          </p>
          <Button variant="primary" onClick={() => setMode("create")}>
            <Plus size={16} />
            Create your first team
          </Button>
        </div>
      )}
      <Modal
        open={!!mode}
        onOpenChange={(v) => !v && setMode("")}
        title={
          mode === "create" ? "Create a research team" : "Join a research team"
        }
        description="Lightweight access for a small, trusted group."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              const r =
                mode === "create"
                  ? await api("teams", "POST", { name, description: "" })
                  : await api("teams/join", "POST", { code });
              setTeamId(r.teamId);
              if (r.code) setInvitation(r.code);
              refresh();
              setMode("");
              notify(
                mode === "create" ? "Team created." : "You joined the team.",
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {mode === "create" ? (
            <label>
              Team name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Friday reading group"
              />
            </label>
          ) : (
            <label>
              Invitation code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="LAB-…"
              />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <div className="dialog-footer">
            <Button onClick={() => setMode("")} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {mode === "create" ? "Create team" : "Join team"}
              <ArrowRight size={15} />
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
function SettingsView({
  settings,
  aiConfigured,
  user,
  notify,
  onSave,
}: {
  settings: Settings;
  aiConfigured: boolean;
  user: Identity;
  notify: (s: string) => void;
  onSave: () => void;
}) {
  const [value, setValue] = useState({ ...defaultSettings, ...settings });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => api("usage") });
  function change<K extends keyof Settings>(key: K, v: Settings[K]) {
    setValue({ ...value, [key]: v });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow muted">MAKE IT YOURS</div>
          <h1>Settings</h1>
          <p>A few preferences for a workspace that feels like yours.</p>
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("settings", "PATCH", value);
              onSave();
              notify("Preferences saved.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save changes"}
          <Check size={16} />
        </Button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="settings-layout">
        <section className="settings-section">
          <div className="settings-heading">
            <Sun size={20} />
            <div>
              <h2>Workspace</h2>
              <p>Small details that make a long reading session easier.</p>
            </div>
          </div>
          <div className="settings-fields">
            <label>
              Appearance
              <select
                value={value.theme}
                onChange={(e) => change("theme", e.target.value)}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </label>
            <label>
              Text size
              <select
                value={value.fontSize}
                onChange={(e) => change("fontSize", Number(e.target.value))}
              >
                <option value={12}>Compact</option>
                <option value={14}>Default</option>
                <option value={16}>Comfortable</option>
                <option value={18}>Large</option>
              </select>
            </label>
            <label>
              Citation style
              <select
                value={value.citationStyle}
                onChange={(e) => change("citationStyle", e.target.value)}
              >
                <option>APA</option>
                <option>IEEE</option>
              </select>
            </label>
            <label>
              Research interests
              <input
                value={value.interests.join(", ")}
                onChange={(e) =>
                  change(
                    "interests",
                    e.target.value.split(",").map((i) => i.trim()),
                  )
                }
                placeholder="Agents, Memory, Reinforcement learning"
              />
              <small>Comma separated. Used for local recommendations.</small>
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-heading">
            <Sparkles size={20} />
            <div>
              <h2>Study assistant</h2>
              <p>Powered by OpenRouter. API keys stay on the server.</p>
            </div>
            <span className={`status-pill ${aiConfigured ? "" : "pending"}`}>
              {aiConfigured ? "Configured" : "Setup needed"}
            </span>
          </div>
          {!aiConfigured && (
            <div className="setup-message">
              <CircleHelp size={20} />
              <p>
                Set <code>OPENROUTER_API_KEY</code> in your server environment
                and restart the app. Reading, notes, and collaboration already
                work.
              </p>
            </div>
          )}
          <div className="settings-fields">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={value.aiEnabled}
                onChange={(e) => change("aiEnabled", e.target.checked)}
              />
              Enable AI study features
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={value.streaming}
                onChange={(e) => change("streaming", e.target.checked)}
              />
              Stream answers as they arrive
            </label>
            <label>
              Chat model ID
              <input
                value={value.chatModel}
                onChange={(e) => change("chatModel", e.target.value)}
                placeholder="provider/model-id"
              />
              <small>
                Use an available model ID from your OpenRouter account.
              </small>
            </label>
            <label>
              Lightweight model ID
              <input
                value={value.fastModel}
                onChange={(e) => change("fastModel", e.target.value)}
                placeholder="Optional; defaults to chat model"
              />
            </label>
            <div className="form-row">
              <label>
                Temperature
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={value.temperature}
                  onChange={(e) =>
                    change("temperature", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Maximum response tokens
                <input
                  type="number"
                  min="100"
                  max="12000"
                  value={value.maxOutputTokens}
                  onChange={(e) =>
                    change("maxOutputTokens", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <label>
              Monthly spend limit (USD)
              <input
                type="number"
                min="0"
                value={value.spendLimit}
                onChange={(e) => change("spendLimit", Number(e.target.value))}
              />
              <small>
                Approximate provider-reported cost. Zero disables the limit.
              </small>
            </label>
            <p className="field-help">
              {usage.data?.requests || 0} requests · {usage.data?.tokens || 0}{" "}
              tokens · ${Number(usage.data?.cost || 0).toFixed(4)} reported
              total
            </p>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-heading">
            <ShieldCheck size={20} />
            <div>
              <h2>Privacy & identity</h2>
              <p>You are signed in as {user.displayName}.</p>
            </div>
          </div>
          <div className="settings-fields">
            <p className="field-help">
              Your papers are stored privately on this server. When you invoke
              AI, retrieved excerpts and questions are sent to OpenRouter. No
              public sharing links are created. Recovery keys restore identity;
              team invitation codes do not.
            </p>
            <Button variant="ghost" onClick={() => setReset(true)}>
              Sign out of this browser
            </Button>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-heading">
            <span className="keyboard-symbol">⌘</span>
            <div>
              <h2>Keyboard shortcuts</h2>
              <p>Stay in your reading flow.</p>
            </div>
          </div>
          <div className="shortcut-grid">
            <span>
              Search workspace <kbd>⌘ K</kbd>
            </span>
            <span>
              Add paper <kbd>N</kbd>
            </span>
            <span>
              Search <kbd>/</kbd>
            </span>
            <span>
              Previous / next page <kbd>[ / ]</kbd>
            </span>
            <span>
              Close dialog <kbd>Esc</kbd>
            </span>
          </div>
        </section>
      </div>
      <Modal
        open={reset}
        onOpenChange={setReset}
        title="Sign out of this browser?"
        description="Save your recovery key first. Without it, you cannot restore this identity after signing out."
      >
        <div className="dialog-footer">
          <Button onClick={() => setReset(false)}>Stay signed in</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await api("identity/reset", "POST", {});
              location.replace(new URL("/", location.origin).href);
            }}
          >
            Sign out
          </Button>
        </div>
      </Modal>
    </>
  );
}
