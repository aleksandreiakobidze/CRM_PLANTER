import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BusinessError } from "@/server/errors";

export const MAX_TASK_FILES = 5;
export const MAX_TASK_FILE_BYTES = 8 * 1024 * 1024;

const ALLOWED = new Map<string, string>([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["pdf", "application/pdf"],
  ["txt", "text/plain"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);

export type TaskFileDraft = {
  id: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
  storageKey: string;
};

function uploadsRoot() {
  return path.resolve(process.cwd(), "data", "uploads");
}

export function taskFilePath(storageKey: string) {
  const root = uploadsRoot();
  const full = path.resolve(root, storageKey);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) throw new BusinessError("ფაილი ვერ მოიძებნა", "not_found");
  return full;
}

const CONTRACT_EXT = new Set(["pdf", "doc", "docx"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export function prepareCustomerFiles(organizationId: string, kind: string, files: { name: string; bytes: Buffer }[]) {
  if (kind !== "contract" && kind !== "image") throw new BusinessError("ფაილის ტიპი არასწორია", "validation");
  if (files.length === 0) throw new BusinessError("ფაილი ატვირთეთ", "validation");
  const prepared = prepareTaskFiles(organizationId, files);
  const allowed = kind === "contract" ? CONTRACT_EXT : IMAGE_EXT;
  for (const file of prepared) {
    const extension = path.extname(file.fileName).slice(1).toLowerCase();
    if (!allowed.has(extension)) {
      throw new BusinessError(
        kind === "contract" ? "ხელშეკრულება უნდა იყოს PDF ან Word" : "სურათი უნდა იყოს PNG, JPG, WEBP ან GIF",
        "validation",
      );
    }
  }
  return prepared;
}

export function prepareTaskFiles(organizationId: string, files: { name: string; bytes: Buffer }[]) {
  if (files.length > MAX_TASK_FILES) throw new BusinessError("მაქსიმუმ 5 ფაილი შეიძლება", "validation");
  return files.map((file) => {
    if (file.bytes.byteLength === 0) throw new BusinessError("ცარიელი ფაილი არ აიტვირთება", "validation");
    if (file.bytes.byteLength > MAX_TASK_FILE_BYTES) throw new BusinessError("ფაილი 8 მბ-ზე დიდია", "validation");
    const extension = path.extname(file.name).slice(1).toLowerCase();
    const contentType = ALLOWED.get(extension);
    if (!contentType) throw new BusinessError("ამ ტიპის ფაილი არ დაიშვება", "validation");
    const id = randomUUID();
    const fileName = path.basename(file.name).replace(/[\\/]/g, "").slice(0, 180) || `file.${extension}`;
    return { id, fileName, contentType, bytes: file.bytes, storageKey: `${organizationId}/${id}` };
  });
}

export async function writeTaskFiles(files: TaskFileDraft[]) {
  for (const file of files) {
    const full = taskFilePath(file.storageKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, file.bytes);
  }
}

export async function removeTaskFiles(files: { storageKey: string }[]) {
  await Promise.all(files.map(async (file) => {
    await unlink(taskFilePath(file.storageKey)).catch(() => undefined);
  }));
}

export async function readTaskBytes(storageKey: string) {
  return readFile(taskFilePath(storageKey));
}
