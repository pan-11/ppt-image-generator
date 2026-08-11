import { useEffect, useState, type FormEvent } from "react";
import {
  activateProviderSetting,
  fetchProviderSettings,
  saveProviderSetting,
  type ProviderSetting,
  type ProviderSettingsState
} from "./lib/provider-settings-api";

type ProviderDraft = {
  name: string;
  baseUrl: string;
  apiKey: string;
  notes: string;
};

const emptyDraft: ProviderDraft = {
  name: "",
  baseUrl: "",
  apiKey: "",
  notes: ""
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

export default function SettingsPage() {
  const [state, setState] = useState<ProviderSettingsState | null>(null);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft);
  const [editing, setEditing] = useState<ProviderSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
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
      notes: provider.notes
    });
    setError(null);
  };

  const submitProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveProviderSetting({ id: editing?.id, ...draft });
      setState(await fetchProviderSettings());
      resetForm();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setSaving(false);
    }
  };

  const activateProvider = async (providerId: string) => {
    setActivatingId(providerId);
    setError(null);
    try {
      setState(await activateProviderSetting(providerId));
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setActivatingId(null);
    }
  };

  const activeProvider = state?.providers.find((provider) => provider.id === state.activeProviderId);

  return (
    <main className="provider-settings-page">
      <header className="provider-settings-header">
        <div>
          <p className="provider-settings-kicker">Generation Relay</p>
          <h1>中转站设置</h1>
          <p>新批次会使用提交时选中的中转站，进行中的任务不会随设置切换。</p>
        </div>
        <nav className="provider-settings-nav" aria-label="设置页导航">
          <a href="/lab">测试实验室</a>
          <a href="/">返回生图工作台</a>
        </nav>
      </header>

      {error ? <div className="provider-settings-error" role="alert">{error}</div> : null}

      <section className="provider-current-band" aria-labelledby="current-provider-title">
        <div>
          <span id="current-provider-title">当前使用</span>
          <strong>{activeProvider?.name ?? "环境变量配置"}</strong>
        </div>
        <p>
          {activeProvider
            ? `${activeProvider.baseUrl} · ${activeProvider.apiKeyMask}`
            : "尚未选择正式中转站，新批次继续使用 .env 中的配置。"}
        </p>
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
                  {provider.isActive ? <span>正在使用</span> : null}
                </div>
                <p>{provider.baseUrl}</p>
                <div className="provider-row-meta">
                  <code>{provider.apiKeyMask}</code>
                  <span>{provider.notes || "无备注"}</span>
                </div>
              </div>
              <div className="provider-row-actions">
                <button type="button" className="secondary-button" aria-label={`编辑${provider.name}`} onClick={() => startEditing(provider)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="primary-button"
                  aria-label={provider.isActive ? `正在使用${provider.name}` : `设为当前使用${provider.name}`}
                  disabled={provider.isActive || activatingId === provider.id}
                  onClick={() => void activateProvider(provider.id)}
                >
                  {provider.isActive ? "正在使用" : activatingId === provider.id ? "切换中" : "设为当前使用"}
                </button>
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
