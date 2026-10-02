import { serveUpdateAsset } from "@/lib/desktop-update-host";
async function handle(request: Request, context: { params: Promise<{ asset: string[] }> }) {
  const { RELEASES } = (await import("cloudflare:workers")).env;
  return serveUpdateAsset(request, (await context.params).asset, RELEASES);
}
export const GET = handle;
export const HEAD = handle;
