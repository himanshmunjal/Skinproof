import type { SkinTaskResult, YouCamClient, YouCamOutputItem } from "./types";
import { YouCamError } from "./types";

type FileApiResponse = {
  status: number;
  data: {
    files: {
      file_id: string;
      requests: { method: string; url: string; headers?: Record<string, string> }[];
    }[];
  };
};

type TaskCreateResponse = { status: number; data: { task_id: string } };

type TaskStatusResponse = {
  status: number;
  data: {
    task_status: "running" | "success" | "error";
    results?: { output?: YouCamOutputItem[] };
    error?: string;
    error_code?: string;
    [k: string]: unknown;
  };
};

/** Real YouCam S2S client. Endpoints verified against docs.perfectcorp.com on 2026-10-30. */
export class RealYouCamClient implements YouCamClient {
  readonly isMock = false;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new YouCamError(`YouCam returned non-JSON (${res.status})`, "bad_response", res.status);
    }
    if (!res.ok) {
      const j = json as { error_code?: string; error?: string };
      throw new YouCamError(j.error ?? `YouCam HTTP ${res.status}`, j.error_code ?? `http_${res.status}`, res.status);
    }
    return json as T;
  }

  async uploadImage(bytes: Buffer, mime: string, fileName: string): Promise<string> {
    const init = await this.call<FileApiResponse>("POST", "/s2s/v2.0/file", {
      files: [{ content_type: mime, file_name: fileName, file_size: bytes.length }],
    });
    const file = init.data?.files?.[0];
    const req = file?.requests?.[0];
    if (!file?.file_id || !req?.url) throw new YouCamError("File API returned no upload URL", "bad_response");

    // The File API only reserves a slot; the bytes must be PUT to the presigned URL with the returned headers.
    const put = await fetch(req.url, {
      method: req.method || "PUT",
      headers: { "Content-Type": mime, ...(req.headers ?? {}), "Content-Length": String(bytes.length) },
      body: new Uint8Array(bytes),
    });
    if (!put.ok) throw new YouCamError(`Upload to presigned URL failed (${put.status})`, "upload_failed", put.status);
    return file.file_id;
  }

  async createSkinTask(fileId: string, dstActions: string[]): Promise<string> {
    const res = await this.call<TaskCreateResponse>("POST", "/s2s/v2.0/task/skin-analysis", {
      src_file_id: fileId,
      dst_actions: dstActions,
      miniserver_args: { enable_mask_overlay: false },
      format: "json",
    });
    if (!res.data?.task_id) throw new YouCamError("Task creation returned no task_id", "bad_response");
    return res.data.task_id;
  }

  async getSkinTask(taskId: string): Promise<SkinTaskResult> {
    const res = await this.call<TaskStatusResponse>("GET", `/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`);
    const d = res.data;
    if (d?.task_status === "success") return { status: "success", output: d.results?.output ?? [], raw: res };
    if (d?.task_status === "error") return { status: "error", errorCode: d.error_code ?? d.error ?? "task_error", raw: res };
    return { status: "running", raw: res };
  }

  async download(url: string): Promise<{ bytes: Buffer; mime: string }> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new YouCamError(`Mask download failed (${res.status})`, "download_failed", res.status);
    return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "image/png" };
  }
}
