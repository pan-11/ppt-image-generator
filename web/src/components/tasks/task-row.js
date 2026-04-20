import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function TaskRow(props) {
    const selectedModel = props.models.find((model) => model.value === props.row.model) ?? props.models[0];
    const onFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        const reference = await props.onUploadReference(file);
        props.onChange({
            ...props.row,
            referenceMode: "row",
            referenceImageId: reference.id
        });
        event.target.value = "";
    };
    return (_jsxs("div", { className: "task-row", children: [_jsx("textarea", { placeholder: "\u8F93\u5165\u63D0\u793A\u8BCD", value: props.row.prompt, onChange: (event) => props.onChange({ ...props.row, prompt: event.target.value }) }), _jsx("select", { value: props.row.model, onChange: (event) => {
                    const nextModel = props.models.find((item) => item.value === event.target.value) ?? props.models[0];
                    props.onChange({
                        ...props.row,
                        model: nextModel.value,
                        size: nextModel.sizes[0],
                        n: Math.min(props.row.n, nextModel.maxN)
                    });
                }, children: props.models.map((model) => (_jsx("option", { value: model.value, children: model.label }, model.value))) }), _jsx("select", { value: props.row.size, onChange: (event) => props.onChange({ ...props.row, size: event.target.value }), children: selectedModel.sizes.map((size) => (_jsx("option", { value: size, children: size }, size))) }), _jsx("input", { type: "number", min: 1, max: selectedModel.maxN, value: props.row.n, onChange: (event) => {
                    const next = Number(event.target.value);
                    props.onChange({
                        ...props.row,
                        n: Number.isNaN(next) ? 1 : Math.min(Math.max(next, 1), selectedModel.maxN)
                    });
                } }), _jsxs("select", { value: props.row.referenceMode, onChange: (event) => props.onChange({
                    ...props.row,
                    referenceMode: event.target.value,
                    referenceImageId: event.target.value === "row" ? props.row.referenceImageId : null
                }), children: [_jsx("option", { value: "none", children: "\u65E0\u53C2\u8003\u56FE" }), _jsx("option", { value: "global", children: "\u4F7F\u7528\u5168\u5C40\u53C2\u8003\u56FE" }), _jsx("option", { value: "row", children: "\u672C\u884C\u53C2\u8003\u56FE" })] }), _jsxs("label", { className: "inline-upload", children: [_jsx("span", { children: props.row.referenceMode === "row" && props.row.referenceImageId ? "已上传" : "上传行图" }), _jsx("input", { type: "file", accept: "image/*", onChange: onFileChange })] }), _jsxs("div", { className: "row-actions", children: [_jsx("button", { className: "ghost-button", onClick: props.onDuplicate, children: "\u590D\u5236" }), _jsx("button", { className: "ghost-button danger-button", onClick: props.onDelete, children: "\u5220\u9664" })] })] }));
}
