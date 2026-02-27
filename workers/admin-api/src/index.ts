export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ROUTE_ID: string;
  ALLOWED_ORIGINS?: string; // optional, comma-separated
}

const json = (data: any, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });

const corsHeaders = (req: Request, env: Env) => {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin = allowed.length ? (allowed.includes(origin) ? origin : allowed[0]) : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    // IMPORTANT: allow x-admin-token so browser doesn't block your requests
    "Access-Control-Allow-Headers": "content-type, x-admin-token, authorization",
    "Access-Control-Max-Age": "86400"
  } as Record<string, string>;
};

const withCors = (req: Request, env: Env, res: Response) => {
  const h = new Headers(res.headers);
  const c = corsHeaders(req, env);
  Object.entries(c).forEach(([k, v]) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function supabaseFetch(env: Env, path: string, init: RequestInit) {
  const url = env.SUPABASE_URL.replace(/\/$/, "") + path;

  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) throw new Error(typeof data === "object" ? JSON.stringify(data) : String(data));
  return data;
}

const cleanLines = (text: string) =>
  (text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

async function destinationExists(env: Env, destinationId: string) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/destinations?select=id&id=eq.${encodeURIComponent(destinationId)}&limit=1`,
    { method: "GET" }
  );
  return Array.isArray(rows) && rows.length > 0;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Preflight
    if (req.method === "OPTIONS") return withCors(req, env, new Response(null, { status: 204 }));

    // Root => health
    if (url.pathname === "/" || url.pathname === "") {
      return withCors(req, env, json({ ok: true }));
    }

    // API lives under /api/*
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (!isApi) return withCors(req, env, json({ error: "Not found" }, 404));

    try {
      const path = url.pathname.replace(/^\/api/, "") || "/";
      const parts = path.split("/").filter(Boolean);

      // GET /api/health  (also supports /api/)
      if (req.method === "GET" && (path === "/" || path === "/health")) {
        return withCors(req, env, json({ ok: true }));
      }

      /* ===================== DESTINATIONS ===================== */

      // POST /api/destinations { name }
      if (parts[0] === "destinations" && parts.length === 1 && req.method === "POST") {
        const body = await req.json<any>();
        const name = String(body?.name || "").trim();
        if (!name) return withCors(req, env, json({ error: "name required" }, 400));

        const data = await supabaseFetch(env, "/rest/v1/destinations", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name })
        });

        return withCors(req, env, json({ ok: true, data }));
      }

      // PATCH /api/destinations/:id { name }
      // DELETE /api/destinations/:id
      if (parts[0] === "destinations" && parts.length === 2) {
        const destId = parts[1];

        if (req.method === "PATCH") {
          const body = await req.json<any>();
          const name = String(body?.name || "").trim();
          if (!name) return withCors(req, env, json({ error: "name required" }, 400));

          const data = await supabaseFetch(env, `/rest/v1/destinations?id=eq.${encodeURIComponent(destId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ name })
          });

          const updatedCount = Array.isArray(data) ? data.length : 0;
          if (updatedCount === 0) return withCors(req, env, json({ error: "Destination not found" }, 404));

          return withCors(req, env, json({ ok: true, data }));
        }

        if (req.method === "DELETE") {
          // delete stops first (FK safety)
          await supabaseFetch(env, `/rest/v1/route_stops?destination_id=eq.${encodeURIComponent(destId)}`, {
            method: "DELETE"
          });

          const data = await supabaseFetch(env, `/rest/v1/destinations?id=eq.${encodeURIComponent(destId)}`, {
            method: "DELETE",
            headers: { Prefer: "return=representation" }
          });

          const deletedCount = Array.isArray(data) ? data.length : 0;
          if (deletedCount === 0) return withCors(req, env, json({ error: "Destination not found" }, 404));

          return withCors(req, env, json({ ok: true, data }));
        }
      }

      /* ===================== STOPS ===================== */

      // POST /api/stops { destination_id, name }
      if (parts[0] === "stops" && parts.length === 1 && req.method === "POST") {
        const body = await req.json<any>();
        const destination_id = String(body?.destination_id || "");
        const name = String(body?.name || "").trim();
        if (!destination_id || !name) {
          return withCors(req, env, json({ error: "destination_id + name required" }, 400));
        }

        if (!(await destinationExists(env, destination_id))) {
          return withCors(req, env, json({ error: "destination_id not found in destinations" }, 400));
        }

        const maxRow = await supabaseFetch(
          env,
          `/rest/v1/route_stops?select=stop_order&route_id=eq.${env.ROUTE_ID}&destination_id=eq.${encodeURIComponent(
            destination_id
          )}&order=stop_order.desc&limit=1`,
          { method: "GET" }
        );

        const max =
          Array.isArray(maxRow) && maxRow[0]?.stop_order != null ? Number(maxRow[0].stop_order) : 0;

        const data = await supabaseFetch(env, "/rest/v1/route_stops", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            route_id: env.ROUTE_ID,
            destination_id,
            name,
            stop_order: max + 1
          })
        });

        return withCors(req, env, json({ ok: true, data }));
      }

      // PATCH /api/stops/:id { name }
      if (parts[0] === "stops" && parts.length === 2 && req.method === "PATCH") {
        const stopId = parts[1];
        const body = await req.json<any>();
        const name = String(body?.name || "").trim();
        if (!name) return withCors(req, env, json({ error: "name required" }, 400));

        const data = await supabaseFetch(env, `/rest/v1/route_stops?id=eq.${encodeURIComponent(stopId)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name })
        });

        const updatedCount = Array.isArray(data) ? data.length : 0;
        if (updatedCount === 0) return withCors(req, env, json({ error: "Stop not found" }, 404));

        return withCors(req, env, json({ ok: true, data }));
      }

      // DELETE /api/stops/:id
      if (parts[0] === "stops" && parts.length === 2 && req.method === "DELETE") {
        const stopId = parts[1];

        const data = await supabaseFetch(env, `/rest/v1/route_stops?id=eq.${encodeURIComponent(stopId)}`, {
          method: "DELETE",
          headers: { Prefer: "return=representation" }
        });

        const deletedCount = Array.isArray(data) ? data.length : 0;
        if (deletedCount === 0) return withCors(req, env, json({ error: "Stop not found" }, 404));

        return withCors(req, env, json({ ok: true, data }));
      }

      // POST /api/stops/bulk { destination_id, namesText }
      if (parts[0] === "stops" && parts[1] === "bulk" && req.method === "POST") {
        const body = await req.json<any>();
        const destination_id = String(body?.destination_id || "");
        const names = cleanLines(String(body?.namesText || ""));

        if (!destination_id || !names.length) {
          return withCors(req, env, json({ error: "destination_id + namesText required" }, 400));
        }

        if (!(await destinationExists(env, destination_id))) {
          return withCors(req, env, json({ error: "destination_id not found in destinations" }, 400));
        }

        const maxRow = await supabaseFetch(
          env,
          `/rest/v1/route_stops?select=stop_order&route_id=eq.${env.ROUTE_ID}&destination_id=eq.${encodeURIComponent(
            destination_id
          )}&order=stop_order.desc&limit=1`,
          { method: "GET" }
        );

        const max =
          Array.isArray(maxRow) && maxRow[0]?.stop_order != null ? Number(maxRow[0].stop_order) : 0;

        const rows = names.map((name, i) => ({
          route_id: env.ROUTE_ID,
          destination_id,
          name,
          stop_order: max + 1 + i
        }));

        const data = await supabaseFetch(env, "/rest/v1/route_stops", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(rows)
        });

        return withCors(req, env, json({ ok: true, inserted: Array.isArray(data) ? data.length : 0, data }));
      }

      // POST /api/stops/reorder { ordered_ids: [] }
      if (parts[0] === "stops" && parts[1] === "reorder" && req.method === "POST") {
        const body = await req.json<any>();
        const ordered_ids: string[] = Array.isArray(body?.ordered_ids) ? body.ordered_ids : [];
        if (!ordered_ids.length) return withCors(req, env, json({ error: "ordered_ids required" }, 400));

        // update stop_order sequentially
        for (let i = 0; i < ordered_ids.length; i++) {
          await supabaseFetch(env, `/rest/v1/route_stops?id=eq.${encodeURIComponent(ordered_ids[i])}`, {
            method: "PATCH",
            body: JSON.stringify({ stop_order: i + 1 })
          });
          await sleep(5);
        }

        return withCors(req, env, json({ ok: true }));
      }

      return withCors(req, env, json({ error: "Not found" }, 404));
    } catch (e: any) {
      return withCors(req, env, json({ error: e?.message || String(e) }, 500));
    }
  }
};