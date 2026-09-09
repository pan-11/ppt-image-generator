export type BulkImportItem = {
  prompt: string;
  note: string;
  pageNumber?: string;
  pageName?: string;
};

export type BulkImportResult = {
  mode: "structured" | "lines";
  items: BulkImportItem[];
  errors: string[];
};

const fieldNames = [
  "页面编号",
  "页面名称",
  "生图提示词",
  "画面核心文字",
  "关键画面元素"
] as const;

type StructuredField = typeof fieldNames[number];
type StructuredRecord = Partial<Record<StructuredField, string[]>>;

const markerPattern = /^【(页面编号|页面名称|生图提示词|画面核心文字|关键画面元素)】\s*(.*)$/;

function readField(record: StructuredRecord, field: StructuredField) {
  return (record[field] ?? []).join("\n").trim();
}

function parseLineMode(text: string, maxBatchSize: number): BulkImportResult {
  const items = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((prompt) => ({ prompt, note: "" }));
  const errors: string[] = [];

  if (items.length === 0) {
    errors.push("没有识别到有效提示词");
  }
  if (items.length > maxBatchSize) {
    errors.push(`识别到 ${items.length} 条提示词，单批最多 ${maxBatchSize} 条`);
  }

  return { mode: "lines", items, errors };
}

function parseStructuredMode(text: string, maxBatchSize: number): BulkImportResult {
  const records: StructuredRecord[] = [];
  let currentRecord: StructuredRecord | null = null;
  let currentField: StructuredField | null = null;

  for (const line of text.split("\n")) {
    const marker = line.trim().match(markerPattern);
    if (marker) {
      const field = marker[1] as StructuredField;
      const inlineValue = marker[2].trim();

      if (field === "页面编号") {
        if (currentRecord) {
          records.push(currentRecord);
        }
        currentRecord = {};
      }

      if (!currentRecord) {
        continue;
      }

      currentField = field;
      currentRecord[field] = inlineValue ? [inlineValue] : [];
      continue;
    }

    if (currentRecord && currentField) {
      currentRecord[currentField]?.push(line);
    }
  }

  if (currentRecord) {
    records.push(currentRecord);
  }

  const items: BulkImportItem[] = [];
  const errors: string[] = [];
  const seenPageNumbers = new Set<string>();

  records.forEach((record, index) => {
    const pageNumber = readField(record, "页面编号");
    const pageName = readField(record, "页面名称");
    const imagePrompt = readField(record, "生图提示词");
    const coreText = readField(record, "画面核心文字");
    const keyElements = readField(record, "关键画面元素");
    const location = pageNumber || `第 ${index + 1} 条记录`;
    const missing = fieldNames.filter((field) => !readField(record, field));

    if (missing.length > 0) {
      errors.push(`${location} 缺少：${missing.join("、")}`);
      return;
    }

    if (seenPageNumbers.has(pageNumber)) {
      errors.push(`页面编号重复：${pageNumber}`);
    }
    seenPageNumbers.add(pageNumber);

    items.push({
      pageNumber,
      pageName,
      note: `${pageNumber} · ${pageName}`,
      prompt: `【生图提示词】\n${imagePrompt}\n\n【画面核心文字】\n${coreText}\n\n【关键画面元素】\n${keyElements}`
    });
  });

  if (records.length === 0) {
    errors.push("没有识别到有效提示词");
  }
  if (items.length > maxBatchSize) {
    errors.push(`识别到 ${items.length} 条提示词，单批最多 ${maxBatchSize} 条`);
  }

  return { mode: "structured", items, errors };
}

export function parseBulkPromptImport(value: string, maxBatchSize: number): BulkImportResult {
  const text = value.replace(/\r\n?/g, "\n");
  const hasStructuredMarker = text
    .split("\n")
    .some((line) => markerPattern.test(line.trim()));

  return hasStructuredMarker
    ? parseStructuredMode(text, maxBatchSize)
    : parseLineMode(text, maxBatchSize);
}
