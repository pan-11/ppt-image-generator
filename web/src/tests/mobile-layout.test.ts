import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("mobile workspace layout", () => {
  it("stacks the history export controls so they do not widen the viewport", () => {
    const mobileStart = styles.indexOf("@media (max-width: 720px)");
    const mobileRules = styles.slice(
      mobileStart,
      styles.indexOf(".lab-page", mobileStart)
    );

    expect(mobileRules).toContain(".history-heading { flex-direction: column; }");
  });
});
