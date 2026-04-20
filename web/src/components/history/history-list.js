import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { HistoryCard } from "./history-card";
export function HistoryList(props) {
    return (_jsxs("section", { className: "panel history-panel", children: [_jsx("div", { className: "panel-heading", children: _jsxs("div", { children: [_jsx("p", { className: "panel-kicker", children: "\u5386\u53F2\u8BB0\u5F55" }), _jsx("h2", { children: "\u672C\u5730\u4FDD\u5B58\uFF0C\u968F\u65F6\u53EF\u5220" })] }) }), props.loading ? _jsx("p", { className: "muted-copy", children: "\u6B63\u5728\u52A0\u8F7D\u5386\u53F2..." }) : null, _jsx("div", { className: "history-list", children: props.items.map((item) => (_jsx(HistoryCard, { item: item, onDeleteBatch: props.onDeleteBatch, onDeleteImage: props.onDeleteImage }, item.batch.id))) })] }));
}
