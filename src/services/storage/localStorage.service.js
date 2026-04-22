const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const BaseStorageService = require("./baseStorage.service");
const { StorageError } = require("./storageError");
const { getAudioDuration } = require("../../utils/audio.utils");

/**
 * Local Disk Storage Service
 * Stores files on the local filesystem (useful for development/testing)
 */
class LocalStorageService extends BaseStorageService {
  constructor(config = {}) {
    super(config);
    this.basePath = config.basePath || path.join(__dirname, "..", "..", "..", "uploads");
    this.baseUrl = config.baseUrl || "/uploads";
    this.folder = config.folder || "files";
    this.ensureDirectoryExists(this.basePath);
  }

  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  generateKey(filename, customFolder) {
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const folder = customFolder || this.folder;
    return `${folder}/${timestamp}-${random}-${baseName}${ext}`;
  }

  async upload(fileBuffer, filename, mimeType, options = {}) {
    try {
      const key = options.key || this.generateKey(filename, options.folder);
      const fullPath = path.join(this.basePath, key);

      this.ensureDirectoryExists(path.dirname(fullPath));
      await fs.promises.writeFile(fullPath, fileBuffer);

      const [duration] = await Promise.all([getAudioDuration(fileBuffer, mimeType)]);

      return {
        url: this.getPublicUrl(key),
        key,
        metadata: {
          size: fileBuffer.length,
          mimeType,
          originalName: filename,
          duration,
        },
      };
    } catch (error) {
      throw new StorageError(`Failed to save locally: ${error.message}`, "local");
    }
  }

  async delete(key) {
    try {
      const fullPath = path.join(this.basePath, key);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    } catch (error) {
      throw new StorageError(`Failed to delete local file: ${error.message}`, "local");
    }
  }

  getPublicUrl(key) {
    return `${this.baseUrl}/${key}`;
  }

  async getSignedUrl(key, expiresIn = 3600) {
    const fullPath = path.join(this.basePath, key);
    if (!fs.existsSync(fullPath)) {
      throw new StorageError("File not found", "local");
    }

    const secret = process.env.JWT_SECRET || "local-secret";
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${key}:${expires}`)
      .digest("hex");

    return `${this.getPublicUrl(key)}?expires=${expires}&signature=${signature}`;
  }

  async exists(key) {
    const fullPath = path.join(this.basePath, key);
    return fs.existsSync(fullPath);
  }

  async getFile(key) {
    try {
      const fullPath = path.join(this.basePath, key);
      if (!fs.existsSync(fullPath)) {
        throw new StorageError("File not found", "local");
      }
      return await fs.promises.readFile(fullPath);
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Failed to read file: ${error.message}`, "local");
    }
  }
}

module.exports = LocalStorageService;
