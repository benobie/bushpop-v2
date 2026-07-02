import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let r2Client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return r2Client;
}

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

const CONTENT_TYPE_TO_EXT: Record<AllowedContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_FILE_SIZE = 10_485_760; // 10MB

export function isAllowedContentType(contentType: string): contentType is AllowedContentType {
  return ALLOWED_CONTENT_TYPES.includes(contentType as AllowedContentType);
}

export function getExtensionForContentType(contentType: AllowedContentType): string {
  return CONTENT_TYPE_TO_EXT[contentType];
}

export async function createPresignedPutUrl(options: {
  key: string;
  contentType: AllowedContentType;
  expiresIn?: number;
}): Promise<string> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: options.key,
    ContentType: options.contentType,
    ContentLength: MAX_FILE_SIZE,
  });
  return getSignedUrl(client, command, {
    expiresIn: options.expiresIn ?? 300,
  });
}

export async function headObject(key: string): Promise<{ contentType?: string; contentLength?: number } | null> {
  const client = getR2Client();
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      }),
    );
    return {
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "NotFound") {
      return null;
    }
    throw err;
  }
}

export async function createPresignedGetUrl(key: string, expiresIn = 900): Promise<string> {
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }),
  );
}
