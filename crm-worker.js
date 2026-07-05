/* LEADFLIX access gate — HTTP Basic Auth in front of the static assets. */

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

export default {
  async fetch(request, env) {
    const expected = "Basic " + btoa(`arjav:${env.SITE_PASSWORD}`);
    const got = request.headers.get("Authorization") || "";
    if (!env.SITE_PASSWORD || !timingSafeEqual(got, expected)) {
      return new Response("LEADFLIX is private. Sign in to continue.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="LEADFLIX", charset="UTF-8"',
          "Cache-Control": "no-store",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
