import { publishUpdateRequest } from "@/lib/desktop-update-host";
async function handle(request: Request) {
  const { RELEASES, RELEASE_UPLOAD_TOKEN } = (await import("cloudflare:workers")).env;
  return publishUpdateRequest(request, RELEASES, RELEASE_UPLOAD_TOKEN);
}
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
