const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const path = require("path");
const BaseStorageService = require("./baseStorage.service");
const { StorageError } = require("./storageError");
const { getAudioDuration } = require("../../utils/audio.utils");

/**
 * Wasabi S3 Storage Service
 * Compatible with any S3-compatible storage (Wasabi, AWS S3, MinIO, etc.)
 */
class WasabiStorageService extends BaseStorageService {
  constructor(config) {
    super(config);
    this.bucket = config.bucket;
    // Wasabi: endpoint không nên có dấu / cuối
    this.endpoint = String(config.endpoint || "").replace(/\/+$/, "");
    this.region = config.region;
    this.folder = config.folder || "uploads";

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: this.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  /**
   * Generate storage key from filename
   * @param {string} filename - Original filename
   * @param {string} customFolder - Custom folder override
   */
  generateKey(filename, customFolder) {
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const folder = customFolder || this.folder;
    return `${folder}/${timestamp}-${random}-${baseName}${ext}`;
  }

  async upload(fileBuffer, filename, mimeType, options = {}) {
    try {
      const key = options.key || this.generateKey(filename, options.folder);

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        ...options.metadata && { Metadata: options.metadata },
      });

      await this.client.send(command);

      const [duration] = await Promise.all([getAudioDuration(fileBuffer, mimeType)]);

      return {
        url: this.getPublicUrl(key),
        key,
        metadata: {
          bucket: this.bucket,
          region: this.region,
          duration,
          bytes: fileBuffer.length,
        },
      };
    } catch (error) {
      const code = error.Code || error.name || "";
      const reqId = error.$metadata?.requestId || "";
      const hint =
        /AccessDenied/i.test(String(error.message)) || code === "AccessDenied"
          ? " Kiểm tra Wasabi: Access Keys phải thuộc đúng tài khoản bucket; Subuser cần policy s3:PutObject trên arn:aws:s3:::bucket/*"
          : "";
      throw new StorageError(
        `Failed to upload to Wasabi: ${error.message}${code ? ` [${code}]` : ""}${reqId ? ` (requestId: ${reqId})` : ""}.${hint}`,
        "wasabi"
      );
    }
  }

  async delete(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
    } catch (error) {
      throw new StorageError(`Failed to delete from Wasabi: ${error.message}`, "wasabi");
    }
  }

  getPublicUrl(key) {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      throw new StorageError(`Failed to get signed URL: ${error.message}`, "wasabi");
    }
  }

  async exists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw new StorageError(`Failed to check file existence: ${error.message}`, "wasabi");
    }
  }

  async getFile(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.client.send(command);
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      throw new StorageError(`Failed to get file: ${error.message}`, "wasabi");
    }
  }
}

module.exports = WasabiStorageService;
