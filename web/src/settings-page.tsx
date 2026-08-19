import { useEffect, useState, type FormEvent } from "react";
import {
  fetchProviderSettings,
  saveProviderSetting,
  setRoleProvider,
  type ProviderSetting,
  type ProviderSettingsState,
  type ProviderYunfeiKeyType
} from "./lib/provider-settings-api";

type ProviderDraft = {
  name: string;
  baseUrl: string;
  apiKey: string;
  protocolType: ProviderSetting["protocolType"];
  yunfeiKeyType: ProviderYunfeiKeyType;
  maxConcurrency: string;
  notes: string;
};

const emptyDraft: ProviderDraft = {
  name: "",
  baseUrl: "",
  apiKey: "",
  protocolType: "toapis-async",
  yunfeiKeyType: "gpt-image-2-1k",
  maxConcurrency: "30",
  notes: ""
};

const yunfeiKeyTypeLabels: Record<ProviderYunfeiKeyType, string> = {
  "gpt-image-2-1k": "GPT Image 2 · 1K",
  "gpt-image-2-4k": "GPT Image 2 · 4K",
  "banana-2": "香蕉2",
  "banana-pro": "香蕉Pro"
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

export default function SettingsPage() {
  const [state, setState] = useState<ProviderSettingsState | null>(null);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft);
  const [editing, setEditing] = useState<ProviderSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const [switchingRole, setSwitchingRole] = useState<"text" | "image" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProviderSettings()
      .then(setState)
      .catch((reason) => setError(messageFrom(reason)));
  }, []);

  const updateDraft = (field: keyof ProviderDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setEditing(null);
    setDraft(emptyDraft);
  };

  const startEditing = (provider: ProviderSetting) => {
    setEditing(provider);
    setDraft({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: "",
      protocolType: provider.protocolType,
      yunfeiKeyType: provider.yunfeiKeyType ?? "gpt-image-2-1k",
      maxConcurrency: String(provider.maxConcurrency),
      notes: provider.notes
    });
    setError(null);
  };

  const submitProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveProviderSetting({
        id: editing?.id,
        ...draft,
        yunfeiKeyType: draft.protocolType === "yunfei-hybrid-images"
          ? draft.yunfeiKeyType
          : undefined,
        maxConcurrency: Number(draft.maxConcurrency)
      });
      setState(await fetchProviderSettings());
      resetForm();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setSaving(false);
    }
  };

  const changeRoleProvider = async (role: "text" | "image", providerId: string) => {
    setSwitchingRole(role);
    setError(null);
    try {
      setState(await setRoleProvider(role, providerId));
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setSwitchingRole(null);
    }
  };

  const roleOptions = (role: "text" | "image") => (
    state?.providers.filter((provider) => provider.capabilities[role]) ?? []
  );

  return (
    <main className="provider-settings-page">
      <header className="provider-settings-header">
        <div>
          <p className="provider-settings-kicker">Generation Relay</p>
          <h1>中转站设置</h1>
          <p>每个新请求在实际提交时使用对应角色的中转站；已经取得远程任务信息的请求仍由原中转站恢复。</p>
        </div>
        <nav className="provider-settings-nav" aria-label="设置页导航">
          <a href="/lab">测试实验室</a>
          <a href="/">返回生图工作台</a>
        </nav>
      </header>

      {error ? <div className="provider-settings-error" role="alert">{error}</div> : null}

      <section className="provider-current-band provider-role-band" aria-label="生成角色中转站">
        <label>
          <span>文生图中转站</span>
          <select
            value={state?.activeTextProviderId ?? ""}
            disabled={!state || switchingRole === "text"}
            onChange={(event) => void changeRoleProvider("text", event.target.value)}
          >
            {roleOptions("text").map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>图生图中转站</span>
          <select
            value={state?.activeImageProviderId ?? ""}
            disabled={!state || switchingRole === "image"}
            onChange={(event) => void changeRoleProvider("image", event.target.value)}
          >
            {roleOptions("image").map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="provider-settings-section" aria-labelledby="provider-form-title">
        <div className="provider-section-heading">
          <div>
            <span>01</span>
            <h2 id="provider-form-title">{editing ? "编辑中转站" : "新增中转站"}</h2>
          </div>
          {editing ? <strong>正在编辑 {editing.name}</strong> : <strong>Key 仅保存在本机</strong>}
        </div>

        <form className="provider-settings-form" onSubmit={(event) => void submitProvider(event)}>
          <label>
            <span>名称</span>
            <input
              required
              value={draft.name}
              onChange={(event) => updateDraft("name", event.target.value)}
              placeholder="例如：主力中转站"
            />
          </label>
          <label>
            <span>Base URL</span>
            <input
              required
              type="url"
              value={draft.baseUrl}
              onChange={(event) => updateDraft("baseUrl", event.target.value)}
              placeholder="https://relay.example.com/v1"
            />
          </label>
          <label>
            <span>API Key</span>
            <input
              required={!editing}
              type="password"
              autoComplete="new-password"
              value={draft.apiKey}
              onChange={(event) => updateDraft("apiKey", event.target.value)}
              placeholder={editing ? "留空则保留现有 Key" : "输入 API Key"}
            />
          </label>
          <label>
            <span>协议类型</span>
            <select
              value={draft.protocolType}
              onChange={(event) => updateDraft("protocolType", event.target.value)}
            >
              <option value="toapis-async">ToAPIs 异步任务</option>
              <option value="ym2-openai-images">YM2 OpenAI Images</option>
              <option value="yunfei-hybrid-images">云飞混合图像</option>
            </select>
          </label>
          {draft.protocolType === "yunfei-hybrid-images" ? (
            <label>
              <span>云飞密钥类型</span>
              <select
                value={draft.yunfeiKeyType}
                onChange={(event) => updateDraft("yunfeiKeyType", event.target.value)}
              >
                <option value="gpt-image-2-1k">GPT Image 2 · 1K</option>
                <option value="gpt-image-2-4k">GPT Image 2 · 4K</option>
                <option value="banana-2">香蕉2（支持 1K / 2K / 4K）</option>
                <option value="banana-pro">香蕉Pro（支持 1K / 2K / 4K）</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>最大并发</span>
            <input
              required
              type="number"
              min={1}
              max={100}
              value={draft.maxConcurrency}
              onChange={(event) => updateDraft("maxConcurrency", event.target.value)}
            />
          </label>
          <label className="provider-notes-field">
            <span>备注</span>
            <textarea
              maxLength={2000}
              value={draft.notes}
              onChange={(event) => updateDraft("notes", event.target.value)}
              placeholder="例如：适合 1K PPT 配图"
            />
          </label>
          <div className="provider-form-actions">
            {editing ? <button type="button" className="secondary-button" onClick={resetForm}>取消</button> : null}
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "保存中" : editing ? "保存修改" : "保存中转站"}
            </button>
          </div>
        </form>
      </section>

      <section className="provider-settings-section" aria-labelledby="saved-providers-title">
        <div className="provider-section-heading">
          <div>
            <span>02</span>
            <h2 id="saved-providers-title">已保存的中转站</h2>
          </div>
          <strong>{state?.providers.length ?? 0} 条配置</strong>
        </div>

        <div className="provider-list">
          {state?.providers.length ? state.providers.map((provider) => (
            <article className="provider-row" key={provider.id}>
              <div className="provider-row-main">
                <div className="provider-row-title">
                  <h3>{provider.name}</h3>
                  {provider.isActiveText ? <span>文生图</span> : null}
                  {provider.isActiveImage ? <span>图生图</span> : null}
                  {provider.readonly ? <span>来自 .env（只读）</span> : null}
                </div>
                <p>{provider.baseUrl}</p>
                <div className="provider-row-meta">
                  <code>{provider.apiKeyMask}</code>
                  <span>{provider.protocolType === "toapis-async"
                    ? "ToAPIs 异步任务"
                    : provider.protocolType === "ym2-openai-images"
                      ? "YM2 OpenAI Images"
                      : "云飞混合图像"}</span>
                  {provider.yunfeiKeyType
                    ? <span>密钥类型 {yunfeiKeyTypeLabels[provider.yunfeiKeyType]}</span>
                    : null}
                  <span>最大并发 {provider.maxConcurrency}</span>
                  <span>{[
                    provider.capabilities.text ? "文生图" : null,
                    provider.capabilities.image ? "图生图" : null
                  ].filter(Boolean).join(" / ")}</span>
                  <span>{provider.notes || "无备注"}</span>
                </div>
              </div>
              <div className="provider-row-actions">
                {!provider.readonly ? (
                  <button type="button" className="secondary-button" aria-label={`编辑${provider.name}`} onClick={() => startEditing(provider)}>
                    编辑
                  </button>
                ) : null}
              </div>
            </article>
          )) : (
            <div className="provider-empty-state">还没有正式中转站配置。</div>
          )}
        </div>
      </section>
    </main>
  );
}
