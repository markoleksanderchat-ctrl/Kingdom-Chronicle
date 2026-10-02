export async function GET() {
  return Response.json({ error: "Hosted colony history has been retired. History remains local to the desktop app." }, {
    status: 410,
    headers: { "cache-control": "no-store" },
  });
}
