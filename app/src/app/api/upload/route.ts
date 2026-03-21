import { writeFile, mkdir } from "fs/promises";
import { resolve, join } from "path";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["video/", "audio/", "image/"];
const RAW_DIR = resolve(process.cwd(), "../workspace/raw");

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    await mkdir(RAW_DIR, { recursive: true });

    const results = [];

    for (const file of files) {
      if (!file.name || file.size === 0) continue;

      const isAllowed = ALLOWED_TYPES.some((t) => file.type.startsWith(t));
      if (!isAllowed) {
        results.push({
          filename: file.name,
          error: `Invalid file type: ${file.type || "unknown"}`,
        });
        continue;
      }

      // Sanitize filename: keep extension, replace unsafe chars
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = join(RAW_DIR, safeName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      results.push({
        filename: safeName,
        originalName: file.name,
        path: `workspace/raw/${safeName}`,
        size: file.size,
        type: file.type,
      });
    }

    return Response.json({ files: results });
  } catch (err) {
    console.error("[upload] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
