import type { Concern } from "./concerns";

/** One entry of `data.results.output[]` as documented by YouCam. Extra fields are tolerated. */
export type YouCamOutputItem = {
  type: string;
  ui_score?: number;
  raw_score?: number;
  mask_urls?: string[];
  [k: string]: unknown;
};

export type SkinTaskResult =
  | { status: "running"; raw: unknown }
  | { status: "error"; errorCode: string; raw: unknown }
  | { status: "success"; output: YouCamOutputItem[]; raw: unknown };

export type ParsedScore = { concern: Concern; uiScore: number | null; rawScore: number | null; maskUrl: string | null };

export type ParsedSkinResult = {
  scores: ParsedScore[];
  overallScore: number | null;
  skinAge: number | null;
};

export interface YouCamClient {
  readonly isMock: boolean;
  /** File API + PUT to the presigned URL. Returns the `file_id`. */
  uploadImage(bytes: Buffer, mime: string, fileName: string): Promise<string>;
  /** Create a skin-analysis task. Returns the `task_id`. */
  createSkinTask(fileId: string, dstActions: string[]): Promise<string>;
  /** One status check of a skin-analysis task. */
  getSkinTask(taskId: string): Promise<SkinTaskResult>;
  /** Download a result asset (mask image). */
  download(url: string): Promise<{ bytes: Buffer; mime: string }>;
}

export class YouCamError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "YouCamError";
  }
}
