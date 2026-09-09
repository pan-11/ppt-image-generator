// Run only against the isolated courseware-browser-server.ts mock service.
const { chromium } = require(process.env.COURSEWARE_PLAYWRIGHT_MODULE || "playwright");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const base = "http://127.0.0.1:3019";
async function assertStripFrames(strip, count) {
  const boxes = await strip.locator(".history-thumbnail-button").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, top: rect.top };
  }));
  assert.equal(boxes.length, count);
  for (const box of boxes) {
    assert.ok(Math.abs(box.width - 160) <= 1 && Math.abs(box.height - 90) <= 1);
    assert.ok(Math.abs(box.top - boxes[0].top) <= 1, "Images must remain on one row");
  }
}

async function assertViewerFits(page, viewer, width) {
  const box = await viewer.locator(".modal-card").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

function batch(id, prefix, count, status = "completed") {
  return {
    batch: { id, name: `${prefix} · 历史验收批次`, status, total_tasks: 1, success_count: status === "completed" ? 1 : 0,
      failed_count: status === "failed" ? 1 : 0, created_at: "2026-09-09T08:00:00.000Z" },
    tasks: [{ id: `${id}-task`, batch_id: id, prompt: "完整提示词第一行\n第二行：保留全文。" + "细节描述。".repeat(300),
      model: "gpt-image-2", size: "16:9", aspect_ratio: "16:9", resolution: "1K", n: 1,
      status, ...(status === "failed" ? { error_message: "模拟任务失败" } : {}) }],
    jobs: [],
    images: Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}`, task_id: `${id}-task`,
      filename: `${prefix}-${index + 1}.png`, local_path: `mock/${prefix}-${index + 1}.png` }))
  };
}

(async () => {
  const output = path.resolve("app-data/courseware-acceptance");
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const mutations = [];
  let finished = false;
  let polls = 0;
  let historyRequests = 0;
  let missingImageRequests = 0;
  const histories = [batch("pages", "page", 23), batch("single", "single", 1), batch("large", "large", 100), batch("empty", "empty", 0, "failed")];
  histories[2].batch.name += "很长的批次名称".repeat(15);
  histories[0].jobs = [{ id: "mock-job", task_id: "pages-task", output_index: 1, mode: "text", status: "completed",
    provider_id: "mock", provider_name: "MockProvider" + "x".repeat(240), protocol_type: "toapis-async",
    requested_size: "1280x720", actual_width: 1280, actual_height: 720 }];
  histories[3].tasks[0].error_message = "https://mock.invalid/" + "remote-error".repeat(80);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  page.on("request", (request) => {
    if (request.url().startsWith(`${base}/api/`) && request.method() !== "GET") mutations.push(request.method() + " " + request.url());
  });
  await context.addInitScript(() => {
    localStorage.setItem("image-generator-editor-session", JSON.stringify({
      rows: [{ id: "editor-row", prompt: "浏览器模拟验收", note: "", model: "gpt-image-2", aspectRatio: "16:9",
        resolution: "1K", n: 1, referenceMode: "none", referenceImageId: null }],
      editorResults: { tasks: [], images: [] }, activeBatchId: "pages"
    }));
  });
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base || request.method() !== "GET") return route.abort("blockedbyclient");
    if (url.pathname === "/api/history") {
      historyRequests += 1;
      return route.fulfill({ json: histories });
    }
    if (url.pathname === "/api/batches/pages") {
      polls += 1;
      return route.fulfill({ json: {
      ...histories[0], batch: { ...histories[0].batch, status: finished ? "completed" : "running" },
      tasks: [{ ...histories[0].tasks[0], prompt: "队列仍在更新", status: finished ? "completed" : "running" }], images: [],
      scheduler: { queued: 0, running: finished ? 0 : 1, completed: finished ? 1 : 0, failed: 0, unknown: 0, paused: false }
      } });
    }
    if (!url.pathname.startsWith("/api/download/images/")) return route.continue();
    const id = url.pathname.split("/").pop();
    if (id === "large-99") {
      missingImageRequests += 1;
      return route.fulfill({ status: 404, body: "Mock missing image" });
    }
    const index = Number(id.split("-").pop());
    const [width, height] = [[160, 90], [90, 160], [100, 100]][index % 3];
    const colors = ["#c3d6ed", "#b7d8c3", "#f1d693"];
    return route.fulfill({ contentType: "image/svg+xml", body:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${colors[index % 3]}"/><rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#285783"/><circle cx="${width / 2}" cy="${height / 2}" r="20" fill="#ffffff"/><text x="50%" y="53%" text-anchor="middle" fill="#22384e" font-size="12">${index}</text></svg>` });
  });
  try {
    const mockCallsBefore = (await (await context.request.get(`${base}/__qa/calls`)).json()).length;
    await page.goto(base);
    await page.getByRole("button", { name: "运行监控", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".history-card").length === 4);
    const launcher = page.getByRole("button", { name: "运行监控", exact: true });
    assert.equal(await page.getByRole("dialog", { name: "运行监控", exact: true }).count(), 0);
    await page.waitForFunction(() => document.querySelector(".monitor-launcher")?.textContent.includes("运行中 1"));
    const pollsBefore = polls;
    finished = true;
    await page.waitForFunction(() => document.querySelector(".monitor-launcher")?.textContent.includes("运行中 0"));
    assert.ok(polls > pollsBefore, "Polling must continue while the drawer is closed");

    for (const [width, height] of [[1920, 1080], [1365, 900], [1024, 768], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await launcher.scrollIntoViewIfNeeded();
      const before = await page.locator("#task-editor").boundingBox();
      await launcher.click();
      const dialog = page.getByRole("dialog", { name: "运行监控", exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.evaluate((node) => node instanceof HTMLDialogElement && node.matches(":modal")), true);
      await dialog.locator(".monitor-drawer").evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished));
      });
      const after = await page.locator("#task-editor").boundingBox();
      assert.ok(Math.abs(before.x - after.x) <= 1 && Math.abs(before.width - after.width) <= 1, "Drawer must not resize the editor");
      const drawer = await dialog.locator(".monitor-drawer").boundingBox();
      assert.ok(Math.abs(drawer.x + drawer.width - width) <= 1, "Drawer must align to viewport right");
      assert.ok(Math.abs(drawer.width - (width <= 720 ? width : 420)) <= 1);
      for (let key = 0; key < 12; key += 1) {
        await page.keyboard.press(key % 3 === 0 ? "Shift+Tab" : "Tab");
        const focus = await dialog.evaluate((node) => ({ inside: node.contains(document.activeElement),
          tag: document.activeElement?.tagName, text: document.activeElement?.getAttribute("aria-label"), focused: document.hasFocus() }));
        // Native dialogs allow focus to leave the document for browser controls.
        // Only page focus must stay inside the modal; BODY + !hasFocus is not background-editor focus.
        assert.ok(focus.inside || (!focus.focused && focus.tag === "BODY"), JSON.stringify({ width, key, focus }));
      }
      await dialog.getByRole("button", { name: "关闭运行监控", exact: true }).focus();
      await page.locator('#task-editor textarea').first().evaluate((node) => node.focus());
      assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true, "Background editor must remain inert");
      await page.screenshot({ path: path.join(output, `workbench-${width}-drawer.png`) });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await launcher.evaluate((node) => node === document.activeElement), true);

      const cards = page.locator(".history-card");
      const strip = cards.nth(0).locator(".history-image-strip");
      await strip.scrollIntoViewIfNeeded();
      await assertStripFrames(strip, 23);
      assert.equal(await strip.evaluate((node) => node.scrollWidth > node.clientWidth), true);
      assert.equal(await strip.locator("img").first().evaluate((node) => getComputedStyle(node).objectFit), "contain");
      const singleBox = await cards.nth(1).locator(".history-thumbnail-button").boundingBox();
      assert.ok(Math.abs(singleBox.width - 160) <= 1 && Math.abs(singleBox.height - 90) <= 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Viewport ${width} overflowed`);
      await strip.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      const last = cards.nth(0).getByRole("button", { name: "查看 page-23.png 大图", exact: true });
      await last.click();
      const viewer = page.getByRole("dialog", { name: "历史图片预览", exact: true });
      await viewer.getByRole("img", { name: "page-23.png", exact: true }).waitFor();
      await assertViewerFits(page, viewer, width);
      assert.equal(await viewer.getByRole("button", { name: "下一张", exact: true }).isDisabled(), true);
      await viewer.getByRole("button", { name: "上一张", exact: true }).click();
      await viewer.getByRole("img", { name: "page-22.png", exact: true }).waitFor();
      await page.keyboard.press("ArrowLeft");
      await viewer.getByRole("img", { name: "page-21.png", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await last.evaluate((node) => node === document.activeElement), true);

      const largeStrip = cards.nth(2).locator(".history-image-strip");
      await assertStripFrames(largeStrip, 100);
      await largeStrip.scrollIntoViewIfNeeded();
      await largeStrip.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      await largeStrip.getByRole("button", { name: "查看 large-99.png 大图", exact: true }).getByText(/图片加载失败/).waitFor();
      assert.ok(missingImageRequests > 0);
      await assertStripFrames(largeStrip, 100);
      await cards.nth(2).getByRole("button", { name: "查看 large-100.png 大图", exact: true }).click();
      await viewer.getByRole("img", { name: "large-100.png", exact: true }).waitFor();
      await assertViewerFits(page, viewer, width);
      await page.keyboard.press("Escape");
      await cards.nth(0).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `workbench-${width}-history.png`), fullPage: true });
    }

    const firstCard = page.locator(".history-card").first();
    assert.equal(await firstCard.getByText(/完整提示词第一行/).count(), 0);
    await firstCard.getByRole("button", { name: "详情", exact: true }).click();
    await firstCard.getByText(/完整提示词第一行/).waitFor();
    const fullPrompt = firstCard.locator(".history-full-prompt").first();
    assert.equal(await fullPrompt.textContent(), histories[0].tasks[0].prompt);
    assert.equal(await fullPrompt.evaluate((node) => {
      const style = getComputedStyle(node);
      return style.whiteSpace === "pre-wrap" && style.webkitLineClamp === "none" && node.scrollHeight <= node.clientHeight + 1;
    }), true, "Expanded prompt must preserve all lines without clipping");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await firstCard.getByRole("button", { name: "收起详情", exact: true }).click();
    const emptyCard = page.locator(".history-card").nth(3);
    await emptyCard.getByRole("button", { name: "详情", exact: true }).click();
    assert.equal(await emptyCard.getByText(histories[3].tasks[0].error_message, { exact: true }).textContent(), histories[3].tasks[0].error_message);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Long remote errors must wrap");
    await emptyCard.getByRole("button", { name: "收起详情", exact: true }).click();
    const previousScroll = await firstCard.locator(".history-image-strip").evaluate((node) => node.scrollLeft);
    assert.ok(previousScroll > 0);
    const previousHistoryRequests = historyRequests;
    const refreshed = page.waitForResponse((response) => response.url() === `${base}/api/history` && response.request().method() === "GET");
    await page.getByRole("button", { name: "刷新历史记录", exact: true }).click();
    await refreshed;
    await page.getByRole("button", { name: "刷新历史记录", exact: true }).waitFor();
    assert.ok(historyRequests > previousHistoryRequests);
    assert.equal(await firstCard.locator(".history-image-strip").evaluate((node) => node.scrollLeft), previousScroll);
    await firstCard.locator("summary").filter({ hasText: "更多" }).click();
    await firstCard.getByRole("button", { name: "导出图片", exact: true }).waitFor();
    await firstCard.getByRole("button", { name: "导出图片", exact: true }).focus();
    await page.keyboard.press("Escape");
    assert.equal(await firstCard.locator("details.history-actions-menu").getAttribute("open"), null);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await launcher.click();
    const animation = await page.locator(".monitor-drawer").evaluate((node) => getComputedStyle(node).animationName);
    assert.equal(animation, "none");
    await page.getByRole("dialog", { name: "运行监控", exact: true }).getByRole("button", { name: "关闭运行监控", exact: true }).click();
    assert.deepEqual(mutations, [], "Browsing must not mutate queue or courseware data");
    assert.equal((await (await context.request.get(`${base}/__qa/calls`)).json()).length, mockCallsBefore);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, viewports: [1920, 1365, 1024, 390], batches: 4, images: 124, polls,
      queueMutations: 0, extraGenerationCalls: 0, output }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
