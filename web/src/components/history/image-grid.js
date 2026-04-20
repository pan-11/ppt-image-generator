import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ImageGrid(props) {
    if (props.images.length === 0) {
        return _jsx("p", { className: "muted-copy", children: "\u8BE5\u6279\u6B21\u8FD8\u6CA1\u6709\u843D\u76D8\u56FE\u7247\u3002" });
    }
    return (_jsx("div", { className: "image-grid", children: props.images.map((image) => (_jsxs("article", { className: "image-card", children: [_jsxs("div", { className: "image-meta", children: [_jsx("strong", { children: image.filename }), _jsx("span", { children: image.local_path })] }), _jsxs("div", { className: "image-actions", children: [_jsx("a", { className: "ghost-button", href: `/api/download/images/${image.id}`, children: "\u4E0B\u8F7D" }), _jsx("button", { className: "ghost-button danger-button", onClick: () => void props.onDeleteImage(image.id), children: "\u5220\u9664" })] })] }, image.id))) }));
}
