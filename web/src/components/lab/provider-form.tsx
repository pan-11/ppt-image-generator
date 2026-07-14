import { useEffect, useState, type FormEvent } from "react";
import type { LabProvider } from "../../lib/lab-api";

export type ProviderDraft = {
  name: string;
  baseUrl: string;
  apiKey: string;
  notes: string;
  enabled: boolean;
};

const emptyDraft: ProviderDraft = { name: "", baseUrl: "", apiKey: "", notes: "", enabled: true };

export function ProviderForm(props: {
  editing: LabProvider | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: ProviderDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(emptyDraft);

  useEffect(() => {
    setDraft(props.editing ? {
      name: props.editing.name,
      baseUrl: props.editing.baseUrl,
      apiKey: "",
      notes: props.editing.notes,
      enabled: props.editing.enabled
    } : emptyDraft);
  }, [props.editing]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await props.onSave(draft);
      if (!props.editing) {
        setDraft(emptyDraft);
      }
    } catch {
      // The parent renders the actionable error message.
    }
  };

  return (
    <form className="lab-form" onSubmit={(event) => void submit(event)}>
      <div className="lab-form-grid">
        <label>
          <span>中转站名称</span>
          <input required type="text" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label>
          <span>Base URL</span>
          <input required type="url" placeholder="https://example.com/v1" value={draft.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} />
        </label>
        <label>
          <span>{props.editing ? "API Key（留空则保留）" : "API Key"}</span>
          <input required={!props.editing} type="password" autoComplete="new-password" value={draft.apiKey} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} />
        </label>
        <label>
          <span>协议</span>
          <input type="text" value="ToAPIs 异步协议" disabled />
        </label>
        <label className="lab-notes-field">
          <span>测试备注</span>
          <textarea maxLength={2000} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
        </label>
      </div>
      <label className="lab-checkbox">
        <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
        <span>启用该中转站</span>
      </label>
      <div className="lab-actions">
        <button className="primary-button" type="submit" disabled={props.saving}>{props.saving ? "保存中" : props.editing ? "更新配置" : "添加中转站"}</button>
        {props.editing ? <button className="ghost-button" type="button" onClick={props.onCancel}>取消编辑</button> : null}
      </div>
    </form>
  );
}
