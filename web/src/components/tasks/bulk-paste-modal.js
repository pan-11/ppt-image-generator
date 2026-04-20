import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
export function BulkPasteModal(props) {
    const [value, setValue] = useState("");
    const prompts = useMemo(() => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, props.maxBatchSize), [props.maxBatchSize, value]);
    if (!props.open) {
        return null;
    }
    return (_jsx("div", { className: "modal-backdrop", children: _jsxs("div", { className: "modal-card", children: [_jsxs("div", { className: "panel-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "panel-kicker", children: "\u6279\u91CF\u5BFC\u5165" }), _jsx("h3", { children: "\u4E00\u884C\u4E00\u4E2A\u63D0\u793A\u8BCD" })] }), _jsx("button", { className: "ghost-button", onClick: props.onClose, children: "\u5173\u95ED" })] }), _jsxs("label", { className: "stacked", children: [_jsx("span", { children: "\u63D0\u793A\u8BCD\u5217\u8868" }), _jsx("textarea", { "aria-label": "\u63D0\u793A\u8BCD\u5217\u8868", value: value, onChange: (event) => setValue(event.target.value), placeholder: "\u7B2C\u4E00\u884C\u4E00\u4E2A\u63D0\u793A\u8BCD\n\u7B2C\u4E8C\u884C\u4E00\u4E2A\u63D0\u793A\u8BCD" })] }), _jsxs("div", { className: "modal-footer", children: [_jsxs("span", { children: ["\u5C06\u5BFC\u5165 ", prompts.length, " \u6761\uFF0C\u5355\u6279\u6700\u591A ", props.maxBatchSize, " \u6761"] }), _jsx("button", { className: "primary-button", onClick: () => props.onImport(prompts), children: `导入 ${prompts.length} 条` })] })] }) }));
}
