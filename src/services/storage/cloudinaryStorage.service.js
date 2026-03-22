const { v2: cloudinary } = require("cloudinary");
const path = require("path");
const BaseStorageService = require("./baseStorage.service");
const { StorageError } = require("./storageError");

/**
 * Cloudinary Storage Service
 * Uses Cloudinary for file storage and CDN delivery
 */
class CloudinaryStorageService extends BaseStorageService {
  constructor(config) {
    super(config);
    this.cloudName = config.cloudName;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.folder = config.folder || "uploads";

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
    });
  }

  async upload(fileBuffer, filename, mimeType, options = {}) {
    try {
      const isAudio = mimeType.startsWith("audio/");
      const isVideo = mimeType.startsWith("video/");
      const resourceType = isAudio || isVideo ? "video" : "auto";
      const folder = options.folder || this.folder;

      const result = await cloudinary.uploader.upload(
        `data:${mimeType};base64,${fileBuffer.toString("base64")}`,
        {
          folder,
          resource_type: resourceType,
          public_id: options.publicId,
          format: options.format,
          transformation: options.transformation,
        }
      );

      return {
        url: result.secure_url,
        key: result.public_id,
        metadata: {
          format: result.format,
          duration: result.duration,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        },
      };
    } catch (error) {
      throw new StorageError(`Failed to upload to Cloudinary: ${error.message}`, "cloudinary");
    }
  }

  async uploadFromPath(filePath, mimeType, options = {}) {
    try {
      const isAudio = mimeType.startsWith("audio/");
      const isVideo = mimeType.startsWith("video/");
      const resourceType = isAudio || isVideo ? "video" : "auto";
      const folder = options.folder || this.folder;

      const result = await cloudinary.uploader.upload(filePath, {
        folder,
        resource_type: resourceType,
        public_id: options.publicId,
        format: options.format,
      });

      return {
        url: result.secure_url,
        key: result.public_id,
        metadata: {
          format: result.format,
          duration: result.duration,
          bytes: result.bytes,
        },
      };
    } catch (error) {
      throw new StorageError(`Failed to upload to Cloudinary: ${error.message}`, "cloudinary");
    }
  }

  async delete(key) {
    try {
      await cloudinary.uploader.destroy(key);
    } catch (error) {
      throw new StorageError(`Failed to delete from Cloudinary: ${error.message}`, "cloudinary");
    }
  }

  getPublicUrl(key) {
    return cloudinary.url(key, { secure: true });
  }

  async getSignedUrl(key, expiresIn = 3600) {
    try {
      return cloudinary.utils.url(key, { secure: true, sign_url: true });
    } catch (error) {
      throw new StorageError(`Failed to get signed URL: ${error.message}`, "cloudinary");
    }
  }

  async exists(key) {
    try {
      const result = await cloudinary.api.resource(key);
      return !!result;
    } catch (error) {
      if (error.http_code === 404) return false;
      throw new StorageError(`Failed to check file existence: ${error.message}`, "cloudinary");
    }
  }

  async getFile(key) {
    try {
      const result = await cloudinary.api.resource(key, { resource_type: "raw" });
      return result;
    } catch (error) {
      throw new StorageError(`Failed to get file: ${error.message}`, "cloudinary");
    }
  }
}

module.exports = CloudinaryStorageService;
