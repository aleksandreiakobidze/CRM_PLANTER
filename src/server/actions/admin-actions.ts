"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/auth/session";
import { publicMessage } from "@/server/errors";
import { type ActionState } from "@/server/actions/state";
import { ADMIN_COPY } from "@/server/features/admin/admin-copy";
import { inviteMember, resetMemberPassword } from "@/server/features/admin/team-service";
import { PURGE_GROUPS, purgeMasterData } from "@/server/features/admin/purge-service";
import { disconnectMicrosoft } from "@/server/features/integrations/microsoft-graph";
import { refreshOrgEmailStatus } from "@/server/features/integrations/calendar-sync";

export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const result = await inviteMember(actor, {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      roleId: String(formData.get("roleId") ?? ""),
    });
    revalidatePath("/settings");
    return { ok: true, message: `${ADMIN_COPY.inviteCreated}: ${result.url}` };
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function resetMemberPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const result = await resetMemberPassword(actor, String(formData.get("membershipId") ?? ""));
    revalidatePath("/settings");
    return { ok: true, message: `${ADMIN_COPY.resetCreated}: ${result.url}` };
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function purgeMasterDataAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    const groups = PURGE_GROUPS.filter((group) => formData.get(`group_${group}`) === "on");
    await purgeMasterData(actor, {
      groups,
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? ""),
    });
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true, message: ADMIN_COPY.purgeDone };
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}

export async function disconnectMicrosoftAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const actor = await getActor();
    await disconnectMicrosoft(actor.userId);
    await refreshOrgEmailStatus(actor.organizationId);
    revalidatePath("/settings");
    return { ok: true, message: ADMIN_COPY.m365Disconnect };
  } catch (error) {
    return { ok: false, message: publicMessage(error) };
  }
}
