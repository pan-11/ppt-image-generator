import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("mobile workspace layout", () => {
  it("uses the neutral workbench visual system", () => {
    const homepageRules = styles.slice(0, styles.indexOf(".lab-page"));

    expect(homepageRules).toContain("--color-bg-page: #f4f6f8;");
    expect(homepageRules).toContain("--radius-panel: 10px;");
    expect(homepageRules).toContain("select, input[type=\"number\"], input[type=\"text\"] { min-height: 46px; }");
    expect(homepageRules).not.toContain("radial-gradient");
  });

  it("keeps a single workspace column at intermediate widths", () => {
    const workspaceStart = styles.indexOf("@media (max-width: 1500px)");
    const workspaceRules = styles.slice(workspaceStart, styles.indexOf("@media (max-width: 1100px)"));

    expect(workspaceStart).toBeGreaterThan(-1);
    expect(workspaceRules).toContain(".workspace-grid { grid-template-columns: minmax(0, 1fr); }");
  });

  it("stacks the history export controls so they do not widen the viewport", () => {
    const mobileStart = styles.indexOf("@media (max-width: 720px)");
    const mobileRules = styles.slice(
      mobileStart,
      styles.indexOf(".lab-page", mobileStart)
    );

    expect(mobileRules).toContain(".history-heading { flex-direction: column; }");
    expect(mobileRules).toContain(".submit-bar-top { position: static; }");
    expect(mobileRules).toContain(".model-select { font-size: 1rem; }");
  });
});
