import { NextResponse } from "next/server";
import { currentWorkspace, newWorkspaceId, workspaceCredential, WORKSPACE_COOKIE } from "@/server/workspace";
import { accountStatus, loginAccount, logoutSession, recoverWorkspace, registerAccount, rotateRecovery } from "@/server/identity";
import { AccessError, assertSameOrigin, PRIVATE_HEADERS, sessionCookieOptions } from "@/server/accessError";
import { errorResponse, readJson } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await accountStatus(await currentWorkspace()), { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{ action: string; username?: unknown; password?: unknown; code?: unknown }>(request);
    let result: { token?: string; username?: string | null; recovery?: string } = {};
    switch (body.action) {
      case "register":
        result = await registerAccount(await currentWorkspace(), body.username, body.password);
        break;
      case "login":
        result = await loginAccount(body.username, body.password);
        break;
      case "recover":
        result = await recoverWorkspace(body.code, body.password);
        break;
      case "recovery-key":
        result = await rotateRecovery(await currentWorkspace());
        break;
      case "logout":
        await logoutSession(await workspaceCredential());
        result = { token: newWorkspaceId() };
        break;
      default:
        throw new AccessError(422, "عملیات حساب معتبر نیست.");
    }
    const response = NextResponse.json({ username: result.username, recovery: result.recovery, ok: true }, { headers: PRIVATE_HEADERS });
    if (result.token)
      response.cookies.set({
        name: WORKSPACE_COOKIE,
        value: result.token,
        ...sessionCookieOptions(request, 30 * 86400),
      });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
