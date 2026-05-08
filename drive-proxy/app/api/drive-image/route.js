/**
 * Server-side fetch of Google Drive thumbnails (avoids some client blocking).
 * Only passes through image/* responses.
 */

const ID_RE = /^[a-zA-Z0-9_-]+$/;

export async function GET(request) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !ID_RE.test(id)) {
    return new Response("Invalid or missing id", { status: 400 });
  }

  const upstream =
    "https://drive.google.com/thumbnail?id=" +
    encodeURIComponent(id) +
    "&sz=w1920";

  let res;
  try {
    res = await fetch(upstream, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ShopCraftImageProxy/1.0; +https://example.invalid)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      next: { revalidate: 86400 },
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  if (!res.ok) {
    return new Response("Upstream error", { status: 502 });
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) {
    return new Response("Not an image", { status: 502 });
  }

  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
