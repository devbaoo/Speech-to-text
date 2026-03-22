/**
 * Storage Service Interface
 * Implement this interface to create new storage providers
 */
class BaseStorageService {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Upload file to storage
   * @param {Buffer|ReadableStream} file - File data
   * @param {string} filename - Original filename
   * @param {string} mimeType - File MIME type
   * @param {object} options - Additional options (folder, metadata, etc.)
   * @returns {Promise<{url: string, key: string, metadata?: object}>}
   */
  async upload(file, filename, mimeType, options = {}) {
    throw new Error("Method 'upload' must be implemented");
  }

  /**
   * Delete file from storage
   * @param {string} key - File identifier/key
   * @returns {Promise<void>}
   */
  async delete(key) {
    throw new Error("Method 'delete' must be implemented");
  }

  /**
   * Get public URL for a file
   * @param {string} key - File identifier/key
   * @returns {string}
   */
  getPublicUrl(key) {
    throw new Error("Method 'getPublicUrl' must be implemented");
  }

  /**
   * Get signed URL for private files
   * @param {string} key - File identifier/key
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {Promise<string>}
   */
  async getSignedUrl(key, expiresIn = 3600) {
    throw new Error("Method 'getSignedUrl' must be implemented");
  }

  /**
   * Check if file exists
   * @param {string} key - File identifier/key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    throw new Error("Method 'exists' must be implemented");
  }

  /**
   * Get file from storage
   * @param {string} key - File identifier/key
   * @returns {Promise<Buffer>}
   */
  async getFile(key) {
    throw new Error("Method 'getFile' must be implemented");
  }
}

module.exports = BaseStorageService;
