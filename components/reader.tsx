"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BookOpen,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCw,
  Search,
  Download,
  Printer,
  Highlighter,
  Underline,
  MessageSquare,
  Square,
  Hand,
  BookMarked,
  PanelLeft,
  Sparkles,
  NotebookPen,
  Target,
  ArrowUp,
  Check,
  Copy,
  Trash2,
  X,
  Send,
  MoreHorizontal,
  FileText,
  Save,
  List,
  ChevronDown,
  ExternalLink,
  GripVertical,
  GraduationCap,
  StopCircle,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "./ui/button";
import { Modal, ImportDialog } from "./workspace";
import { api, downloadText } from "@/lib/client";
import { normalizeRect, rotateRect } from "@/lib/research";
import type {
  Paper,
  Identity,
  Settings,
  PageText,
  Rect,
  Annotation,
  Goal,
  Note,
  Message,
  Source,
  Library,
} from "@/lib/types";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
const pdfOptions = {
  cMapUrl: "/pdf/cmaps/",
  standardFontDataUrl: "/pdf/standard_fonts/",
  wasmUrl: "/pdf/wasm/",
  isEvalSupported: false,
};
const quickActions = [
  "Summarize in 5 bullets",
  "What’s the main contribution?",
  "Explain methodology",
  "What are the limitations?",
  "Define key terms",
  "Read section by section",
];
type Selection = { quote: string; rects: Rect[]; pageIndex: number };
export default function Reader({
  paperId,
  user,
  settings,
  aiConfigured,
  notify,
}: {
  paperId: string;
  user: Identity;
  settings: Settings;
  aiConfigured: boolean;
  notify: (s: string) => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery<{ paper: Paper; library: Library; reading: any }>({
    queryKey: ["paper", paperId],
    queryFn: () => api(`papers/${paperId}`),
    refetchInterval: (d) =>
      ["ready", "metadata", "failed", "cancelled"].includes(
        d.state.data?.paper.jobState || "",
      )
        ? 10000
        : 2000,
  });
  const annotations = useQuery<Annotation[]>({
    queryKey: ["annotations", paperId],
    queryFn: () => api(`papers/${paperId}/annotations`),
    refetchInterval: 6000,
  });
  const pages = useQuery<PageText[]>({
    queryKey: ["pages", paperId, detail.data?.paper.jobState],
    queryFn: () => api(`papers/${paperId}/pages`),
    enabled: detail.data?.paper.jobState === "ready",
  });
  const [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0),
    [tab, setTab] = useState("Ask AI"),
    [rail, setRail] = useState(false),
    [split, setSplit] = useState(60),
    [mobilePane, setMobilePane] = useState("pdf"),
    [tool, setTool] = useState("select"),
    [selection, setSelection] = useState<Selection | null>(null),
    [color, setColor] = useState("amber"),
    [shared, setShared] = useState(false),
    [comment, setComment] = useState(""),
    [annotationDialog, setAnnotationDialog] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [hit, setHit] = useState(0),
    [searchOpen, setSearchOpen] = useState(false),
    [width, setWidth] = useState(640),
    [outline, setOutline] = useState<any[]>([]),
    [attach, setAttach] = useState(false),
    [quiz, setQuiz] = useState(false),
    [actionsOpen, setActionsOpen] = useState(false),
    [copyTarget, setCopyTarget] = useState(""),
    [restored, setRestored] = useState(false),
    [pulse, setPulse] = useState(""),
    [scrollOffset, setScrollOffset] = useState(0);
  const scroll = useRef<HTMLDivElement>(null),
    pageEl = useRef<HTMLDivElement>(null),
    pdfDoc = useRef<PDFDocumentProxy | null>(null),
    startPoint = useRef<{ x: number; y: number } | null>(null),
    shell = useRef<HTMLDivElement>(null);
  const paper = detail.data?.paper;
  const library = detail.data?.library;
  const availableLibraries = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => api("libraries"),
  });
  const teamMembers = useQuery<any>({
    queryKey: ["team", library?.teamId],
    queryFn: () => api(`teams/${library?.teamId}`),
    enabled: !!library?.teamId,
  });
  const hits = useMemo(
    () =>
      query.trim()
        ? pages.data?.filter((p) =>
            p.text.toLowerCase().includes(query.toLowerCase()),
          ) || []
        : [],
    [query, pages.data],
  );
  useEffect(() => {
    if (detail.data && !restored) {
      const r = detail.data.reading;
      setPage(r?.page || 1);
      setZoom(r?.zoom || 1);
      setRotation(r?.rotation || 0);
      setSplit(r?.split || 60);
      setTab(
        new URLSearchParams(location.search).get("tab") || r?.tab || "Ask AI",
      );
      setScrollOffset(r?.scrollOffset || 0);
      setRestored(true);
    }
  }, [detail.data, restored]);
  useEffect(() => {
    if (!scroll.current) return;
    const obs = new ResizeObserver((entries) =>
      setWidth(Math.max(260, entries[0].contentRect.width - 64)),
    );
    obs.observe(scroll.current);
    return () => obs.disconnect();
  }, [detail.isPending]);
  useEffect(() => {
    if (!restored || !paper?.pageCount) return;
    const timer = setTimeout(
      () =>
        api(`papers/${paperId}/reading`, "PATCH", {
          page,
          zoom,
          rotation,
          tab,
          split,
          scrollOffset,
        }).catch((e) => setError(e.message)),
      800,
    );
    return () => clearTimeout(timer);
  }, [
    page,
    zoom,
    rotation,
    tab,
    split,
    scrollOffset,
    restored,
    paper?.pageCount,
    paperId,
  ]);
  const go = useCallback(
    (n: number) => {
      setPage(Math.max(1, Math.min(paper?.pageCount || 1, Math.floor(n || 1))));
      setSelection(null);
      if (scroll.current) scroll.current.scrollTop = 0;
      setScrollOffset(0);
      setMobilePane("pdf");
    },
    [paper?.pageCount],
  );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement).matches(
          "input,textarea,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "[") go(page - 1);
      if (e.key === "]") go(page + 1);
      if (e.key === "Escape") setSelection(null);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, go]);
  async function loadPdf(pdf: PDFDocumentProxy) {
    pdfDoc.current = pdf;
    const items = await pdf.getOutline();
    if (items) setOutline(items);
  }
  async function destination(dest: any) {
    if (!pdfDoc.current) return;
    const resolved =
      typeof dest === "string"
        ? await pdfDoc.current.getDestination(dest)
        : dest;
    if (resolved) {
      const index =
        typeof resolved[0] === "number"
          ? resolved[0]
          : await pdfDoc.current.getPageIndex(resolved[0]);
      go(index + 1);
    }
  }
  function captureSelection() {
    if (tool === "rectangle") return;
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount || !pageEl.current) return;
    const range = s.getRangeAt(0);
    if (!pageEl.current.contains(range.commonAncestorContainer)) return;
    const box = pageEl.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) =>
        rotateRect(
          normalizeRect(
            {
              x: r.x - box.x,
              y: r.y - box.y,
              width: r.width,
              height: r.height,
            },
            box.width,
            box.height,
          ),
          360 - rotation,
        ),
      );
    if (rects.length) {
      const captured = {
        quote: s.toString().slice(0, 10000),
        rects,
        pageIndex: page - 1,
      };
      setSelection(captured);
      if (tool === "highlight" || tool === "underline")
        addAnnotation(tool, "", captured);
      else if (tool === "comment") setAnnotationDialog(true);
    }
  }
  async function addAnnotation(
    kind: Annotation["kind"],
    text = comment,
    captured = selection,
  ) {
    try {
      await api(`papers/${paperId}/annotations`, "POST", {
        pageIndex: captured?.pageIndex ?? page - 1,
        kind,
        quote: captured?.quote || "",
        comment: text,
        color,
        rects: captured?.rects || [],
        shared,
      });
      qc.invalidateQueries({ queryKey: ["annotations", paperId] });
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      setAnnotationDialog(false);
      setComment("");
      notify(kind === "bookmark" ? "Page bookmarked." : "Annotation saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function exportAnnotated() {
    try {
      const { PDFDocument, rgb } = await import("pdf-lib");
      const bytes = await (
        await fetch(`/api/papers/${paperId}/pdf`)
      ).arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const pdfPages = doc.getPages();
      for (const a of annotations.data || []) {
        const p = pdfPages[a.pageIndex];
        if (!p) continue;
        const colors: Record<string, [number, number, number]> = {
          amber: [1, 0.8, 0.2],
          green: [0.4, 0.8, 0.5],
          blue: [0.4, 0.7, 1],
          pink: [1, 0.5, 0.7],
        };
        for (const r of a.rects) {
          p.drawRectangle({
            x: r.x * p.getWidth(),
            y: (1 - r.y - r.height) * p.getHeight(),
            width: r.width * p.getWidth(),
            height: r.height * p.getHeight(),
            color: rgb(...colors[a.color]),
            opacity: 0.25,
          });
        }
      }
      const out = await doc.save();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(out)], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "margin-annotated.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(
        "Highlight geometry embedded. Comments remain in app / JSON export.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function jumpAnnotation(a: Annotation) {
    go(a.pageIndex + 1);
    setPulse(a._id);
    setTimeout(() => {
      const r = a.rects[0];
      if (r && scroll.current && pageEl.current) {
        const rr = rotateRect(r, rotation);
        scroll.current.scrollTop = rr.y * pageEl.current.clientHeight - 100;
      }
    }, 350);
    setTimeout(() => setPulse(""), 2500);
  }
  if (detail.isPending)
    return (
      <div className="reader-loading">
        <div className="skeleton boot-line" />
        <p>Opening paper workspace…</p>
      </div>
    );
  if (detail.error || !paper)
    return (
      <div className="large-empty">
        <h1>Paper unavailable</h1>
        <p className="error">{detail.error?.message}</p>
        <Link href="/app/library" className="btn secondary">
          <ArrowLeft size={16} />
          Back to library
        </Link>
      </div>
    );
  return (
    <div
      role="main"
      id="main"
      className="reader"
      style={{ fontSize: settings.fontSize }}
    >
      <header className="reader-header">
        <Link
          className="reader-back"
          href="/app/library"
          aria-label="Back to library"
        >
          <ArrowLeft size={19} />
        </Link>
        <span className="reader-brand">
          m<span>.</span>
        </span>
        <div className="reader-title">
          <h1>{paper.title}</h1>
          <span>
            {paper.authors.slice(0, 3).join(", ") || "Authors not specified"}
            {paper.year ? ` · ${paper.year}` : ""}
          </span>
        </div>
        <span className="reader-save">
          <Check size={14} /> Saved
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={library?.role === "viewer"}
          onClick={async () => {
            try {
              await api(`papers/${paperId}`, "PATCH", {
                aiDisabled: !paper.aiDisabled,
              });
              detail.refetch();
              notify(
                paper.aiDisabled
                  ? "AI enabled for this paper."
                  : "AI disabled for this paper.",
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {paper.aiDisabled ? "AI off" : "AI on"}
        </Button>
        <select
          className="reader-status"
          aria-label="Paper reading status"
          value={paper.status}
          disabled={library?.role === "viewer"}
          onChange={async (e) => {
            try {
              await api(`papers/${paperId}`, "PATCH", {
                status: e.target.value,
              });
              qc.invalidateQueries({ queryKey: ["paper", paperId] });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {["To read", "Reading", "Finished", "Reference"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Button size="sm" onClick={() => setQuiz(true)}>
          <GraduationCap size={16} />
          Evaluate knowledge
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Paper actions"
          onClick={() => setActionsOpen(true)}
        >
          <MoreHorizontal size={19} />
        </Button>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </Button>
        </div>
      )}
      <div
        className="reader-workspace"
        ref={shell}
        style={{ "--pdf-split": `${split}%` } as React.CSSProperties}
      >
        <section
          className={`pdf-pane ${mobilePane === "pdf" ? "mobile-active" : ""}`}
        >
          <div className="pdf-toolbar">
            <Button
              size="icon"
              variant={rail ? "secondary" : "ghost"}
              aria-label="Toggle outline"
              onClick={() => setRail(!rail)}
            >
              <PanelLeft size={17} />
            </Button>
            <div className="toolbar-divider" />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Previous page"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft size={17} />
            </Button>
            <input
              className="page-number"
              type="number"
              aria-label="Current page"
              value={page}
              min={1}
              max={paper.pageCount || 1}
              onChange={(e) => go(Number(e.target.value))}
            />
            <span className="page-total">/ {paper.pageCount || "—"}</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next page"
              onClick={() => go(page + 1)}
              disabled={page >= (paper.pageCount || 1)}
            >
              <ChevronRight size={17} />
            </Button>
            <div className="toolbar-divider" />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
            >
              <Minus size={16} />
            </Button>
            <select
              value={zoom}
              aria-label="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[
                ...new Set([
                  0.25,
                  0.5,
                  0.75,
                  1,
                  1.25,
                  1.5,
                  1.75,
                  2,
                  2.5,
                  3,
                  4,
                  zoom,
                ]),
              ]
                .sort((a, b) => a - b)
                .map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
            </select>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(4, zoom + 0.25))}
            >
              <Plus size={16} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoom(1)}
              title="Fit width"
            >
              Fit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (scroll.current && pageEl.current)
                  setZoom(
                    Math.max(
                      0.25,
                      Math.min(
                        4,
                        (zoom * (scroll.current.clientHeight - 48)) /
                          pageEl.current.clientHeight,
                      ),
                    ),
                  );
              }}
              title="Fit page"
            >
              Page
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Rotate page"
              onClick={() => setRotation((rotation + 90) % 360)}
            >
              <RotateCw size={16} />
            </Button>
            <div className="toolbar-spacer" />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Search PDF"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search size={17} />
            </Button>
            <a
              href={`/api/papers/${paperId}/pdf`}
              download
              className="btn ghost icon-button"
              aria-label="Download PDF"
            >
              <Download size={17} />
            </a>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Print PDF"
              onClick={() => {
                const w = window.open(`/api/papers/${paperId}/pdf`, "_blank");
                if (w) w.addEventListener("load", () => w.print());
              }}
            >
              <Printer size={17} />
            </Button>
          </div>
          {searchOpen && (
            <div className="pdf-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHit(0);
                }}
                placeholder="Find in paper…"
                aria-label="Find in paper"
              />
              <span>{hits.length} pages</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Previous search result"
                disabled={!hits.length}
                onClick={() => {
                  const n = (hit - 1 + hits.length) % hits.length;
                  setHit(n);
                  go(hits[n].pageIndex + 1);
                }}
              >
                <ChevronLeft size={15} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Next search result"
                disabled={!hits.length}
                onClick={() => {
                  const n = hit % hits.length;
                  go(hits[n].pageIndex + 1);
                  setHit(n + 1);
                }}
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          )}
          <div className="pdf-content">
            {rail && (
              <aside className="outline-rail">
                <h3>Document</h3>
                {outline.length ? (
                  outline.map((o, i) => (
                    <button key={i} onClick={() => destination(o.dest)}>
                      {o.title}
                    </button>
                  ))
                ) : (
                  <p className="muted text-xs">No embedded outline</p>
                )}
                <h3>Pages</h3>
                <div className="page-links">
                  {Array.from({ length: paper.pageCount || 0 }, (_, i) => (
                    <button
                      key={i}
                      className={page === i + 1 ? "active" : ""}
                      onClick={() => go(i + 1)}
                    >
                      <FileText size={18} />
                      {i + 1}
                    </button>
                  ))}
                </div>
              </aside>
            )}
            <div
              className={`pdf-scroll ${tool === "rectangle" ? "area-tool" : ""}`}
              ref={scroll}
              onScroll={(e) => setScrollOffset(e.currentTarget.scrollTop)}
            >
              {paper.jobState === "ready" ? (
                <>
                  <Document
                    file={`/api/papers/${paperId}/pdf`}
                    options={pdfOptions}
                    onLoadSuccess={(pdf) =>
                      loadPdf(pdf as unknown as PDFDocumentProxy)
                    }
                    onLoadError={(e) =>
                      setError(`PDF could not load: ${e.message}`)
                    }
                    onItemClick={({ pageNumber }) => go(pageNumber)}
                    loading={<div className="skeleton pdf-skeleton" />}
                  >
                    <div
                      className="pdf-page-container"
                      ref={pageEl}
                      onMouseUp={captureSelection}
                      onPointerDown={(e) => {
                        if (tool === "rectangle" && pageEl.current) {
                          const b = pageEl.current.getBoundingClientRect();
                          startPoint.current = {
                            x: e.clientX - b.x,
                            y: e.clientY - b.y,
                          };
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }
                      }}
                      onPointerUp={(e) => {
                        if (
                          tool === "rectangle" &&
                          startPoint.current &&
                          pageEl.current
                        ) {
                          const b = pageEl.current.getBoundingClientRect();
                          const end = {
                            x: e.clientX - b.x,
                            y: e.clientY - b.y,
                          };
                          const start = startPoint.current;
                          const r = normalizeRect(
                            {
                              x: Math.min(start.x, end.x),
                              y: Math.min(start.y, end.y),
                              width: Math.abs(start.x - end.x),
                              height: Math.abs(start.y - end.y),
                            },
                            b.width,
                            b.height,
                          );
                          if (r.width > 0.005 && r.height > 0.005) {
                            setSelection({
                              quote: "",
                              pageIndex: page - 1,
                              rects: [rotateRect(r, 360 - rotation)],
                            });
                            setAnnotationDialog(true);
                          }
                          startPoint.current = null;
                        }
                      }}
                    >
                      <Page
                        pageNumber={page}
                        width={width * zoom}
                        rotate={rotation}
                        devicePixelRatio={Math.min(
                          2,
                          window.devicePixelRatio || 1,
                        )}
                        renderTextLayer
                        renderAnnotationLayer
                        onRenderSuccess={() => {
                          if (scroll.current && scrollOffset > 0)
                            scroll.current.scrollTop = scrollOffset;
                        }}
                        customTextRenderer={
                          query
                            ? ({ str }) => {
                                const escaped = str
                                  .replace(/&/g, "&amp;")
                                  .replace(/</g, "&lt;")
                                  .replace(/>/g, "&gt;");
                                const safe = query.replace(
                                  /[.*+?^${}()|[\]\\]/g,
                                  "\\$&",
                                );
                                return escaped.replace(
                                  new RegExp(safe, "gi"),
                                  (m) => `<mark>${m}</mark>`,
                                );
                              }
                            : undefined
                        }
                        loading={<div className="skeleton pdf-skeleton" />}
                      />
                      <div className="annotation-layer" aria-hidden="true">
                        {annotations.data
                          ?.filter((a) => a.pageIndex === page - 1)
                          .flatMap((a) =>
                            a.rects.map((r, i) => {
                              const rect = rotateRect(r, rotation);
                              return (
                                <div
                                  key={`${a._id}-${i}`}
                                  className={`pdf-annotation ${a.kind} ${a.color} ${pulse === a._id ? "pulse" : ""}`}
                                  style={{
                                    left: `${rect.x * 100}%`,
                                    top: `${rect.y * 100}%`,
                                    width: `${rect.width * 100}%`,
                                    height: `${rect.height * 100}%`,
                                  }}
                                  title={a.comment || a.quote}
                                />
                              );
                            }),
                          )}
                      </div>
                    </div>
                  </Document>
                  <div className="pdf-page-footer">
                    <Button
                      size="sm"
                      onClick={() => go(page - 1)}
                      disabled={page <= 1}
                    >
                      <ChevronLeft size={15} />
                      Previous
                    </Button>
                    <span>
                      Page {page} of {paper.pageCount}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => go(page + 1)}
                      disabled={page >= paper.pageCount!}
                    >
                      Next
                      <ChevronRight size={15} />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="pdf-unavailable">
                  <div className="empty-icon">
                    <FileText size={30} />
                  </div>
                  <h2>
                    {["queued", "downloading", "parsing", "indexing"].includes(
                      paper.jobState,
                    )
                      ? "Preparing your paper…"
                      : "Your reference is saved."}
                  </h2>
                  <p>
                    {paper.jobError ||
                      "Attach a PDF to read, highlight, and study this paper."}
                  </p>
                  {["queued", "downloading", "parsing", "indexing"].includes(
                    paper.jobState,
                  ) ? (
                    <>
                      <div className="ingestion-steps">
                        {["queued", "downloading", "parsing", "indexing"].map(
                          (s) => (
                            <span
                              key={s}
                              className={s === paper.jobState ? "active" : ""}
                            >
                              {s}
                            </span>
                          ),
                        )}
                      </div>
                      <Button
                        onClick={async () => {
                          await api(`papers/${paperId}/cancel`, "POST", {});
                          detail.refetch();
                        }}
                      >
                        Cancel import
                      </Button>
                    </>
                  ) : (
                    <div className="heading-actions">
                      <Button variant="primary" onClick={() => setAttach(true)}>
                        <Plus size={16} />
                        Attach PDF
                      </Button>
                      {paper.jobState === "failed" && (
                        <Button
                          onClick={async () => {
                            await api(`papers/${paperId}/retry`, "POST", {});
                            detail.refetch();
                          }}
                        >
                          <RefreshCw size={15} />
                          Retry import
                        </Button>
                      )}
                      {paper.url && (
                        <a
                          className="btn secondary"
                          href={paper.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source
                          <ExternalLink size={15} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="annotation-toolbar">
            <div className="tool-buttons">
              {[
                { name: "select", icon: Hand, label: "Select text" },
                { name: "highlight", icon: Highlighter, label: "Highlight" },
                { name: "underline", icon: Underline, label: "Underline" },
                { name: "rectangle", icon: Square, label: "Area note" },
                { name: "comment", icon: MessageSquare, label: "Comment" },
              ].map((t) => (
                <Button
                  key={t.name}
                  size="icon"
                  variant={tool === t.name ? "secondary" : "ghost"}
                  aria-label={t.label}
                  onClick={() => {
                    setTool(t.name);
                    if (selection) {
                      if (t.name === "highlight" || t.name === "underline")
                        addAnnotation(t.name);
                      else if (t.name === "comment") setAnnotationDialog(true);
                    }
                  }}
                >
                  <t.icon size={17} />
                </Button>
              ))}
              <div className="toolbar-divider" />
              {["amber", "green", "blue", "pink"].map((c) => (
                <button
                  key={c}
                  aria-label={`${c} annotation color`}
                  onClick={() => setColor(c)}
                  className={`color-swatch ${c} ${color === c ? "active" : ""}`}
                />
              ))}
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Bookmark page"
              onClick={() => addAnnotation("bookmark", "Page bookmark")}
            >
              <BookMarked size={17} />
            </Button>
            <span className="muted text-xs">
              Select a passage to annotate or ask AI
            </span>
          </div>
          {selection && !annotationDialog && (
            <div className="selection-menu">
              <span className="selected-quote">
                “{selection.quote.slice(0, 90)}”
              </span>
              <Button size="sm" onClick={() => addAnnotation("highlight")}>
                <Highlighter size={14} />
                Highlight
              </Button>
              <Button size="sm" onClick={() => setAnnotationDialog(true)}>
                <MessageSquare size={14} />
                Note
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setTab("Ask AI");
                  setMobilePane("study");
                }}
              >
                <Sparkles size={14} />
                Ask AI
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Dismiss selection"
                onClick={() => setSelection(null)}
              >
                <X size={14} />
              </Button>
            </div>
          )}
        </section>
        <div
          className="split-handle"
          role="separator"
          aria-label="Resize reading panes"
          aria-orientation="vertical"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit(Math.max(35, split - 5));
            if (e.key === "ArrowRight") setSplit(Math.min(75, split + 5));
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            const move = (event: PointerEvent) => {
              const bounds = shell.current?.getBoundingClientRect();
              if (bounds)
                setSplit(
                  Math.max(
                    35,
                    Math.min(
                      75,
                      ((event.clientX - bounds.x) / bounds.width) * 100,
                    ),
                  ),
                );
            };
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        >
          <GripVertical size={12} />
        </div>
        <aside
          className={`study-pane ${mobilePane === "study" ? "mobile-active" : ""}`}
        >
          <div className="study-tabs">
            {[
              { label: "Ask AI", icon: Sparkles },
              { label: "Study goals", icon: Target },
              { label: "Notes", icon: NotebookPen },
            ].map((t) => (
              <button
                key={t.label}
                className={tab === t.label ? "active" : ""}
                onClick={() => setTab(t.label)}
              >
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
          </div>
          {tab === "Ask AI" ? (
            <ChatPanel
              paper={paper}
              settings={settings}
              aiConfigured={aiConfigured}
              selection={selection}
              go={go}
              notify={notify}
            />
          ) : tab === "Study goals" ? (
            <GoalsPanel
              paperId={paperId}
              goAsk={(question) => {
                sessionStorage.setItem(`margin-question-${paperId}`, question);
                setTab("Ask AI");
              }}
              notify={notify}
            />
          ) : (
            <NotesPanel
              paper={paper}
              user={user}
              library={library!}
              annotations={annotations.data || []}
              onJump={jumpAnnotation}
              notify={notify}
              exportAnnotated={exportAnnotated}
            />
          )}
        </aside>
      </div>
      <div className="reader-mobile-tabs">
        <button
          className={mobilePane === "pdf" ? "active" : ""}
          onClick={() => setMobilePane("pdf")}
        >
          <FileText size={18} />
          Paper
        </button>
        <button
          className={mobilePane === "study" ? "active" : ""}
          onClick={() => setMobilePane("study")}
        >
          <NotebookPen size={18} />
          Study workspace
        </button>
      </div>
      <Modal
        open={annotationDialog}
        onOpenChange={setAnnotationDialog}
        title={tool === "rectangle" ? "Area note" : "Annotate this passage"}
        description="Keep a thought connected to its exact location in the paper."
      >
        {selection?.quote && (
          <blockquote className="annotation-quote">
            {selection.quote.slice(0, 800)}
          </blockquote>
        )}
        <label>
          Your note
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What stands out to you?"
            rows={4}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
          />
          Share with this library
        </label>
        <div className="dialog-footer">
          <Button onClick={() => setAnnotationDialog(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() =>
              addAnnotation(tool === "rectangle" ? "rectangle" : "comment")
            }
          >
            Save annotation
            <Check size={15} />
          </Button>
        </div>
      </Modal>
      <ImportDialog
        open={attach}
        close={() => setAttach(false)}
        library={library!}
        paperId={paperId}
        onImported={() => detail.refetch()}
        notify={notify}
      />
      <Modal
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        title="Paper actions"
        description="Organize this paper and share it with libraries you can edit."
      >
        <div className="paper-action-controls">
          <Button
            disabled={library?.role === "viewer"}
            onClick={async () => {
              try {
                await api(`papers/${paperId}`, "PATCH", {
                  favorite: !paper.favorite,
                });
                detail.refetch();
                notify(
                  paper.favorite
                    ? "Removed from favorites."
                    : "Added to favorites.",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {paper.favorite ? "Remove favorite" : "Add to favorites"}
          </Button>
          <label>
            Priority
            <select
              value={paper.priority || "Normal"}
              disabled={library?.role === "viewer"}
              onChange={async (e) => {
                await api(`papers/${paperId}`, "PATCH", {
                  priority: e.target.value,
                });
                detail.refetch();
              }}
            >
              {["Low", "Normal", "High"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {library?.teamId && (
            <label>
              Assign to teammate
              <select
                aria-label="Assign paper"
                disabled={library.role === "viewer"}
                value={paper.assignedTo || ""}
                onChange={async (e) => {
                  await api(`papers/${paperId}`, "PATCH", {
                    assignedTo: e.target.value || null,
                  });
                  detail.refetch();
                }}
              >
                <option value="">Unassigned</option>
                {teamMembers.data?.members.map((m: any) => (
                  <option key={m.identityId} value={m.identityId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Copy to another library
            <select
              value={copyTarget}
              onChange={(e) => setCopyTarget(e.target.value)}
            >
              <option value="">Choose a library</option>
              {availableLibraries.data
                ?.filter(
                  (l) => l._id !== paper.libraryId && l.role !== "viewer",
                )
                .map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            disabled={!copyTarget || library?.role === "viewer"}
            onClick={async () => {
              try {
                await api(`papers/${paperId}/copy`, "POST", {
                  libraryId: copyTarget,
                });
                setActionsOpen(false);
                notify(
                  "Paper copied. The PDF is stored once; each library keeps its own access.",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Copy size={15} />
            Copy paper
          </Button>
          <a
            className="btn secondary"
            href={`/api/export/json?libraryId=${paper.libraryId}&paperId=${paperId}`}
          >
            <Download size={15} />
            Export paper, notes & annotations
          </a>
          <Link className="btn ghost" href="/app/settings">
            Workspace settings
          </Link>
        </div>
      </Modal>
      <QuizDialog
        open={quiz}
        close={() => setQuiz(false)}
        paperId={paperId}
        go={go}
      />
    </div>
  );
}
function Markdown({
  content,
  go,
}: {
  content: string;
  go: (n: number) => void;
}) {
  const linked = content.replace(
    /\[p\.\s*(\d+)\]/g,
    (_, p) => `[p. ${p}](#page-${p})`,
  );
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("#page-") ? (
              <button
                className="citation"
                onClick={() => go(Number(href.slice(6)))}
              >
                {children}
              </button>
            ) : (
              <a
                href={href?.startsWith("http") ? href : undefined}
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            ),
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}
function ChatPanel({
  paper,
  settings,
  aiConfigured,
  selection,
  go,
  notify,
}: {
  paper: Paper;
  settings: Settings;
  aiConfigured: boolean;
  selection: Selection | null;
  go: (n: number) => void;
  notify: (s: string) => void;
}) {
  const history = useQuery<Message[]>({
    queryKey: ["chat", paper._id],
    queryFn: () => api(`papers/${paper._id}/chat-threads`),
  });
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showSources, setShowSources] = useState<number | null>(null),
    [chart, setChart] = useState<any>(null),
    [chartBusy, setChartBusy] = useState(false);
  const controller = useRef<AbortController | null>(null),
    end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (history.data) setMessages(history.data);
  }, [history.data]);
  useEffect(() => {
    const pending = sessionStorage.getItem(`margin-question-${paper._id}`);
    if (pending) {
      setQuestion(pending);
      sessionStorage.removeItem(`margin-question-${paper._id}`);
    }
  }, [paper._id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  async function ask(value: string) {
    if (!value.trim() || busy) return;
    setError("");
    setBusy(true);
    setQuestion("");
    const next = [
      ...messages,
      { role: "user" as const, content: value },
      { role: "assistant" as const, content: "" },
    ];
    setMessages(next);
    controller.current = new AbortController();
    let answer = "";
    let sources: Source[] = [];
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperId: paper._id,
          question: value,
          selectedText: selection?.quote,
        }),
        signal: controller.current.signal,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error.message);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          if (!event.startsWith("data: ")) continue;
          const d = JSON.parse(event.slice(6));
          if (d.type === "sources") sources = d.sources;
          if (d.type === "token") answer += d.content;
          if (d.type === "error") throw new Error(d.error);
          if (d.type === "done") answer = d.content;
          setMessages([
            ...next.slice(0, -1),
            {
              role: "assistant",
              content: answer,
              sources,
              ...(d.usage ? { usage: d.usage } : {}),
            },
          ]);
        }
      }
      qc.invalidateQueries({ queryKey: ["chat", paper._id] });
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "Response stopped."
          : (e as Error).message,
      );
      if (!answer) setMessages(next.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="chat-panel">
      <div className="assistant-meta">
        <span>
          <span className="status-dot" /> Paper study assistant
        </span>
        <button
          className="text-button"
          disabled={busy}
          onClick={async () => {
            await api(`papers/${paper._id}/chat-threads`, "DELETE");
            setMessages([]);
            qc.invalidateQueries({ queryKey: ["chat", paper._id] });
          }}
        >
          Clear thread
        </button>
      </div>
      <div className="chat-scroll">
        {!messages.length && (
          <div className="quick-start">
            <div className="assistant-symbol">
              <Sparkles size={24} />
            </div>
            <span className="small-label">A GOOD QUESTION GOES A LONG WAY</span>
            <h2>Let’s make sense of this paper.</h2>
            <p>
              Start with the big picture, or follow a question of your own.
              Answers stay connected to the source.
            </p>
            <div className="quick-start-label">QUICK START</div>
            <div className="quick-actions">
              {quickActions.map((action, i) => (
                <button
                  key={action}
                  disabled={busy}
                  onClick={() => ask(action)}
                >
                  <span>
                    {[FileText, Target, List, Search, BookMarked, BookOpen].map(
                      (Icon, j) =>
                        j === i ? <Icon key={j} size={16} /> : null,
                    )}
                  </span>
                  {action}
                  <ArrowUp size={14} />
                </button>
              ))}
            </div>
            {(!aiConfigured || !settings.aiEnabled) && (
              <div className="assistant-setup">
                <Sparkles size={17} />
                <p>
                  {!settings.aiEnabled
                    ? "AI is disabled in your preferences."
                    : "Connect OpenRouter to enable paper Q&A and study tools."}
                  <Link href="/app/settings">
                    Open settings <ChevronRight size={12} />
                  </Link>
                </p>
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <article key={i} className={`chat-message ${m.role}`}>
            <div className="message-author">
              {m.role === "assistant" ? (
                <>
                  <span className="mini-assistant">
                    <Sparkles size={13} />
                  </span>
                  Margin
                </>
              ) : (
                <>You</>
              )}
            </div>
            <Markdown content={m.content || "Reading the evidence…"} go={go} />
            {m.role === "assistant" && m.content && (
              <>
                <div className="answer-controls">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowSources(showSources === i ? null : i)}
                  >
                    <BookMarked size={13} />
                    {m.sources?.length || 0} cited sources
                    <ChevronDown size={12} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Copy answer"
                    onClick={async () => {
                      await navigator.clipboard.writeText(m.content);
                      notify("Answer copied.");
                    }}
                  >
                    <Copy size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Save answer as note"
                    onClick={async () => {
                      await api(`papers/${paper._id}/notes`, "POST", {
                        title:
                          messages[i - 1]?.content.slice(0, 100) ||
                          "Study answer",
                        content: m.content,
                        shared: false,
                      });
                      qc.invalidateQueries({ queryKey: ["notes", paper._id] });
                      notify("Answer saved as a private note.");
                    }}
                  >
                    <NotebookPen size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Regenerate answer"
                    disabled={busy}
                    onClick={() =>
                      ask(
                        messages[i - 1]?.content ||
                          "Explain the main contribution",
                      )
                    }
                  >
                    <RefreshCw size={14} />
                  </Button>
                </div>
                {showSources === i && (
                  <div className="sources-list">
                    {m.sources?.map((s) => (
                      <button key={s.page} onClick={() => go(s.page)}>
                        <span className="citation">p. {s.page}</span>
                        <p>{s.text.slice(0, 400)}…</p>
                      </button>
                    ))}
                  </div>
                )}
                {m.usage && (
                  <p className="usage-label">
                    {(m.usage.prompt_tokens || 0) +
                      (m.usage.completion_tokens || 0)}{" "}
                    tokens
                    {m.usage.cost != null
                      ? ` · $${m.usage.cost.toFixed(4)}`
                      : ""}
                  </p>
                )}
              </>
            )}
          </article>
        ))}
        {chart && (
          <div className="chart-artifact">
            <h3>{chart.title}</h3>
            <ResponsiveContainer width="100%" height={220}>
              {chart.type === "bar" ? (
                <BarChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#dba947" />
                </BarChart>
              ) : (
                <AreaChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Area dataKey="value" stroke="#c89332" fill="#f5e5be" />
                </AreaChart>
              )}
            </ResponsiveContainer>
            <p className="muted text-xs">
              Source values:{" "}
              {chart.data
                .map((d: any) => `${d.label}: ${d.value} [p. ${d.page}]`)
                .join("; ")}
            </p>
            <Markdown content={chart.narrative} go={go} />
            <Button
              size="sm"
              onClick={async () => {
                await api(`papers/${paper._id}/notes`, "POST", {
                  title: chart.title,
                  content: `${chart.narrative}\n\n\`\`\`json\n${JSON.stringify(chart, null, 2)}\n\`\`\``,
                  shared: false,
                });
                notify("Chart data saved as a note.");
              }}
            >
              Save chart data
            </Button>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="chat-composer">
        {selection?.quote && (
          <div className="context-chip">
            <FileText size={13} />
            Selected passage, p. {selection.pageIndex + 1}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about this paper…"
            aria-label="Ask about this paper"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
          />
          <div className="composer-bottom">
            <Link href="/app/settings" className="muted text-xs">
              {settings.chatModel || "Configure a model"}{" "}
              <ChevronDown size={12} />
            </Link>
            {busy ? (
              <Button
                size="icon"
                aria-label="Stop response"
                onClick={() => controller.current?.abort()}
              >
                <StopCircle size={17} />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="icon"
                type="submit"
                disabled={!question.trim()}
                aria-label="Send question"
              >
                <ArrowUp size={17} />
              </Button>
            )}
          </div>
        </form>
        <div className="composer-disclaimer">
          <span>Grounded in your paper. Verify the source.</span>
          <button
            className="text-button"
            disabled={chartBusy}
            onClick={async () => {
              setChartBusy(true);
              setError("");
              try {
                const r = await api("ai/visualize", "POST", {
                  paperId: paper._id,
                  question:
                    question || "Visualize the primary experimental results",
                });
                if (r.unavailable) setError(r.reason);
                else setChart(r);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setChartBusy(false);
              }
            }}
          >
            <BarChart3 size={12} />
            {chartBusy ? "Extracting…" : "Chart data"}
          </button>
        </div>
      </div>
    </div>
  );
}
function GoalsPanel({
  paperId,
  goAsk,
  notify,
}: {
  paperId: string;
  goAsk: (q: string) => void;
  notify: (s: string) => void;
}) {
  const goals = useQuery<Goal[]>({
    queryKey: ["goals", paperId],
    queryFn: () => api(`papers/${paperId}/goals`),
  });
  const qc = useQueryClient();
  const [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["goals", paperId] });
  async function update(goal: Goal, b: any) {
    try {
      await api(`goals/${goal._id}`, "PATCH", b);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="goals-panel">
      {goals.error && (
        <p className="error" role="alert">
          {goals.error.message}
        </p>
      )}
      <span className="small-label">READ WITH INTENTION</span>
      <h2>What do you want to understand?</h2>
      <p className="muted">
        Break the paper into a few clear goals. Check them off as the ideas
        click.
      </p>
      {(goals.data?.length || 0) > 0 && (
        <div className="goal-progress">
          <span>
            {goals.data?.filter((g) => g.state === "understood").length} of{" "}
            {goals.data?.length} understood
          </span>
          <div className="progress-track">
            <span
              style={{
                width: `${(goals.data!.filter((g) => g.state === "understood").length / goals.data!.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
      <div className="goal-list">
        {goals.data?.map((g, i) => (
          <article
            key={g._id}
            className={g.state === "understood" ? "understood" : ""}
          >
            <button
              className="goal-check"
              aria-label={`Mark ${g.title} ${g.state === "understood" ? "not started" : "understood"}`}
              onClick={() =>
                update(g, {
                  state:
                    g.state === "understood" ? "not started" : "understood",
                })
              }
            >
              {g.state === "understood" && <Check size={14} />}
            </button>
            <div>
              {edit === g._id ? (
                <input
                  aria-label="Edit goal"
                  defaultValue={g.title}
                  onBlur={(e) => {
                    update(g, { title: e.target.value });
                    setEdit("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  autoFocus
                />
              ) : (
                <button
                  className="goal-title"
                  onClick={() => {
                    update(g, { state: "in progress" });
                    goAsk(`Help me achieve this study goal: ${g.title}`);
                  }}
                >
                  {g.title}
                </button>
              )}
              <span className="muted text-xs">{g.state}</span>
              <div className="goal-actions">
                <button onClick={() => setEdit(g._id)}>Edit</button>
                <button
                  onClick={() => update(g, { order: Math.max(0, i - 1) })}
                >
                  Move up
                </button>
                <button
                  onClick={async () => {
                    await api(`goals/${g._id}`, "DELETE");
                    refresh();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <form
        className="add-goal"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(`papers/${paperId}/goals`, "POST", { title });
            setTitle("");
            refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a learning goal…"
          aria-label="New learning goal"
          required
        />
        <Button size="icon" type="submit" aria-label="Add goal">
          <Plus size={17} />
        </Button>
      </form>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api("ai/study-goals", "POST", { paperId });
            refresh();
            notify("Study goals generated from paper evidence.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles size={15} />
        {busy ? "Reading paper evidence…" : "Suggest goals from this paper"}
      </Button>
      {error && <p className="error">{error}</p>}
      <div className="study-tip">
        <Target size={18} />
        <p>
          Click a goal to open a focused study conversation. Custom goals work
          even when AI is disabled.
        </p>
      </div>
    </div>
  );
}
function NotesPanel({
  paper,
  user,
  library,
  annotations,
  onJump,
  notify,
  exportAnnotated,
}: {
  paper: Paper;
  user: Identity;
  library: Library;
  annotations: Annotation[];
  onJump: (a: Annotation) => void;
  notify: (s: string) => void;
  exportAnnotated: () => void;
}) {
  const notes = useQuery<Note[]>({
    queryKey: ["notes", paper._id],
    queryFn: () => api(`papers/${paper._id}/notes`),
    refetchInterval: 10000,
  });
  const comments = useQuery<any[]>({
    queryKey: ["comments", paper._id],
    queryFn: () => api(`papers/${paper._id}/comments`),
    refetchInterval: 5000,
  });
  const qc = useQueryClient();
  const [active, setActive] = useState<Note | null>(null),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [shared, setShared] = useState(false),
    [preview, setPreview] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [comment, setComment] = useState(""),
    [section, setSection] = useState("notes"),
    [editingAnnotation, setEditingAnnotation] = useState(""),
    [annotationDraft, setAnnotationDraft] = useState("");
  function open(n: Note) {
    if (dirty) {
      setError("Save your current note before opening another.");
      return;
    }
    setActive(n);
    setTitle(n.title);
    setContent(n.content);
    setShared(n.shared);
    setPreview(false);
    setError("");
  }
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  async function save() {
    setError("");
    setSaving(true);
    try {
      if (active) {
        const r = await api(`notes/${active._id}`, "PATCH", {
          title,
          content,
          shared,
          version: active.version,
        });
        setActive({ ...active, title, content, shared, version: r.version });
      } else {
        const n = await api(`papers/${paper._id}/notes`, "POST", {
          title,
          content,
          shared,
        });
        setActive(n);
      }
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["notes", paper._id] });
      notify("Note saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="notes-panel">
      {notes.error && (
        <p className="error" role="alert">
          {notes.error.message}
        </p>
      )}
      {comments.error && (
        <p className="error" role="alert">
          {comments.error.message}
        </p>
      )}
      <div className="notes-subtabs">
        {["notes", "annotations", "discussion"].map((s) => (
          <button
            key={s}
            className={section === s ? "active" : ""}
            onClick={() => setSection(s)}
          >
            {s === "notes"
              ? "My notes"
              : s === "annotations"
                ? `Highlights (${annotations.length})`
                : "Discussion"}
          </button>
        ))}
      </div>
      {section === "notes" ? (
        <>
          <div className="notes-list">
            {notes.data?.map((n) => (
              <button
                key={n._id}
                className={active?._id === n._id ? "active" : ""}
                onClick={() => open(n)}
              >
                <NotebookPen size={15} />
                <span>{n.title}</span>
                {n.shared && <span className="badge subtle">TEAM</span>}
              </button>
            ))}
            <Button
              size="sm"
              onClick={() => {
                if (dirty) {
                  setError("Save your current note first.");
                  return;
                }
                setActive(null);
                setTitle("Reading note");
                setContent(
                  "## TL;DR\n\n## Problem\n\n## Method\n\n## Findings\n\n## Limitations\n\n## Questions\n\n## My ideas\n",
                );
                setShared(false);
                setDirty(true);
              }}
            >
              <Plus size={14} />
              New reading note
            </Button>
          </div>
          {active || dirty ? (
            <div className="note-editor">
              <input
                className="note-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                aria-label="Note title"
              />
              <div className="note-editor-tools">
                <div className="segmented">
                  <button
                    onClick={() => setPreview(false)}
                    className={!preview ? "active" : ""}
                  >
                    Write
                  </button>
                  <button
                    onClick={() => setPreview(true)}
                    className={preview ? "active" : ""}
                  >
                    Preview
                  </button>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={(e) => {
                      setShared(e.target.checked);
                      setDirty(true);
                    }}
                  />
                  Shared
                </label>
              </div>
              {preview ? (
                <Markdown
                  content={content}
                  go={(n) =>
                    onJump({
                      _id: "note-source",
                      pageIndex: n - 1,
                      rects: [],
                    } as unknown as Annotation)
                  }
                />
              ) : (
                <textarea
                  className="markdown-editor"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Your ideas, in Markdown. Use [p. 2] to link a source page."
                  aria-label="Note content"
                />
              )}
              <div className="note-save-row">
                {active?.identityId === user._id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete note"
                    onClick={async () => {
                      await api(`notes/${active._id}`, "DELETE");
                      setActive(null);
                      setDirty(false);
                      setContent("");
                      qc.invalidateQueries({ queryKey: ["notes", paper._id] });
                      notify("Note deleted.");
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
                <span className="muted text-xs">
                  {dirty
                    ? "Unsaved changes"
                    : `Saved · Version ${active?.version || 1}`}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={saving || !title.trim()}
                  onClick={save}
                >
                  <Save size={14} />
                  {saving ? "Saving…" : "Save note"}
                </Button>
              </div>
              {error && (
                <div className="note-conflict">
                  <p className="error">{error}</p>
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadText(
                        "unsaved-note.md",
                        `# ${title}\n\n${content}`,
                      )
                    }
                  >
                    Save a local copy
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setDirty(false);
                      const result = await notes.refetch();
                      const latest = result.data?.find(
                        (n) => n._id === active?._id,
                      );
                      if (latest) {
                        setActive(latest);
                        setTitle(latest.title);
                        setContent(latest.content);
                        setShared(latest.shared);
                      }
                      setError("");
                    }}
                  >
                    Reload latest
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="notes-empty">
              <NotebookPen size={30} />
              <h3>Make the paper your own.</h3>
              <p>
                Capture a question, an insight, or a reading summary. Markdown
                keeps it simple.
              </p>
            </div>
          )}
          <div className="notes-export">
            <a
              className="btn ghost small"
              href={`/api/export/markdown?libraryId=${library._id}&paperId=${paper._id}`}
            >
              <Download size={14} />
              Export notes
            </a>
            <a
              className="btn ghost small"
              href={`/api/export/bibtex?libraryId=${library._id}&paperId=${paper._id}`}
            >
              <Copy size={14} />
              BibTeX
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  const r = await api(`papers/${paper._id}/citation?style=APA`);
                  await navigator.clipboard.writeText(r.citation);
                  notify("APA citation copied.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Copy size={14} />
              APA
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  const r = await api(
                    `papers/${paper._id}/citation?style=IEEE`,
                  );
                  await navigator.clipboard.writeText(r.citation);
                  notify("IEEE citation copied.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              IEEE
            </Button>
          </div>
        </>
      ) : section === "annotations" ? (
        <div className="annotation-list">
          {annotations.length ? (
            annotations.map((a) => (
              <article key={a._id}>
                <button onClick={() => onJump(a)} className="annotation-source">
                  <span className={`annotation-dot ${a.color}`} />
                  <span className="citation">p. {a.pageIndex + 1}</span>
                  <small>
                    {a.shared ? a.author : "Private"} · {a.kind}
                  </small>
                </button>
                {a.quote && (
                  <blockquote onClick={() => onJump(a)}>{a.quote}</blockquote>
                )}
                {editingAnnotation === a._id ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await api(`annotations/${a._id}`, "PATCH", {
                          comment: annotationDraft,
                        });
                        setEditingAnnotation("");
                        qc.invalidateQueries({
                          queryKey: ["annotations", paper._id],
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <textarea
                      value={annotationDraft}
                      onChange={(e) => setAnnotationDraft(e.target.value)}
                      aria-label="Edit annotation comment"
                      rows={3}
                    />
                    <Button type="submit" size="sm">
                      Save comment
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingAnnotation("")}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  a.comment && <p>{a.comment}</p>
                )}
                {a.identityId === user._id && (
                  <div className="annotation-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingAnnotation(a._id);
                        setAnnotationDraft(a.comment);
                      }}
                    >
                      Edit note
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api(`annotations/${a._id}`, "PATCH", {
                          shared: !a.shared,
                        });
                        qc.invalidateQueries({
                          queryKey: ["annotations", paper._id],
                        });
                      }}
                    >
                      {a.shared ? "Make private" : "Share annotation"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete annotation"
                      onClick={async () => {
                        await api(`annotations/${a._id}`, "DELETE");
                        qc.invalidateQueries({
                          queryKey: ["annotations", paper._id],
                        });
                      }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="notes-empty">
              <Highlighter size={28} />
              <h3>A thought worth keeping?</h3>
              <p>
                Select text in the PDF to highlight it, or add a note to a
                region of the page.
              </p>
            </div>
          )}
          <Button size="sm" onClick={exportAnnotated}>
            <Download size={14} />
            Export highlighted PDF
          </Button>
          <p className="field-help">
            Highlights are embedded. Comments are app annotations and included
            in JSON exports.
          </p>
        </div>
      ) : (
        <div className="discussion-panel">
          {comments.data?.map((c) => (
            <article key={c._id}>
              <strong>{c.author}</strong>
              <small>{new Date(c.createdAt).toLocaleString()}</small>
              <p>{c.content}</p>
            </article>
          ))}
          {!comments.data?.length && (
            <p className="muted">
              Leave a thought for your teammates. Discussion is visible to
              everyone with library access.
            </p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`papers/${paper._id}/comments`, "POST", {
                  content: comment,
                });
                setComment("");
                qc.invalidateQueries({ queryKey: ["comments", paper._id] });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Share a question or perspective…"
              required
              aria-label="Discussion comment"
            />
            <Button type="submit" variant="primary" size="sm">
              <Send size={14} />
              Post comment
            </Button>
          </form>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
function QuizDialog({
  open,
  close,
  paperId,
  go,
}: {
  open: boolean;
  close: () => void;
  paperId: string;
  go: (p: number) => void;
}) {
  const [level, setLevel] = useState("intermediate"),
    [mode, setMode] = useState("quiz"),
    [data, setData] = useState<any>(null),
    [index, setIndex] = useState(0),
    [answer, setAnswer] = useState(""),
    [revealed, setRevealed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const q = data?.questions[index];
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && close()}
      title="Check your understanding"
      description="Questions grounded in this paper. Use the source answer for a thoughtful self assessment."
    >
      {!data ? (
        <>
          <div className="form-row">
            <label>
              Difficulty
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                {["beginner", "intermediate", "advanced"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Practice mode
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="quiz">Short answer quiz</option>
                <option value="flashcards">Flashcards</option>
              </select>
            </label>
          </div>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setData(await api("ai/quiz", "POST", { paperId, level, mode }));
                setIndex(0);
                setRevealed(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <GraduationCap size={16} />
            {busy ? "Preparing questions…" : "Generate from this paper"}
          </Button>
        </>
      ) : (
        <div className="quiz-content">
          <span className="badge subtle">
            {mode === "quiz" ? "QUESTION" : "CARD"} {index + 1} OF{" "}
            {data.questions.length}
          </span>
          <h2>{q.question}</h2>
          {mode === "quiz" && (
            <label>
              Your answer
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Explain it in your own words…"
                rows={4}
              />
            </label>
          )}
          {revealed ? (
            <>
              <div className="quiz-answer">
                <Markdown content={q.answer} go={go} />
                <button
                  className="citation"
                  onClick={() => {
                    go(q.page);
                    close();
                  }}
                >
                  Verify on p. {q.page}
                </button>
              </div>
              <p className="field-help">
                Compare your answer with the evidence. This is self assessment,
                not an objective grade.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  if (index < data.questions.length - 1) {
                    setIndex(index + 1);
                    setRevealed(false);
                    setAnswer("");
                  } else {
                    close();
                    setData(null);
                  }
                }}
              >
                {index < data.questions.length - 1
                  ? "Next question"
                  : "Finish practice"}
                <ChevronRight size={16} />
              </Button>
            </>
          ) : (
            <Button onClick={() => setRevealed(true)}>
              Reveal source answer
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              downloadText(
                "margin-flashcards.tsv",
                data.questions
                  .map(
                    (q: any) =>
                      `${q.question.replace(/[\t\n]/g, " ")}\t${q.answer.replace(/[\t\n]/g, " ")} (p. ${q.page})`,
                  )
                  .join("\n"),
              )
            }
          >
            <Download size={14} />
            Export cards (Anki TSV)
          </Button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}
