import { useState } from "react";

type PreviewImageNode = {
  id: string;
  title: string;
  prompt: string;
  children?: PreviewImageNode[];
};

const firstTree: PreviewImageNode = {
  id: "result-1",
  title: "结果图1",
  prompt: "第1页主视觉：PPT开场页的科技感会议场景，留出标题空间",
  children: [
    {
      id: "result-2",
      title: "结果图2",
      prompt: "基于结果图1生成无文字背景版，保留构图和光影，不要任何文字",
      children: []
    },
    {
      id: "result-3",
      title: "结果图3",
      prompt: "基于结果图1提取其中的核心插图元素，适合放在内容页右侧",
      children: [
        {
          id: "result-4",
          title: "结果图4",
          prompt: "基于结果图3继续生成一个独立文本框装饰素材，透明感，适合PPT信息卡片",
          children: []
        }
      ]
    }
  ]
};

function makeRows() {
  return Array.from({ length: 30 }, (_, index) => ({
    id: `page-${index + 1}`,
    page: index + 1,
    prompt: index === 0 ? firstTree.prompt : ""
  }));
}

function seedPromptState(node: PreviewImageNode, state: Record<string, string[]> = {}) {
  state[node.id] = node.children && node.children.length > 0
    ? node.children.map((child) => child.prompt)
    : [""];

  node.children?.forEach((child) => seedPromptState(child, state));
  return state;
}

type ResultBranchProps = {
  node: PreviewImageNode;
  promptsByNode: Record<string, string[]>;
  onAddPrompt: (nodeId: string) => void;
  onPromptChange: (nodeId: string, index: number, value: string) => void;
};

function ResultBranch(props: ResultBranchProps) {
  return (
    <article className="preview-result-node" data-testid={`preview-node-${props.node.id}`}>
      <div className="preview-node-main">
        <div className="preview-image-card" aria-label={props.node.title}>
          <span>{props.node.title}</span>
        </div>

        <div className="preview-reference-panel">
          <div className="preview-reference-heading">
            <p>以这个图为参考图</p>
            <button
              type="button"
              className="preview-mini-button"
              data-testid={`preview-add-prompt-${props.node.id}`}
              onClick={() => props.onAddPrompt(props.node.id)}
            >
              新增一条
            </button>
          </div>

          <div className="preview-child-prompt-list" data-testid={`preview-prompts-${props.node.id}`}>
            {(props.promptsByNode[props.node.id] ?? [""]).map((prompt, index) => (
              <label className="preview-prompt-card preview-child-prompt" key={`${props.node.id}-${index}`}>
                <span>子提示词 {index + 1}</span>
                <textarea
                  aria-label={`子提示词 ${index + 1}`}
                  value={prompt}
                  onChange={(event) => props.onPromptChange(props.node.id, index, event.target.value)}
                  placeholder="输入基于这张结果图继续生成的提示词"
                />
              </label>
            ))}
          </div>

          <button type="button" className="preview-generate-button">生成子图</button>
        </div>
      </div>

      {props.node.children && props.node.children.length > 0 ? (
        <div className="preview-children">
          {props.node.children.map((child) => (
            <ResultBranch
              key={child.id}
              node={child}
              promptsByNode={props.promptsByNode}
              onAddPrompt={props.onAddPrompt}
              onPromptChange={props.onPromptChange}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function StaticPreviewPage() {
  const [rows, setRows] = useState(makeRows);
  const [promptsByNode, setPromptsByNode] = useState(() => seedPromptState(firstTree));

  const onAddPrompt = (nodeId: string) => {
    setPromptsByNode((current) => ({
      ...current,
      [nodeId]: [...(current[nodeId] ?? []), ""]
    }));
  };

  const onPromptChange = (nodeId: string, index: number, value: string) => {
    setPromptsByNode((current) => ({
      ...current,
      [nodeId]: (current[nodeId] ?? [""]).map((prompt, promptIndex) => (
        promptIndex === index ? value : prompt
      ))
    }));
  };

  return (
    <main className="preview-page">
      <header className="preview-header">
        <div>
          <p>PPT Image Workflow Mock</p>
          <h1>PPT配图分支生成预览</h1>
        </div>
        <a className="preview-back-link" href="/">返回当前项目</a>
      </header>

      <section className="preview-task-list" aria-label="静态任务预览">
        {rows.map((row, index) => (
          <article className="preview-task-row" key={row.id}>
            <div className="preview-row-index">P{String(row.page).padStart(2, "0")}</div>
            <div className="preview-horizontal-canvas">
              <label className="preview-prompt-card preview-main-prompt">
                <span>第{row.page}页主提示词</span>
                <textarea
                  aria-label={`第${row.page}页主提示词`}
                  value={row.prompt}
                  onChange={(event) => {
                    const nextRows = [...rows];
                    nextRows[index] = { ...row, prompt: event.target.value };
                    setRows(nextRows);
                  }}
                  placeholder="输入这一页PPT需要生成的主画面"
                />
              </label>

              <div className="preview-arrow" aria-hidden="true" />

              {index === 0 ? (
                <ResultBranch
                  node={firstTree}
                  promptsByNode={promptsByNode}
                  onAddPrompt={onAddPrompt}
                  onPromptChange={onPromptChange}
                />
              ) : (
                <div className="preview-image-card preview-empty-image">
                  <span>结果图{row.page}</span>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
