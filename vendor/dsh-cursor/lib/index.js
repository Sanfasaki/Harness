// dsh-cursor 宿主半区：光标图片上传存储 + 图片服务。
// 存储：$DSH_HOME 根下的 base64 文本文件（dsh-cursor-images-*.png.b64），
//   fs 服务无二进制写能力（writeText 会损坏非 UTF-8），base64 纯 ASCII 无损。
// 路由：
//   POST /api/dsh-cursor-image            { name, data(base64) } → { url }
//   GET  /api/dsh-cursor-image/<file>      解码 base64 后按扩展名返回图片

export const name = "dsh-cursor";

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};
const MAX_BODY_BYTES = 12 * 1024 * 1024;   // 请求体上限（json + base64）
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;   // 解码后图片上限

function extOf(path) {
  const m = /(\.[a-z0-9]+)$/i.exec(String(path));
  return m ? m[1].toLowerCase() : "";
}

function imagesDir() {
  const home = (typeof process !== "undefined" && process.env && process.env.DSH_HOME) ? process.env.DSH_HOME : "";
  // 直接放 $DSH_HOME 根（该目录必然存在，避免 fs 服务无 mkdir 能力的建目录问题）
  return home ? home.replace(/[\\/]+$/, "") : ".";
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function apply(ctx) {
  ctx.inject(["webServer", "fs"], (c) => {
    c.effect(() => c.webServer.register({
      kind: "prefix",
      path: "/api/dsh-cursor-image",
      handler: async (req, res) => {
        const json = (code, body) => {
          res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
          res.end(body);
        };
        const plain = (code, t) => {
          res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
          res.end(t);
        };
        try {
          const url = new URL(req.url || "/", "http://localhost");
          const pathname = decodeURIComponent(url.pathname);
          const base = "/api/dsh-cursor-image";
          if (req.method === "POST") {
            const body = await readBody(req, MAX_BODY_BYTES);
            let payload;
            try { payload = JSON.parse(body); } catch (e) { return json(400, '{"error":"bad json"}'); }
            const name = String(payload.name || "");
            const data = String(payload.data || "");
            const ext = extOf(name);
            if (!ext || !MIME[ext]) return json(400, '{"error":"unsupported image type"}');
            if (!data) return json(400, '{"error":"empty data"}');
            let buf;
            try { buf = Buffer.from(data, "base64"); } catch (e) { return json(400, '{"error":"bad base64"}'); }
            if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return json(400, '{"error":"image too large"}');
            const file = "dsh-cursor-images-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext + ".b64";
            const target = await c.fs.resolve(imagesDir() + "/" + file);
            await c.fs.writeText(target, data, undefined, undefined, {
              mode: "danger-full-access",
              workspaceRoot: process.cwd()
            });
            return json(200, JSON.stringify({ url: base + "/" + file }));
          }
          if (req.method === "GET" || req.method === "HEAD") {
            if (pathname.indexOf(base + "/") !== 0) return plain(404, "not found");
            const file = pathname.slice(base.length + 1);
            if (!/^dsh-cursor-images-[A-Za-z0-9.-]+$/.test(file)) return plain(400, "bad file name");
            const target = await c.fs.resolve(imagesDir() + "/" + file);
            const st = await c.fs.stat(target);
            if (!st) return plain(404, "not found");
            const b64 = (await c.fs.readText(target)).trim();
            const imageName = file.replace(/\.b64$/, "");
            let bytes;
            try { bytes = Buffer.from(b64, "base64"); } catch (e) { return plain(500, "stored data corrupt"); }
            // 按内容嗅探真实格式（扩展名可能与实际不符，如 .jpg 名实际存 PNG）
            let mime = MIME[extOf(imageName)] || "application/octet-stream";
            if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mime = "image/png";
            else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = "image/jpeg";
            else if (bytes.length >= 6 && (bytes.toString("latin1", 0, 6) === "GIF87a" || bytes.toString("latin1", 0, 6) === "GIF89a")) mime = "image/gif";
            res.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
            res.end(bytes);
            return;
          }
          res.writeHead(405);
          res.end();
        } catch (e) {
          plain(500, String(e && e.message ? e.message : e));
        }
      },
    }), "dsh-cursor: image route");
  });
}
