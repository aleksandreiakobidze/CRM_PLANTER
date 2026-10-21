import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { prepareCustomerFiles, readTaskBytes, removeTaskFiles, writeTaskFiles } from "@/server/features/crm/task-files";
import { withTx } from "@/server/tx";

export async function addCustomerFiles(
  actor: Actor,
  input: { customerId: string; kind: string; files: { name: string; bytes: Buffer }[] },
) {
  requirePermission(actor, "crm.write");
  const customer = await getDb().customer.findFirst({
    where: { id: input.customerId, organizationId: actor.organizationId, mergedIntoId: null },
  });
  if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
  const files = prepareCustomerFiles(actor.organizationId, input.kind, input.files);
  await writeTaskFiles(files);
  try {
    return await withTx(async (tx) => {
      await tx.customerAttachment.createMany({
        data: files.map((file) => ({
          id: file.id,
          organizationId: actor.organizationId,
          customerId: customer.id,
          kind: input.kind,
          fileName: file.fileName,
          contentType: file.contentType,
          byteSize: file.bytes.byteLength,
          storageKey: file.storageKey,
          uploadedById: actor.userId,
        })),
      });
      await audit(tx, actor, "customer.file.add", "customer", customer.id, undefined, {
        kind: input.kind,
        count: files.length,
      });
      return files.length;
    });
  } catch (error) {
    await removeTaskFiles(files);
    throw error;
  }
}

export async function deleteCustomerFile(actor: Actor, fileId: string) {
  requirePermission(actor, "crm.write");
  const file = await getDb().customerAttachment.findFirst({
    where: { id: fileId, organizationId: actor.organizationId },
  });
  if (!file) throw new BusinessError("ფაილი ვერ მოიძებნა", "not_found");
  await getDb().customerAttachment.delete({ where: { id: file.id } });
  await removeTaskFiles([file]);
  return file;
}

export async function readCustomerFile(actor: Actor, attachmentId: string) {
  requirePermission(actor, "crm.read");
  const file = await getDb().customerAttachment.findFirst({
    where: { id: attachmentId, organizationId: actor.organizationId },
  });
  if (!file) throw new BusinessError("ფაილი ვერ მოიძებნა", "not_found");
  return {
    fileName: file.fileName,
    contentType: file.contentType,
    kind: file.kind,
    bytes: await readTaskBytes(file.storageKey),
  };
}
