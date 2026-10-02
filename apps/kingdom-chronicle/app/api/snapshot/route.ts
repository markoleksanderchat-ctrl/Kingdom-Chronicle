function retired() {
  return Response.json({ error: "The hosted colony dashboard has been retired. Use the Kingdom Chronicle desktop app." }, {
    status: 410,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET() {
  return retired();
}

export async function PUT() {
  return retired();
}
