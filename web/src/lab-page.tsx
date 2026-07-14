import { useEffect, useState } from "react";
import { ComparisonTable } from "./components/lab/comparison-table";
import { ProviderForm, type ProviderDraft } from "./components/lab/provider-form";
import {
  checkLabProvider,
  fetchBenchmarks,
  fetchLabProviders,
  runBenchmark,
  saveLabProvider,
  type BenchmarkRecord,
  type LabProvider,
  type ProviderCheck
} from "./lib/lab-api";

const aspectRatios = ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"];
const resolutions = ["1K", "2K", "4K", "standard"];

function formatDuration(value: number) {
  return `${(value / 1000).toFixed(1)} 秒`;
}

function formatReported(value: unknown) {
  if (value === null || value === undefined) {
    return "未返回";
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
}

export default function LabPage() {
  const [providers, setProviders] = useState<LabProvider[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRecord[]>([]);
  const [editing, setEditing] = useState<LabProvider | null>(null);
  const [checks, setChecks] = useState<Record<string, ProviderCheck>>({});
  const [saving, setSaving] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1K");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);

  useEffect(() => {
    Promise.all([fetchLabProviders(), fetchBenchmarks()])
      .then(([nextProviders, nextBenchmarks]) => {
        setProviders(nextProviders);
        setBenchmarks(nextBenchmarks);
        const firstProvider = nextProviders.find((provider) => provider.enabled);
        setProviderId(firstProvider?.id ?? "");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "加载失败"));
  }, []);

  const refreshProviders = async () => {
    const next = await fetchLabProviders();
    setProviders(next);
    if (!next.some((provider) => provider.id === providerId && provider.enabled)) {
      setProviderId(next.find((provider) => provider.enabled)?.id ?? "");
    }
  };

  const saveProvider = async (draft: ProviderDraft) => {
    setSaving(true);
    setError(null);
    try {
      await saveLabProvider({ id: editing?.id, name: draft.name, baseUrl: draft.baseUrl, apiKey: draft.apiKey || undefined, notes: draft.notes, enabled: draft.enabled });
      setEditing(null);
      await refreshProviders();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
      throw reason;
    } finally {
      setSaving(false);
    }
  };

  const checkProvider = async (id: string) => {
    setCheckingId(id);
    setError(null);
    try {
      const result = await checkLabProvider(id);
      setChecks((current) => ({ ...current, [id]: result }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "检查失败");
    } finally {
      setCheckingId(null);
    }
  };

  const startBenchmark = async () => {
    if (!window.confirm("本次测试会真实生成 1 张图片并消耗对应额度，继续吗？")) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      await runBenchmark({ providerId, prompt, model, aspectRatio, resolution }, referenceImage);
      setBenchmarks(await fetchBenchmarks());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "测试失败");
      setBenchmarks(await fetchBenchmarks().catch(() => benchmarks));
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="lab-page">
      <header className="lab-header">
        <div><p className="lab-kicker">Relay Lab</p><h1>中转站实验室</h1></div>
        <a className="lab-back-link" href="/">返回生图工作台</a>
      </header>

      {error ? <div className="lab-error" role="alert">{error}</div> : null}

      <section className="lab-section">
        <div className="lab-section-heading"><div><span>01</span><h2>中转站配置</h2></div><strong>密钥仅保存在本机</strong></div>
        <ProviderForm editing={editing} saving={saving} onCancel={() => setEditing(null)} onSave={saveProvider} />
        <div className="lab-table-scroll">
          <table className="lab-table">
            <thead><tr><th>名称</th><th>Base URL</th><th>Key</th><th>备注</th><th>状态</th><th>连通性</th><th>操作</th></tr></thead>
            <tbody>
              {providers.map((provider) => {
                const check = checks[provider.id];
                return (
                  <tr key={provider.id}>
                    <td>{provider.name}</td><td className="lab-mono">{provider.baseUrl}</td><td className="lab-mono">{provider.apiKeyMask}</td><td className="lab-notes-cell">{provider.notes || "-"}</td>
                    <td>{provider.enabled ? "启用" : "停用"}</td>
                    <td>{check ? `${check.reachable ? check.authorized ? "已响应" : "认证拒绝" : "未连接"} · ${check.latencyMs} ms` : "未检查"}</td>
                    <td><div className="lab-row-actions"><button type="button" onClick={() => setEditing(provider)}>编辑</button><button type="button" disabled={checkingId === provider.id} onClick={() => void checkProvider(provider.id)}>{checkingId === provider.id ? "检查中" : "检查"}</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lab-section">
        <div className="lab-section-heading"><div><span>02</span><h2>单张基准测试</h2></div><strong>固定单并发</strong></div>
        <div className="lab-benchmark-grid">
          <label><span>中转站</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}>{providers.filter((provider) => provider.enabled).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
          <label><span>模型</span><input required type="text" value={model} onChange={(event) => setModel(event.target.value)} /></label>
          <label><span>比例</span><select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>{aspectRatios.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>分辨率</span><select value={resolution} onChange={(event) => setResolution(event.target.value)}>{resolutions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="lab-reference-field"><span>参考图（可选）</span><input type="file" accept="image/*" onChange={(event) => setReferenceImage(event.target.files?.[0] ?? null)} /></label>
          <label className="lab-prompt"><span>提示词</span><textarea required value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
        </div>
        <button className="primary-button lab-run-button" type="button" disabled={running || !providerId || !model.trim() || !prompt.trim()} onClick={() => void startBenchmark()}>{running ? "测试生成中" : referenceImage ? "提交参考图测试" : "生成 1 张测试图"}</button>
      </section>

      <section className="lab-section">
        <div className="lab-section-heading"><div><span>03</span><h2>中转站对比</h2></div><strong>{benchmarks.length} 条记录</strong></div>
        <ComparisonTable records={benchmarks} />
      </section>

      <section className="lab-section">
        <div className="lab-section-heading"><div><span>04</span><h2>测试明细</h2></div></div>
        <div className="lab-table-scroll">
          <table className="lab-table lab-detail-table">
            <thead><tr><th>结果</th><th>类型</th><th>中转站</th><th>模型</th><th>上传</th><th>提交</th><th>生成</th><th>下载</th><th>总耗时</th><th>额度</th></tr></thead>
            <tbody>{benchmarks.map((record) => <tr key={record.id}><td>{record.imageUrl ? <img className="lab-thumb" src={record.imageUrl} alt="测试生成结果" /> : record.errorMessage ?? "失败"}</td><td>{record.testMode === "reference-image" ? <>参考图<br /><small>{record.referenceFilename}</small></> : "文生图"}</td><td>{record.providerName}</td><td>{record.model}<br />{record.aspectRatio} · {record.resolution}</td><td>{formatDuration(record.uploadMs)}</td><td>{formatDuration(record.submitMs)}</td><td>{formatDuration(record.generationMs)}</td><td>{formatDuration(record.downloadMs)}</td><td>{formatDuration(record.totalMs)}</td><td>{formatReported(record.reportedCost)}<br /><small>{formatReported(record.reportedUsage)}</small></td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
