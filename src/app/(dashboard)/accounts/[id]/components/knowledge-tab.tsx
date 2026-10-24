"use client";

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useState, useEffect, useCallback, useRef } from "react";
import { BookOpen, Plus, Trash2, Upload, Save, FileText, Swords, Factory, Wrench, Package, MoreHorizontal, Sparkles, Loader2, RefreshCw, Link, Type, Image as ImageIcon, X, ExternalLink, Newspaper, Clock, Brain } from "lucide-react";
import type { KnowledgeCategory } from "@/lib/babel-engine/types";
import { useHighlightScroll } from "@/lib/hooks/use-highlight-scroll";
import { isOcrEnabled, OCR_DISABLED_MESSAGE } from "@/lib/ocr-config";
import { CompetitorsTab } from "./competitors-tab";
import { toast } from "@/lib/toast-store";
import { appConfirm } from "@/lib/confirm-store";
import { useLocale } from "@/lib/i18n";

// ─── Category config ────────────────────────────────────────────────

const KB_CATEGORIES: {
  value: KnowledgeCategory;
  label: string;
  icon: typeof BookOpen;
}[] = [{
  value: "product_proposal",
  label: "产品方案",
  icon: Package
}, {
  value: "competitor",
  label: "竞争对手",
  icon: Swords
}, {
  value: "industry",
  label: "行业/政策",
  icon: Factory
}, {
  value: "sales_tools",
  label: "销售工具",
  icon: Wrench
}, {
  value: "other",
  label: "其他",
  icon: MoreHorizontal
}];
const CATEGORY_LABELS: Record<string, string> = {
  product_proposal: "产品方案",
  competitor: "竞争对手",
  industry: "行业/政策",
  sales_tools: "销售工具",
  company_info: "公司资料",
  methodology: "方法论",
  case_study: "案例",
  ai_insight: "AI 洞察",
  product_solution: "产品方案",
  competitor_intel: "竞争情报",
  deal_lesson: "商机教训",
  other: "其他"
};
const CATEGORY_BADGE: Record<string, string> = {
  product_proposal: "badge badge-info",
  competitor: "badge badge-danger",
  industry: "badge badge-warning",
  sales_tools: "badge badge-success",
  company_info: "badge badge-info",
  methodology: "badge badge-info",
  case_study: "badge badge-success",
  other: "badge badge-neutral"
};

// ─── Types ──────────────────────────────────────────────────────────

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
  source?: string;
  sourceType?: string;
  sourceId?: string;
}
interface SourceRecordSpotlight {
  id: string;
  sourceKind: string;
  sourceTable?: string;
  sourceTableLabel: string;
  sourceRowId: string;
  title: string;
  summary: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}
interface MatchedKnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  score: number;
  matchedTerms: string[];
}

// ─── Sections ───────────────────────────────────────────────────────

type Section = "entries" | "news" | "competitors";

// ─── Component ──────────────────────────────────────────────────────

export function KnowledgeTab({
  accountId,
  highlightId
}: {
  accountId: string;
  highlightId?: string | null;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const ocrEnabled = isOcrEnabled();
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const [section, setSection] = useState<Section>("entries");
  const {
    highlightProps
  } = useHighlightScroll(highlightId);
  const [items, setItems] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<'all' | 'manual' | 'ai'>('all');
  const [showForm, setShowForm] = useState(false);
  const [sourceRecordSpotlight, setSourceRecordSpotlight] = useState<SourceRecordSpotlight | null>(null);
  const [matchedKnowledgeItem, setMatchedKnowledgeItem] = useState<MatchedKnowledgeItem | null>(null);
  const [sourceRecordLoading, setSourceRecordLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<KnowledgeCategory>("product_proposal");
  const [saving, setSaving] = useState(false);
  const [compilingId, setCompilingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploading, setFileUploading] = useState(false);

  // Smart entry states
  const [showSmartForm, setShowSmartForm] = useState(false);
  const [smartInputType, setSmartInputType] = useState<"text" | "url" | "image">("text");
  const [smartContent, setSmartContent] = useState("");
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState("");
  const [extractResult, setExtractResult] = useState<{
    title: string;
    summary: string;
    keyPoints: string[];
    suggestedCategory: string;
  } | null>(null);
  const [smartSaving, setSmartSaving] = useState(false);

  // Image OCR states
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Batch upload states
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({
    current: 0,
    total: 0
  });
  const [isDragging, setIsDragging] = useState(false);

  // News states
  const [newsItems, setNewsItems] = useState<{
    title: string;
    url: string;
    summary: string;
    publishedAt: string | null;
    score: number;
    originalTitle?: string;
    originalSummary?: string;
  }[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [savedNewsIndexes, setSavedNewsIndexes] = useState<Set<number>>(new Set());
  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounts/${accountId}/knowledge`);
      const data = await res.json();
      const mapped = (data.items ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        sourceType: row.source_type,
        sourceId: row.source_id
      })) as KnowledgeEntry[];
      setItems(mapped);
    } catch {
      console.error("[knowledge-tab] Failed to fetch items");
    } finally {
      setLoading(false);
    }
  }, [accountId]);
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);
  useEffect(() => {
    if (!highlightId) {
      setSourceRecordSpotlight(null);
      setMatchedKnowledgeItem(null);
      setSourceRecordLoading(false);
      return;
    }
    setSection('entries');
  }, [highlightId]);
  useEffect(() => {
    if (!highlightId) return;
    const targetId = highlightId;
    let cancelled = false;
    async function loadSourceRecordSpotlight() {
      setSourceRecordLoading(true);
      try {
        const res = await fetch(`/api/accounts/${accountId}/source-records?targetId=${encodeURIComponent(targetId)}`);
        if (!res.ok || cancelled) {
          if (!cancelled) {
            setSourceRecordSpotlight(null);
            setMatchedKnowledgeItem(null);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setSourceRecordSpotlight(data.item ?? null);
          setMatchedKnowledgeItem(data.matchedKnowledgeItem ?? null);
        }
      } catch {
        if (!cancelled) {
          setSourceRecordSpotlight(null);
          setMatchedKnowledgeItem(null);
        }
      } finally {
        if (!cancelled) setSourceRecordLoading(false);
      }
    }
    void loadSourceRecordSpotlight();
    return () => {
      cancelled = true;
    };
  }, [accountId, highlightId]);
  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError("");
    try {
      const res = await fetch(`/api/accounts/${accountId}/news`);
      const data = await res.json();
      if (!res.ok) {
        setNewsError(data.error ?? "搜索失败");
        return;
      }
      setNewsItems(data.results ?? []);
      setNewsLoaded(true);
    } catch {
      setNewsError("网络错误，请重试");
    } finally {
      setNewsLoading(false);
    }
  }, [accountId]);

  // Auto-fetch news when switching to news tab
  useEffect(() => {
    if (section === "news" && !newsLoaded && !newsLoading) {
      fetchNews();
    }
  }, [section, newsLoaded, newsLoading, fetchNews]);
  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/accounts/${accountId}/knowledge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category
        })
      });
      setTitle("");
      setContent("");
      setCategory("product_proposal");
      setShowForm(false);
      await fetchItems();
    } catch {
      console.error("[knowledge-tab] Failed to add item");
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (itemId: string) => {
    if (!(await appConfirm({
      message: "确定删除此知识条目？",
      variant: 'danger'
    }))) return;
    try {
      await fetch(`/api/accounts/${accountId}/knowledge?itemId=${itemId}`, {
        method: "DELETE"
      });
      await fetchItems();
    } catch {
      console.error("[knowledge-tab] Failed to delete item");
    }
  };
  const handleCompile = async (itemId: string) => {
    setCompilingId(itemId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/knowledge/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          itemId
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "编译失败", 'error');
        return;
      }
      toast("已编译进客户判断模型", 'success');
    } catch {
      toast("编译失败，请重试", 'error');
    } finally {
      setCompilingId(null);
    }
  };

  // ─── File upload (txt/md/pdf/docx/xlsx/csv) ──────────────────────
  const handleFileUpload = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const localExts = ["txt", "md"];
    const serverExts = ["pdf", "docx", "xlsx", "csv"];
    if (![...localExts, ...serverExts].includes(ext)) {
      if (ext === "xls") {
        toast("暂不支持旧版 .xls 格式，请在 Excel 中另存为 .xlsx 后重新上传", 'warning');
      } else {
        toast("支持的格式：txt, md, pdf, docx, xlsx, csv", 'warning');
      }
      return;
    }
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
    if (serverExts.includes(ext)) {
      setFileUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/parse-document", {
          method: "POST",
          body: formData
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error ?? "文件解析失败", 'error');
          return;
        }
        setContent(data.text ?? data.content ?? "");
      } catch {
        toast("文件上传解析失败，请重试", 'error');
      } finally {
        setFileUploading(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      setContent(e.target?.result as string);
    };
    reader.readAsText(file);
  };

  // ─── Smart extract (text/url) ─────────────────────────────────────
  const handleSmartExtract = async () => {
    if (!smartContent.trim()) return;
    setSmartLoading(true);
    setSmartError("");
    setExtractResult(null);
    try {
      const res = await fetch("/api/knowledge/smart-extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: smartInputType,
          content: smartContent.trim(),
          accountId,
          outputLocale: locale
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setSmartError(data.error ?? "分析失败");
        return;
      }
      setExtractResult(data);
    } catch {
      setSmartError("网络错误，请重试");
    } finally {
      setSmartLoading(false);
    }
  };

  // ─── Image OCR → smart extract ────────────────────────────────────
  const handleImageSelect = useCallback((file: File) => {
    if (!isOcrEnabled()) {
      setSmartError(OCR_DISABLED_MESSAGE);
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setSmartError("仅支持 jpg/png/webp/gif 图片格式");
      return;
    }
    setImageFile(file);
    setSmartError("");
    setExtractResult(null);
    setImagePreview(URL.createObjectURL(file));
  }, []);
  const handleImageOCR = async () => {
    if (!ocrEnabled) {
      setSmartError(OCR_DISABLED_MESSAGE);
      return;
    }
    if (!imageFile) return;
    setOcrLoading(true);
    setSmartError("");
    setExtractResult(null);
    try {
      // Step 1: OCR
      const formData = new FormData();
      formData.append("file", imageFile);
      formData.append("outputLocale", locale);
      const ocrRes = await fetch("/api/knowledge/ocr", {
        method: "POST",
        body: formData
      });
      const ocrData = await ocrRes.json();
      if (!ocrRes.ok) {
        setSmartError(ocrData.error ?? "图片识别失败，请检查 Vision API 配置");
        return;
      }
      const ocrText = [ocrData.extractedText, ocrData.salesInsights].filter(Boolean).join("\n\n");

      // Step 2: Smart extract for title/summary/category
      const extractRes = await fetch("/api/knowledge/smart-extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "text",
          content: ocrText,
          accountId,
          outputLocale: locale
        })
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) {
        setSmartError(extractData.error ?? "AI 分析失败");
        return;
      }
      setExtractResult(extractData);
    } catch {
      setSmartError("图片识别失败，请检查网络连接或 Vision API 配置");
    } finally {
      setOcrLoading(false);
    }
  };

  // ─── Paste handler for image tab ──────────────────────────────────
  useEffect(() => {
    if (!ocrEnabled || smartInputType !== "image" || !showSmartForm) return;
    const onPaste = (e: ClipboardEvent) => {
      const clipItems = e.clipboardData?.items;
      if (!clipItems) return;
      for (const item of clipItems) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageSelect(file);
          break;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [ocrEnabled, smartInputType, showSmartForm, handleImageSelect]);

  useEffect(() => {
    if (!ocrEnabled && smartInputType === "image") {
      setSmartInputType("text");
      setImageFile(null);
      setImagePreview("");
    }
  }, [ocrEnabled, smartInputType]);
  const handleSmartSave = async () => {
    if (!extractResult) return;
    setSmartSaving(true);
    try {
      await fetch(`/api/accounts/${accountId}/knowledge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: extractResult.title,
          content: extractResult.summary,
          category: extractResult.suggestedCategory
        })
      });
      setShowSmartForm(false);
      setSmartContent("");
      setExtractResult(null);
      setImageFile(null);
      setImagePreview("");
      await fetchItems();
    } catch {
      setSmartError("保存失败");
    } finally {
      setSmartSaving(false);
    }
  };

  // ─── Batch file upload ────────────────────────────────────────────
  const handleBatchFiles = (files: FileList | File[]) => {
    const validExts = ["txt", "md", "pdf"];
    const accepted: File[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (validExts.includes(ext)) accepted.push(file);
    }
    if (accepted.length === 0) {
      toast("仅支持 .txt、.md、.pdf 文件", 'warning');
      return;
    }
    setBatchFiles(prev => [...prev, ...accepted]);
  };
  const removeBatchFile = (index: number) => {
    setBatchFiles(prev => prev.filter((_, i) => i !== index));
  };
  const handleBatchUpload = async () => {
    if (batchFiles.length === 0) return;
    setBatchUploading(true);
    setBatchProgress({
      current: 0,
      total: batchFiles.length
    });
    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const fileTitle = file.name.replace(/\.[^/.]+$/, "");
      let fileContent = "";
      try {
        if (ext === "pdf") {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/parse-document", {
            method: "POST",
            body: formData
          });
          const data = await res.json();
          if (res.ok) fileContent = data.text ?? "";
        } else {
          fileContent = await file.text();
        }
        if (fileContent.trim()) {
          const extractRes = await fetch("/api/knowledge/smart-extract", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              type: "text",
              content: fileContent.slice(0, 6000),
              accountId,
              outputLocale: locale
            })
          });
          const extractData = await extractRes.json();
          await fetch(`/api/accounts/${accountId}/knowledge`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              title: extractRes.ok ? extractData.title : fileTitle,
              content: extractRes.ok ? extractData.summary : fileContent.slice(0, 2000),
              category: extractRes.ok ? extractData.suggestedCategory : "other"
            })
          });
        }
      } catch {
        console.error(`[knowledge-tab] Failed to process: ${file.name}`);
      }
      setBatchProgress({
        current: i + 1,
        total: batchFiles.length
      });
    }
    setBatchFiles([]);
    setBatchUploading(false);
    await fetchItems();
  };
  const filteredItems = items.filter(i => filterCategory === "all" || i.category === filterCategory).filter(i => {
    if (filterSource === "all") return true;
    if (filterSource === "manual") return !i.source || i.source === "manual";
    return i.source !== undefined && i.source !== "manual";
  });
  const sections: {
    key: Section;
    label: string;
  }[] = [{
    key: "entries",
    label: "知识条目"
  }, {
    key: "news",
    label: "客户动态"
  }, {
    key: "competitors",
    label: "竞争对手"
  }];
  return <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
        {sections.map(s => <button key={s.key} onClick={() => setSection(s.key)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${section === s.key ? "bg-card text-foreground shadow-sm" : "text-secondary hover:text-foreground"}`}>
            {s.label}
          </button>)}
      </div>

      {/* Section A: 知识条目 */}
      {section === "entries" && <div className="space-y-4">
          {/* Filter tabs + Add button */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setFilterCategory("all")} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filterCategory === "all" ? "bg-accent text-white" : "bg-background text-secondary hover:text-foreground border border-border"}`}>{tx("全部")}</button>
              {KB_CATEGORIES.map(c => <button key={c.value} onClick={() => setFilterCategory(c.value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filterCategory === c.value ? "bg-accent text-white" : "bg-background text-secondary hover:text-foreground border border-border"}`}>
                  {c.label}
                </button>)}
            </div>
            <div className="flex gap-1 rounded-lg border border-border bg-background p-0.5">
              {([["all", "全部"], ["manual", "手动"], ["ai", "AI"]] as const).map(([val, label]) => <button key={val} onClick={() => setFilterSource(val)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${filterSource === val ? "bg-accent text-white" : "text-secondary hover:text-foreground"}`}>
                  {label}
                </button>)}
            </div>
            <div className="ml-auto flex gap-2">
              <button onClick={() => {
            setShowSmartForm(!showSmartForm);
            setShowForm(false);
            setSmartContent("");
            setExtractResult(null);
            setSmartError("");
            setImageFile(null);
            setImagePreview("");
          }} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${showSmartForm ? "bg-accent text-white" : "border border-accent text-accent hover:bg-accent/10"}`}>
                <Sparkles className="h-4 w-4" />{tx("智能录入")}</button>
              <button onClick={() => {
            setShowForm(!showForm);
            setShowSmartForm(false);
            setTitle("");
            setContent("");
            setCategory("product_proposal");
            setBatchFiles([]);
          }} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors">
                <Plus className="h-4 w-4" />{tx("新增知识")}</button>
            </div>
          </div>

          {/* Add form */}
          {showForm && <div className="rounded-xl border border-border bg-card card-elevated p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{tx("新增知识条目")}</h3>
              <div>
                <label className="form-label">{tx("标题 *")}</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="form-input w-full" placeholder={tx("知识条目标题")} />
              </div>
              <div>
                <label className="form-label">{tx("分类")}</label>
                <select value={category} onChange={e => setCategory(e.target.value as KnowledgeCategory)} className="form-input w-full">
                  {KB_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">{tx("内容 *")}</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} rows={6} className="form-input w-full" placeholder={tx("知识内容...")} />
              </div>
              {/* File upload */}
              <div className="flex items-center gap-2">
                <button onClick={() => fileInputRef.current?.click()} disabled={fileUploading} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-secondary hover:text-foreground transition-colors disabled:opacity-50">
                  {fileUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {fileUploading ? "解析中..." : "上传文件"}
                </button>
                <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx,.xlsx,.csv" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
            e.target.value = "";
          }} />
              </div>

              {/* Batch drag & drop zone */}
              <div onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }} onDragLeave={e => {
          e.preventDefault();
          setIsDragging(false);
        }} onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) handleBatchFiles(e.dataTransfer.files);
        }} className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${isDragging ? "border-accent bg-accent/5" : "border-border"}`}>
                <Upload className="mx-auto mb-2 h-6 w-6 text-muted" />
                <p className="text-xs text-secondary">{tx("拖拽多个文件到此处批量上传（.txt/.md/.pdf）")}</p>
                <p className="text-xs text-muted mt-1">{tx("将自动 AI 分析并生成标题、摘要、分类")}</p>
                {batchFiles.length > 0 && <div className="mt-3 space-y-1.5 text-left">
                    {batchFiles.map((f, i) => <div key={i} className="flex items-center gap-2 rounded-md bg-background px-3 py-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted flex-shrink-0" />
                        <span className="text-xs text-foreground truncate flex-1">{f.name}</span>
                        <button onClick={() => removeBatchFile(i)} className="text-muted hover:text-danger flex-shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>)}
                    <button onClick={handleBatchUpload} disabled={batchUploading} className="mt-2 flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
                      {batchUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {batchUploading ? `处理中 ${batchProgress.current}/${batchProgress.total}` : `批量上传 ${batchFiles.length} 个文件`}
                    </button>
                  </div>}
              </div>

              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={!title.trim() || !content.trim() || saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "保存中..." : "保存"}
                </button>
                <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-secondary hover:bg-sidebar transition-colors">{tx("取消")}</button>
              </div>
            </div>}

          {/* Smart entry form */}
          {showSmartForm && <div className="rounded-xl border border-border bg-card card-elevated p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />{tx("智能录入")}</h3>

              {/* Input type tabs (text / url / image) */}
              <div className="flex gap-1 rounded-lg border border-border bg-background p-1 w-fit">
                <button onClick={() => {
            setSmartInputType("text");
            setSmartContent("");
            setExtractResult(null);
            setSmartError("");
            setImageFile(null);
            setImagePreview("");
          }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${smartInputType === "text" ? "bg-card text-foreground shadow-sm" : "text-secondary hover:text-foreground"}`}>
                  <Type className="h-3.5 w-3.5" />{tx("粘贴文本")}</button>
                <button onClick={() => {
            setSmartInputType("url");
            setSmartContent("");
            setExtractResult(null);
            setSmartError("");
            setImageFile(null);
            setImagePreview("");
          }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${smartInputType === "url" ? "bg-card text-foreground shadow-sm" : "text-secondary hover:text-foreground"}`}>
                  <Link className="h-3.5 w-3.5" />{tx("输入URL")}</button>
                {ocrEnabled && <button onClick={() => {
            setSmartInputType("image");
            setSmartContent("");
            setExtractResult(null);
            setSmartError("");
            setImageFile(null);
            setImagePreview("");
          }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${smartInputType === "image" ? "bg-card text-foreground shadow-sm" : "text-secondary hover:text-foreground"}`}>
                  <ImageIcon className="h-3.5 w-3.5" />{tx("图片/截图")}</button>}
              </div>

              {/* Input area — text */}
              {smartInputType === "text" && <textarea value={smartContent} onChange={e => setSmartContent(e.target.value)} rows={6} className="form-input w-full" placeholder={tx("粘贴产品方案/竞对资料/政策文件内容...")} />}

              {/* Input area — url */}
              {smartInputType === "url" && <input type="text" value={smartContent} onChange={e => setSmartContent(e.target.value)} className="form-input w-full" placeholder="https://..." />}

              {/* Input area — image */}
              {ocrEnabled && smartInputType === "image" && <div className="space-y-3">
                  <div onDragOver={e => e.preventDefault()} onDrop={e => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleImageSelect(file);
          }} className="rounded-lg border-2 border-dashed border-border p-6 text-center">
                    {imagePreview ? <div className="space-y-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imagePreview} alt={tx("预览")} className="mx-auto max-h-48 rounded-lg object-contain" />
                        <p className="text-xs text-secondary">{imageFile?.name}</p>
                        <button onClick={() => {
                setImageFile(null);
                setImagePreview("");
              }} className="text-xs text-danger hover:underline">{tx("移除图片")}</button>
                      </div> : <>
                        <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted" />
                        <p className="text-xs text-secondary">{tx("点击上传、拖拽图片、或直接 Ctrl+V 粘贴截图")}</p>
                        <p className="text-xs text-muted mt-1">{tx("支持 jpg/png/webp/gif")}</p>
                        <button onClick={() => imageInputRef.current?.click()} className="mt-3 rounded-lg border border-border px-4 py-2 text-xs text-secondary hover:text-foreground transition-colors">
                          <Upload className="inline h-3.5 w-3.5 mr-1.5" />{tx("选择图片")}</button>
                      </>}
                  </div>
                  <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleImageSelect(f);
            e.target.value = "";
          }} />
                </div>}

              {/* Analyze button */}
              {smartInputType !== "image" ? <button onClick={handleSmartExtract} disabled={!smartContent.trim() || smartLoading} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {smartLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {smartLoading ? "AI 分析中..." : "AI 分析"}
                </button> : <button onClick={handleImageOCR} disabled={!imageFile || ocrLoading} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {ocrLoading ? "识别分析中..." : "OCR 识别 + AI 分析"}
                </button>}

              {/* Error */}
              {smartError && <p className="text-sm text-danger">{smartError}</p>}

              {/* Extract result */}
              {extractResult && <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                  <h4 className="text-xs font-semibold text-secondary uppercase tracking-wide">{tx("分析结果")}</h4>
                  <div>
                    <label className="form-label">{tx("标题")}</label>
                    <input type="text" value={extractResult.title} onChange={e => setExtractResult({
              ...extractResult,
              title: e.target.value
            })} className="form-input w-full" />
                  </div>
                  <div>
                    <label className="form-label">{tx("摘要")}</label>
                    <textarea value={extractResult.summary} onChange={e => setExtractResult({
              ...extractResult,
              summary: e.target.value
            })} rows={4} className="form-input w-full" />
                  </div>
                  {extractResult.keyPoints.length > 0 && <div>
                      <label className="form-label">{tx("关键要点")}</label>
                      <ul className="list-disc list-inside text-sm text-secondary space-y-1">
                        {extractResult.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>}
                  <div>
                    <label className="form-label">{tx("建议分类")}</label>
                    <select value={extractResult.suggestedCategory} onChange={e => setExtractResult({
              ...extractResult,
              suggestedCategory: e.target.value
            })} className="form-input w-full">
                      {KB_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleSmartSave} disabled={smartSaving} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
                      <Save className="h-3.5 w-3.5" />
                      {smartSaving ? "保存中..." : "保存到知识库"}
                    </button>
                    <button onClick={smartInputType === "image" ? handleImageOCR : handleSmartExtract} disabled={smartLoading || ocrLoading} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-secondary hover:text-foreground hover:bg-sidebar transition-colors">
                      <RefreshCw className={`h-3.5 w-3.5 ${smartLoading || ocrLoading ? "animate-spin" : ""}`} />{tx("重新分析")}</button>
                  </div>
                </div>}
            </div>}

          {/* source_record 定位卡片 */}
          {highlightId && sourceRecordLoading ? <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted">{tx("正在定位来源记录...")}</div> : sourceRecordSpotlight ? <div {...highlightProps(matchedKnowledgeItem?.id ?? highlightId ?? sourceRecordSpotlight.sourceRowId)} className="rounded-xl border border-accent/20 bg-accent/[0.04] p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{tx("来源记录命中")}</span>
                {matchedKnowledgeItem ? <span className="rounded-full border border-positive/20 bg-positive/10 px-2 py-0.5 text-[11px] font-medium text-positive">{tx("已归并到知识条目")}</span> : <span className="text-[11px] text-muted">{tx("未找到可稳定归并的知识条目")}</span>}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">{sourceRecordSpotlight.title}</h3>
                <p className="text-xs leading-6 text-secondary">{sourceRecordSpotlight.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                <span className="rounded-md border border-border bg-card px-2 py-0.5">{tx("来源类型：")}{sourceRecordSpotlight.sourceKind}</span>
                <span className="rounded-md border border-border bg-card px-2 py-0.5">{tx("来源表：")}{sourceRecordSpotlight.sourceTableLabel}</span>
                <span className="rounded-md border border-border bg-card px-2 py-0.5">{tx("记录编号：")}{sourceRecordSpotlight.sourceRowId}</span>
                {sourceRecordSpotlight.occurredAt ? <span className="rounded-md border border-border bg-card px-2 py-0.5">{tx("时间：")}{new Date(sourceRecordSpotlight.occurredAt).toLocaleString('zh-CN')}</span> : null}
              </div>
              {matchedKnowledgeItem ? <div className="rounded-lg border border-positive/15 bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-positive">{tx("语义归并结果")}</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{matchedKnowledgeItem.title}</p>
                    </div>
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted">{tx("匹配分")}{matchedKnowledgeItem.score}</span>
                  </div>
                  <p className="text-xs leading-6 text-secondary line-clamp-3">{matchedKnowledgeItem.content}</p>
                  {matchedKnowledgeItem.matchedTerms.length ? <p className="text-[11px] text-muted">{tx("匹配依据：")}{matchedKnowledgeItem.matchedTerms.join('、')}</p> : null}
                  <p className="text-[11px] text-muted">{tx("系统已将该 source_record 优先归并到对应知识条目，并在下方列表中精确高亮。")}</p>
                </div> : <p className="text-[11px] text-muted">{tx("说明：当前 knowledge 视图仍会承接 source_record，但因缺少足够语义重合，不强行映射到知识条目，避免错误归并。")}</p>}
            </div> : highlightId ? <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm text-foreground">{tx("未找到对应的来源记录，无法在知识视图中精确定位。")}</div> : null}

          {/* Items list */}
          {loading ? <div className="py-12 text-center text-sm text-muted">{tx("加载中...")}</div> : filteredItems.length === 0 ? <div className="py-12 text-center text-sm text-muted">
              <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p>{tx("暂无知识条目")}</p>
              <p className="mt-1 text-xs">{tx("点击“新增知识”添加该客户的知识条目")}</p>
            </div> : <div className="space-y-3">
              {filteredItems.map(item => <div key={item.id} {...highlightProps(item.id)} className="rounded-xl border border-border bg-card card-elevated p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">{item.title}</h3>
                        <span className={`${CATEGORY_BADGE[item.category] ?? "badge badge-neutral"} text-xs`}>
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </span>
                        {item.source && item.source !== 'manual' && <span className="text-xs text-blue-500 flex items-center gap-0.5">
                            ✨ AI
                          </span>}
                      </div>
                      <p className="text-xs text-secondary line-clamp-2">{item.content.slice(0, 100)}</p>
                      <p className="mt-1.5 text-xs text-muted">
                        {new Date(item.created_at).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => handleCompile(item.id)} disabled={compilingId === item.id} className="rounded-lg p-2 text-muted hover:text-accent hover:bg-accent/5 transition-colors disabled:opacity-50" title={tx("编译进 CIL")}>
                        {compilingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="rounded-lg p-2 text-muted hover:text-danger hover:bg-danger/5 transition-colors" title={tx("删除")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>)}
            </div>}
        </div>}

      {/* Section B: 客户动态 */}
      {section === "news" && <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-accent" />{tx("客户动态")}</h3>
            <button onClick={() => {
          setNewsLoaded(false);
          fetchNews();
        }} disabled={newsLoading} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground hover:bg-sidebar transition-colors disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${newsLoading ? "animate-spin" : ""}`} />
              {newsLoading ? "搜索中..." : "刷新"}
            </button>
          </div>

          {newsLoading && newsItems.length === 0 && <div className="py-12 text-center text-sm text-muted">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-accent" />
              <p>{tx("正在搜索客户新闻...")}</p>
            </div>}

          {newsError && <div className="rounded-lg border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
              {newsError}
            </div>}

          {!newsLoading && newsItems.length === 0 && !newsError && newsLoaded && <div className="py-12 text-center text-sm text-muted">
              <Newspaper className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p>{tx("暂无相关新闻")}</p>
            </div>}

          {newsItems.length > 0 && <div className="space-y-3">
              {newsItems.map((item, idx) => <div key={idx} className="rounded-xl border border-border bg-card card-elevated p-4 hover:border-accent/30 transition-colors group">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        <p className="mt-1 text-xs text-secondary line-clamp-2">{item.summary}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                          {item.publishedAt ? <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(item.publishedAt).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric"
                    })}
                            </span> : null}
                          {item.originalTitle ? <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">{tx("已翻译")}</span> : null}
                        </div>
                        {item.originalTitle ? <details className="mt-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-secondary">
                            <summary className="cursor-pointer select-none font-medium text-accent">{tx("查看原文")}</summary>
                            <div className="mt-2 space-y-1.5 leading-5">
                              <p><span className="font-semibold text-foreground">{tx("原文标题：")}</span>{item.originalTitle}</p>
                              {item.originalSummary ? <p><span className="font-semibold text-foreground">{tx("原文摘要：")}</span>{item.originalSummary}</p> : null}
                            </div>
                          </details> : null}
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted group-hover:text-accent flex-shrink-0 mt-0.5 transition-colors" />
                    </div>
                  </a>
                  <div className="mt-2 flex justify-end">
                    {savedNewsIndexes.has(idx) ? <span className="flex items-center gap-1 rounded-md border border-green-500/20 bg-green-500/10 px-2 py-1 text-[11px] font-medium text-green-600">
                        <BookOpen className="h-3 w-3" />{tx("已存入")}</span> : <button onClick={async e => {
              e.stopPropagation();
              try {
                const res = await fetch(`/api/accounts/${accountId}/knowledge`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    title: item.title,
                    content: `${item.summary}${item.originalTitle ? `\n\n原文标题：${item.originalTitle}` : ""}\n\n来源: ${item.url}`,
                    category: "industry"
                  })
                });
                if (!res.ok) throw new Error("保存失败");
                setSavedNewsIndexes(prev => new Set(prev).add(idx));
                toast("已保存到知识库", "success");
                await fetchItems();
              } catch {
                toast("保存失败，请重试", "error");
              }
            }} className="flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[11px] font-medium text-purple-600 hover:bg-purple-500/20 transition-colors">
                        <BookOpen className="h-3 w-3" />{tx("存入知识库")}</button>}
                  </div>
                </div>)}
            </div>}

          <p className="text-xs text-muted">{tx("新闻结果已自动保存至活动时间线")}</p>
        </div>}

      {/* Section C: 竞争对手 */}
      {section === "competitors" && <CompetitorsTab accountId={accountId} />}
    </div>;
}
