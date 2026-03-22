/**
 * Storage Factory
 * Creates and manages storage services based on configuration
 * Supports: wasabi, cloudinary, local
 */
const path = require("path");
const WasabiStorageService = require("./wasabiStorage.service");
const CloudinaryStorageService = require("./cloudinaryStorage.service");
const LocalStorageService = require("./localStorage.service");
const { StorageError } = require("./storageError");

class StorageFactory {
  constructor() {
    this.services = {};
    this.defaultProvider = null;
  }

  /**
   * Initialize storage service
   * @param {string} name - Service name (default, audio, images, etc.)
   * @param {string} provider - Provider type: 'wasabi', 'cloudinary', 'local'
   * @param {object} config - Provider-specific configuration
   */
  register(name, provider, config) {
    let service;

    switch (provider) {
      case "wasabi":
        service = new WasabiStorageService({
          bucket: config.WASABI_BUCKET,
          endpoint: config.WASABI_ENDPOINT,
          region: config.WASABI_REGION,
          accessKey: config.WASABI_ACCESS_KEY,
          secretKey: config.WASABI_SECRET_KEY,
          folder: config.WASABI_FOLDER || "uploads",
        });
        break;

      case "cloudinary":
        service = new CloudinaryStorageService({
          cloudName: config.CLOUDINARY_CLOUD_NAME,
          apiKey: config.CLOUDINARY_API_KEY,
          apiSecret: config.CLOUDINARY_API_SECRET,
          folder: config.CLOUDINARY_FOLDER || "uploads",
        });
        break;

      case "local":
        service = new LocalStorageService({
          basePath: config.LOCAL_PATH || path.join(__dirname, "..", "..", "uploads"),
          baseUrl: config.LOCAL_URL || "/uploads",
          folder: config.LOCAL_FOLDER || "files",
        });
        break;

      default:
        throw new StorageError(`Unknown storage provider: ${provider}`, "factory");
    }

    this.services[name] = service;
    if (!this.defaultProvider) {
      this.defaultProvider = name;
    }

    return this;
  }

  /**
   * Get storage service by name
   * @param {string} name - Service name
   */
  get(name) {
    if (!name) {
      name = this.defaultProvider;
    }
    const service = this.services[name];
    if (!service) {
      throw new StorageError(`Storage service not found: ${name}`, "factory");
    }
    return service;
  }

  /**
   * Set default storage service
   * @param {string} name - Service name
   */
  setDefault(name) {
    if (!this.services[name]) {
      throw new StorageError(`Storage service not found: ${name}`, "factory");
    }
    this.defaultProvider = name;
    return this;
  }

  /**
   * Get list of registered services
   */
  list() {
    return Object.keys(this.services);
  }

  /**
   * Convenience method: upload file
   * @param {Buffer} fileBuffer - File data
   * @param {string} filename - Original filename
   * @param {string} mimeType - MIME type
   * @param {object} options - Upload options
   * @param {string} serviceName - Service to use (optional, uses default)
   */
  async upload(fileBuffer, filename, mimeType, options = {}, serviceName) {
    return this.get(serviceName).upload(fileBuffer, filename, mimeType, options);
  }

  /**
   * Convenience method: delete file
   */
  async delete(key, serviceName) {
    return this.get(serviceName).delete(key);
  }

  /**
   * Convenience method: get public URL
   */
  getUrl(key, serviceName) {
    return this.get(serviceName).getPublicUrl(key);
  }

  /**
   * Convenience method: get signed URL
   */
  async getSignedUrl(key, expiresIn, serviceName) {
    return this.get(serviceName).getSignedUrl(key, expiresIn);
  }
}

const storage = new StorageFactory();

module.exports = storage;
