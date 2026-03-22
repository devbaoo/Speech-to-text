class StorageError extends Error {
  constructor(message, provider) {
    super(message);
    this.name = "StorageError";
    this.provider = provider;
  }
}

module.exports = { StorageError };
