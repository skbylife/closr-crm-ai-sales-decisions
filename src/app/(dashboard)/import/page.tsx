'use client';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Upload, ArrowRight, Check, Download, AlertTriangle, ShieldCheck, History } from 'lucide-react';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import {
  buildImportGovernanceModel,
  type ImportFieldDef,
  type ImportRowAction,
} from '@/lib/crm-foundation/import-governance';

type ImportType = 'contacts' | 'accounts' | 'leads';
type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

interface CSVRow {
  [key: string]: string;
}

interface RecentImportJob {
  id: string;
  objectType: ImportType;
  sourceFilename: string | null;
  status: 'previewed' | 'published' | 'failed';
  rowCount: number;
  createCount: number;
  updateCount: number;
  conflictCount: number;
  skipCount: number;
  findingCount: number;
  createdAt: string;
  publishedAt: string | null;
}

type GovernanceSaveState =
  | { status: 'idle' }
  | { status: 'saved'; jobId: string; phase: 'previewed' | 'published' }
  | { status: 'degraded'; reason: string }
  | { status: 'failed'; message: string };

const CONTACT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: '姓名', required: true },
  { key: 'email', label: '邮箱', required: false },
  { key: 'phone', label: '电话', required: false },
  { key: 'title', label: '职位', required: false },
  { key: 'company', label: '公司名称', required: true },
  { key: 'role', label: '角色', required: false },
  { key: 'department', label: '部门', required: false },
  { key: 'linkedin', label: 'LinkedIn', required: false },
  { key: 'notes', label: '备注', required: false },
];

const ACCOUNT_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: '公司名称', required: true },
  { key: 'industry', label: '行业', required: false },
  { key: 'website', label: '网站', required: false },
  { key: 'employee_count', label: '员工数', required: false },
  { key: 'annual_revenue', label: '年收入', required: false },
  { key: 'country', label: '国家', required: false },
  { key: 'city', label: '城市', required: false },
  { key: 'notes', label: '备注', required: false },
];

const LEAD_FIELDS: ImportFieldDef[] = [
  { key: 'companyName', label: '公司名称', required: true },
  { key: 'contactName', label: '联系人', required: true },
  { key: 'email', label: '邮箱', required: false },
  { key: 'phone', label: '电话', required: false },
  { key: 'title', label: '职位', required: false },
  { key: 'source', label: '来源', required: false },
  { key: 'need', label: '需求', required: true },
  { key: 'estimatedValue', label: '预估金额', required: false },
  { key: 'currency', label: '币种', required: false },
  { key: 'priority', label: '优先级', required: false },
  { key: 'nextStep', label: '下一步', required: false },
  { key: 'notes', label: '备注', required: false },
];

function fieldsFor(type: ImportType): ImportFieldDef[] {
  if (type === 'contacts') return CONTACT_FIELDS;
  if (type === 'accounts') return ACCOUNT_FIELDS;
  return LEAD_FIELDS;
}

function objectTypeLabel(type: ImportType) {
  if (type === 'contacts') return '联系人';
  if (type === 'accounts') return '客户';
  return '线索';
}

function parseCSV(text: string): { headers: string[]; rows: CSVRow[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: CSVRow = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
  return { headers, rows };
}

export default function ImportPage() {
  const { accounts } = useRoleFilteredData();
  const [importType, setImportType] = useState<ImportType>('contacts');
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<number, ImportRowAction>>({});
  const [sourceFilename, setSourceFilename] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; merged: number; skipped: number; errors: number; errorMessages: string[] } | null>(null);
  const [governanceSave, setGovernanceSave] = useState<GovernanceSaveState>({ status: 'idle' });
  const [recentJobs, setRecentJobs] = useState<RecentImportJob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = fieldsFor(importType);
  const governance = useMemo(() => buildImportGovernanceModel({
    type: importType,
    rows: csvRows.map((row, rowIndex) => ({ rowIndex, values: row })),
    fields,
    mapping,
    accounts,
    decisions,
  }), [accounts, csvRows, decisions, fields, importType, mapping]);

  const loadRecentJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/import-governance/jobs?limit=5');
      const data = await res.json().catch(() => ({})) as { jobs?: RecentImportJob[]; skipped?: boolean; reason?: string };
      if (res.ok && Array.isArray(data.jobs)) setRecentJobs(data.jobs);
      if (data.skipped) setGovernanceSave({ status: 'degraded', reason: data.reason ?? 'import_governance_unavailable' });
    } catch {
      // Recent governance history is non-blocking for the CSV import workflow.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecentJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRecentJobs]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFilename(file.name);
    setGovernanceSave({ status: 'idle' });
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      // Auto-map by fuzzy matching
      const autoMap: Record<string, string> = {};
      for (const field of fields) {
        const match = headers.find(h =>
          h.toLowerCase().includes(field.key) ||
          h.toLowerCase().includes(field.label.toLowerCase()) ||
          (field.key === 'name' && h.toLowerCase().includes('名')) ||
          (field.key === 'email' && h.toLowerCase().includes('邮')) ||
          (field.key === 'phone' && (h.toLowerCase().includes('电话') || h.toLowerCase().includes('phone'))) ||
          (field.key === 'title' && (h.toLowerCase().includes('职位') || h.toLowerCase().includes('title'))) ||
          ((field.key === 'company' || field.key === 'companyName') && (h.toLowerCase().includes('公司') || h.toLowerCase().includes('company'))) ||
          ((field.key === 'contactName' || field.key === 'name') && (h.toLowerCase().includes('联系人') || h.toLowerCase().includes('姓名') || h.toLowerCase().includes('name'))) ||
          (field.key === 'need' && (h.toLowerCase().includes('需求') || h.toLowerCase().includes('need'))) ||
          (field.key === 'estimatedValue' && (h.toLowerCase().includes('金额') || h.toLowerCase().includes('value'))) ||
          (field.key === 'priority' && (h.toLowerCase().includes('优先') || h.toLowerCase().includes('priority')))
        );
        if (match) autoMap[field.key] = match;
      }
      setMapping(autoMap);
      setDecisions({});
      setStep('mapping');
    };
    reader.readAsText(file);
  }, [fields]);

  function mappedValuesFor(row: CSVRow) {
    const mapped: Record<string, string> = {};
    for (const [fieldKey, csvHeader] of Object.entries(mapping)) {
      if (csvHeader && row[csvHeader]) mapped[fieldKey] = row[csvHeader];
    }
    return mapped;
  }

  async function saveImportGovernance(status: 'previewed' | 'published') {
    try {
      const res = await fetch('/api/import-governance/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectType: importType,
          sourceFilename,
          status,
          rowCount: csvRows.length,
          counts: governance.counts,
          mapping,
          decisions,
          rows: governance.previewRows.map((previewRow) => {
            const sourceValues = csvRows[previewRow.rowIndex] ?? {};
            return {
              rowIndex: previewRow.rowIndex,
              sourceValues,
              mappedValues: mappedValuesFor(sourceValues),
              plannedAction: previewRow.action,
            };
          }),
          duplicates: governance.duplicates.map((candidate) => ({
            rowIndex: candidate.rowIndex,
            importedName: candidate.importedName,
            existingId: candidate.existingId,
            existingName: candidate.existingName,
            matchType: candidate.matchType,
            confidence: candidate.confidence,
            recommendation: candidate.recommendation,
          })),
          findings: governance.findings.map((finding) => ({
            rowIndex: finding.rowIndex,
            field: finding.field,
            label: finding.label,
            detail: finding.detail,
            severity: finding.severity,
          })),
        }),
      });
      const data = await res.json().catch(() => ({})) as { jobId?: string; skipped?: boolean; reason?: string; error?: string };
      if (res.ok && data.jobId) {
        setGovernanceSave({ status: 'saved', jobId: data.jobId, phase: status });
        void loadRecentJobs();
        return data.jobId;
      }
      if (data.skipped) {
        setGovernanceSave({ status: 'degraded', reason: data.reason ?? 'import_governance_unavailable' });
        return null;
      }
      setGovernanceSave({ status: 'failed', message: data.error ?? '导入治理记录保存失败' });
      return null;
    } catch {
      setGovernanceSave({ status: 'failed', message: '导入治理记录暂时无法保存' });
      return null;
    }
  }

  async function handlePreview() {
    setStep('preview');
    await saveImportGovernance('previewed');
  }

  const handleImport = async () => {
    setImporting(true);
    setStep('importing');
    const governanceJobId = await saveImportGovernance('published');
    let success = 0;
    let merged = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const previewRow of governance.previewRows) {
      if (previewRow.action === 'skip' || previewRow.action === 'conflict') {
        skipped++;
        continue;
      }
      const row = csvRows[previewRow.rowIndex];
      try {
        const mapped = mappedValuesFor(row);
        if (!mapped.name) { errors++; errorMessages.push('缺少名称: ' + JSON.stringify(row).slice(0, 50)); continue; }

        if (previewRow.action === 'update') {
          if (!previewRow.duplicate?.existingId) {
            errors++;
            errorMessages.push(`${mapped.name}: 缺少可合并的现有记录`);
            continue;
          }
          const res = await fetch('/api/import-governance/merges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              objectType: importType,
              importJobId: governanceJobId,
              rowIndex: previewRow.rowIndex,
              existingId: previewRow.duplicate.existingId,
              incoming: mapped,
              importedName: previewRow.duplicate.importedName || mapped.name,
            }),
          });
          if (res.ok) merged++;
          else {
            errors++;
            const err = await res.json().catch(() => ({})) as { error?: string };
            errorMessages.push(`${mapped.name}: ${err.error || '合并失败'}`);
          }
          continue;
        }

        if (previewRow.duplicate) mapped.allowDuplicate = 'true';

        const endpoint = importType === 'contacts'
          ? '/api/contacts/import'
          : importType === 'accounts'
            ? '/api/accounts/import'
            : '/api/leads';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mapped),
        });
        if (res.ok) success++;
        else { errors++; const err = await res.json().catch(() => ({})); errorMessages.push(`${mapped.name}: ${err.error || '未知错误'}`); }
      } catch {
        errors++;
      }
    }
    setResult({ success, merged, skipped, errors, errorMessages });
    setStep('done');
    setImporting(false);
  };

  const downloadTemplate = () => {
    const headers = fields.map(f => f.label);
    const csv = headers.join(',') + '\n';
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${importType}-template.csv`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-3 py-4 sm:px-6 sm:py-6">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">数据导入</h1>
        <p className="text-sm text-muted mt-1">从 CSV 文件批量导入联系人或客户</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {(['upload', 'mapping', 'preview', 'done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="h-3 w-3 text-muted" />}
            <span className={`rounded-full px-2.5 py-1 font-medium ${
              step === s ? 'bg-accent text-white' :
              (['upload', 'mapping', 'preview', 'importing', 'done'].indexOf(step) > ['upload', 'mapping', 'preview', 'importing', 'done'].indexOf(s)) ? 'bg-positive/10 text-positive' : 'bg-sidebar text-muted'
            }`}>
              {s === 'upload' ? '上传' : s === 'mapping' ? '映射' : s === 'preview' ? '预览' : '完成'}
            </span>
          </div>
        ))}
      </div>

      {/* Type selector */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['contacts', 'accounts', 'leads'] as ImportType[]).map(t => (
              <button key={t} onClick={() => setImportType(t)} className={`rounded-lg px-4 py-2 text-sm font-medium ${importType === t ? 'bg-accent text-white' : 'border border-border text-foreground hover:bg-background'}`}>
                导入{objectTypeLabel(t)}
              </button>
            ))}
          </div>

          <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-accent hover:underline">
            <Download className="h-3.5 w-3.5" /> 下载 CSV 模板
          </button>

          <div
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12 cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
          >
            <Upload className="h-10 w-10 text-muted mb-3" />
            <p className="text-sm font-medium text-foreground">点击上传 CSV 文件</p>
            <p className="text-xs text-muted mt-1">支持 .csv 格式，UTF-8 编码</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </div>

          {recentJobs.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-foreground">最近导入治理记录</h2>
              </div>
              <div className="mt-3 divide-y divide-border">
                {recentJobs.map((job) => (
                  <div key={job.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_120px_120px] sm:items-center">
                    <div>
                      <p className="text-sm font-medium text-foreground">{job.sourceFilename || objectTypeLabel(job.objectType) + '导入'}</p>
                      <p className="text-[12px] text-muted">
                        {job.rowCount} 行 · 创建 {job.createCount} · 合并 {job.updateCount} · 冲突 {job.conflictCount} · 跳过 {job.skipCount} · 质量问题 {job.findingCount}
                      </p>
                    </div>
                    <span className="text-xs text-secondary">{objectTypeLabel(job.objectType)}</span>
                    <span className={job.status === 'published' ? 'text-xs font-semibold text-positive' : 'text-xs font-semibold text-warning'}>
                      {job.status === 'published' ? '已发布' : job.status === 'failed' ? '失败' : '已预览'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mapping */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <p className="text-sm text-foreground">检测到 <strong>{csvRows.length}</strong> 行数据，<strong>{csvHeaders.length}</strong> 列。请确认字段映射：</p>
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
            {fields.map(field => (
              <div key={field.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-xs font-medium text-foreground sm:w-32">{field.label} {field.required && <span className="text-danger">*</span>}</span>
                <ArrowRight className="hidden sm:block h-3 w-3 text-muted flex-shrink-0" />
                <select
                  value={mapping[field.key] || ''}
                  onChange={e => setMapping({ ...mapping, [field.key]: e.target.value })}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                >
                  <option value="">— 不导入 —</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                {mapping[field.key] && <Check className="h-4 w-4 text-positive" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            <button onClick={() => { setStep('upload'); setCsvRows([]); }} className="rounded-lg border border-border px-4 py-2 text-sm text-secondary hover:text-foreground">返回</button>
            <button onClick={handlePreview} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">下一步：预览</button>
          </div>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {governanceSave.status !== 'idle' && (
            <div className={governanceSave.status === 'saved' ? 'rounded-xl border border-positive/20 bg-positive/5 px-4 py-3 text-sm text-positive' : governanceSave.status === 'degraded' ? 'rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning' : 'rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger'}>
              {governanceSave.status === 'saved'
                ? (governanceSave.phase === 'published' ? '导入发布记录已保存' : '导入预览记录已保存')
                : governanceSave.status === 'degraded'
                  ? '导入治理表尚未启用，CSV 导入仍可继续'
                  : governanceSave.message}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted">将创建</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{governance.counts.create}</p>
            </div>
            <div className="rounded-xl border border-positive/20 bg-positive/5 p-4">
              <p className="text-xs font-medium text-positive">将合并</p>
              <p className="mt-2 text-2xl font-semibold text-positive">{governance.counts.update}</p>
            </div>
            <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
              <p className="text-xs font-medium text-warning">待处理重复</p>
              <p className="mt-2 text-2xl font-semibold text-warning">{governance.counts.conflict}</p>
            </div>
            <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
              <p className="text-xs font-medium text-danger">跳过</p>
              <p className="mt-2 text-2xl font-semibold text-danger">{governance.counts.skip}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted">质量问题</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{governance.findings.length}</p>
            </div>
          </div>

          {governance.duplicates.length > 0 && (
            <div className="rounded-xl border border-warning/20 bg-card p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-semibold text-foreground">Dedupe Queue</h2>
              </div>
              <div className="mt-3 divide-y divide-border">
                {governance.duplicates.slice(0, 8).map((candidate) => (
                  <div key={candidate.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_1fr_180px] sm:items-center">
                    <div>
                      <p className="text-sm font-medium text-foreground">{candidate.importedName}</p>
                      <p className="text-[12px] text-muted">导入行 {candidate.rowIndex + 1} · {candidate.matchType} · {candidate.confidence}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{candidate.existingName}</p>
                      <p className="text-[12px] text-muted">现有记录</p>
                    </div>
                    <select
                      value={decisions[candidate.rowIndex] ?? 'conflict'}
                      onChange={(event) => setDecisions({ ...decisions, [candidate.rowIndex]: event.target.value as ImportRowAction })}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
                    >
                      <option value="conflict">稍后处理</option>
                      <option value="update">合并到现有</option>
                      <option value="skip">跳过导入</option>
                      <option value="create">保留两条</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {governance.findings.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-foreground">Data Quality Queue</h2>
              </div>
              <div className="mt-3 grid gap-2">
                {governance.findings.slice(0, 10).map((finding) => (
                  <div key={finding.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{finding.label}</p>
                      <p className="text-[12px] text-muted">{finding.detail}</p>
                    </div>
                    <span className={finding.severity === 'high' ? 'rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger' : finding.severity === 'medium' ? 'rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning' : 'rounded-full bg-sidebar px-2 py-0.5 text-[11px] font-semibold text-secondary'}>
                      {finding.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm text-foreground">预览前 5 行：</p>
          <div className="rounded-xl border border-border overflow-x-auto -mx-1 sm:mx-0">
            <table className="w-full min-w-[480px] text-xs">
              <thead className="bg-sidebar">
                <tr>
                  {fields.filter(f => mapping[f.key]).map(f => <th key={f.key} className="text-left py-2 px-3 text-secondary">{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {fields.filter(f => mapping[f.key]).map(f => (
                      <td key={f.key} className="py-2 px-3 text-foreground">{row[mapping[f.key]] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">共 {csvRows.length} 行；{governance.counts.create} 行将创建，{governance.counts.update} 行将合并，{governance.counts.conflict + governance.counts.skip} 行暂不写入</p>
          <div className="flex justify-between">
            <button onClick={() => setStep('mapping')} className="rounded-lg border border-border px-4 py-2 text-sm text-secondary hover:text-foreground">返回</button>
            <button onClick={handleImport} disabled={importing} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
              {importing ? '导入中...' : '发布 ' + (governance.counts.create + governance.counts.update) + ' 条'}
            </button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent mb-4" />
          <p className="text-sm text-foreground">正在导入...</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-positive/20 bg-positive/5 p-6 text-center">
            <Check className="mx-auto h-10 w-10 text-positive mb-3" />
            <p className="text-lg font-bold text-foreground">导入完成</p>
            <p className="text-sm text-muted mt-1">创建 {result.success} 条 · 合并 {result.merged} 条 · 暂不写入 {result.skipped} 条 {result.errors > 0 ? '· 失败 ' + result.errors + ' 条' : ''}</p>
            {governanceSave.status === 'saved' && <p className="mt-2 text-xs text-positive">治理记录已保存：{governanceSave.jobId.slice(0, 8)}</p>}
            {governanceSave.status === 'degraded' && <p className="mt-2 text-xs text-warning">治理记录未保存：数据库表尚未启用</p>}
            {governanceSave.status === 'failed' && <p className="mt-2 text-xs text-danger">{governanceSave.message}</p>}
          </div>
          {result.errorMessages.length > 0 && (
            <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
              <p className="text-xs font-semibold text-danger mb-2">错误详情：</p>
              {result.errorMessages.slice(0, 10).map((msg, i) => (
                <p key={i} className="text-xs text-foreground">• {msg}</p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => { setStep('upload'); setCsvRows([]); setResult(null); setDecisions({}); }} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-background">继续导入</button>
            <Link href="/leads" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">进入线索池</Link>
            <Link href="/accounts" className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-background">查看客户</Link>
          </div>
        </div>
      )}
    </div>
  );
}
