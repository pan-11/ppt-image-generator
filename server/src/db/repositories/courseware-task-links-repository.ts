import type Database from "better-sqlite3";
export type CoursewareTaskLink = { taskId: string; coursewareId: string; pageId: string; purpose: "original" | "variation" | "textless"; textlessRunId: string | null; sourceImageId: string | null };
export function createCoursewareTaskLinksRepository(db: Database.Database) {
  const fields = "task_id as taskId,courseware_id as coursewareId,page_id as pageId,purpose,textless_run_id as textlessRunId,source_image_id as sourceImageId";
  return {
    get(taskId: string) { return db.prepare(`select ${fields} from courseware_task_links where task_id=?`).get(taskId) as CoursewareTaskLink | undefined; },
    list(id: string) { return db.prepare(`select ${fields} from courseware_task_links where courseware_id=?`).all(id) as CoursewareTaskLink[]; },
    create(link: CoursewareTaskLink) { db.prepare("insert into courseware_task_links (task_id,courseware_id,page_id,purpose,textless_run_id,source_image_id,created_at) values (@taskId,@coursewareId,@pageId,@purpose,@textlessRunId,@sourceImageId,@now)").run({ ...link, now: new Date().toISOString() }); }
  };
}
