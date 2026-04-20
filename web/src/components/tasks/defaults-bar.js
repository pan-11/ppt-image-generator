import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function DefaultsBar(props) {
    const selectedModel = props.models.find((model) => model.value === props.defaults.model) ?? props.models[0];
    const onFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        await props.onUploadGlobalReference(file);
        event.target.value = "";
    };
    return (_jsxs("section", { className: "panel defaults-panel", children: [_jsxs("div", { className: "panel-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "panel-kicker", children: "\u9ED8\u8BA4\u53C2\u6570" }), _jsx("h2", { children: "\u6279\u91CF\u65B0\u5EFA\u65F6\u81EA\u52A8\u5E26\u5165" })] }), _jsx("span", { className: "status-pill", children: "\u5E76\u53D1\u56FA\u5B9A 5" })] }), _jsxs("div", { className: "defaults-grid", children: [_jsxs("label", { children: ["\u6A21\u578B", _jsx("select", { value: props.defaults.model, onChange: (event) => {
                                    const nextModel = props.models.find((item) => item.value === event.target.value) ?? props.models[0];
                                    props.onDefaultsChange({
                                        ...props.defaults,
                                        model: nextModel.value,
                                        size: nextModel.sizes[0],
                                        n: Math.min(props.defaults.n, nextModel.maxN)
                                    });
                                }, children: props.models.map((model) => (_jsx("option", { value: model.value, children: model.label }, model.value))) })] }), _jsxs("label", { children: ["\u5C3A\u5BF8", _jsx("select", { value: props.defaults.size, onChange: (event) => props.onDefaultsChange({ ...props.defaults, size: event.target.value }), children: selectedModel.sizes.map((size) => (_jsx("option", { value: size, children: size }, size))) })] }), _jsxs("label", { children: ["\u5F20\u6570", _jsx("input", { type: "number", min: 1, max: selectedModel.maxN, value: props.defaults.n, onChange: (event) => {
                                    const next = Number(event.target.value);
                                    props.onDefaultsChange({
                                        ...props.defaults,
                                        n: Number.isNaN(next) ? 1 : Math.min(Math.max(next, 1), selectedModel.maxN)
                                    });
                                } })] }), _jsxs("label", { className: "upload-field", children: ["\u5168\u5C40\u53C2\u8003\u56FE", _jsx("input", { type: "file", accept: "image/*", onChange: onFileChange }), _jsx("span", { children: props.uploading ? "上传中..." : props.globalReferenceImage?.filename ?? "未设置" })] })] })] }));
}
