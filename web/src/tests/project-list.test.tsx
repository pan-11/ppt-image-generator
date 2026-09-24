import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CoursewareListModal } from "../components/courseware/courseware-list-modal";
import { listCoursewares } from "../lib/courseware-api";

vi.mock("../lib/courseware-api", async original => ({ ...(await original<typeof import("../lib/courseware-api")>()), listCoursewares: vi.fn() }));
afterEach(cleanup);

it("shows a saved project's cover and selected-page count in history", async () => {
  vi.mocked(listCoursewares).mockResolvedValue({ coursewares: [{ id: "project-b", name: "项目 B", pageCount: 2, selectedPageCount: 1, coverImageId: "image-b", sourceKind: "manual", updatedAt: "2026-09-24T08:00:00.000Z", revision: 2 }] });
  render(<CoursewareListModal open currentId="project-b" onClose={() => {}} onOpen={async () => {}} />);
  expect(await screen.findByAltText("项目 B 封面")).toHaveAttribute("src", "/api/download/images/image-b");
  expect(screen.getByText(/已选定稿 1 页/)).toBeInTheDocument();
  expect(screen.getByText("当前项目")).toBeInTheDocument();
});
