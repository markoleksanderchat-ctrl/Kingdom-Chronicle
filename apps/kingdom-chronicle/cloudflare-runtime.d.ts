interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

// Platform types come from the pinned official package rather than partial
// handwritten interfaces. Runtime bindings remain those owned by Sites.
type R2Object = import("@cloudflare/workers-types").R2Object;
// Next/Vite uses DOM Web Stream declarations. They differ structurally from
// Workers' declarations while referring to the same standard runtime streams.
type R2ObjectBody = Omit<import("@cloudflare/workers-types").R2ObjectBody, "body"> & { body: ReadableStream<Uint8Array> };
type R2UploadedPart = import("@cloudflare/workers-types").R2UploadedPart;
type R2MultipartUpload = Omit<import("@cloudflare/workers-types").R2MultipartUpload, "uploadPart"> & {
  uploadPart(partNumber: number, value: ReadableStream<Uint8Array>): Promise<R2UploadedPart>;
};
type R2Bucket = Omit<import("@cloudflare/workers-types").R2Bucket, "get" | "createMultipartUpload" | "resumeMultipartUpload"> & {
  get(key: string, options?: Pick<import("@cloudflare/workers-types").R2GetOptions, "range">): Promise<R2ObjectBody | null>;
  createMultipartUpload(key: string, options?: import("@cloudflare/workers-types").R2MultipartOptions): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
};

declare module "cloudflare:workers" {
  export const env: {
    RELEASES: R2Bucket;
    RELEASE_UPLOAD_TOKEN?: string;
  };
}
