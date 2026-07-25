import QRCode from "qrcode";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const requestedPath = searchParams.get("path") ?? "/c/demo-cafe";
  const path =
    requestedPath.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/c/demo-cafe";
  const target = `${origin}${path}`;
  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: 320,
    margin: 2,
    color: {
      dark: "#17324A",
      light: "#FFFFFF"
    }
  });

  return new Response(Uint8Array.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store"
    }
  });
}
