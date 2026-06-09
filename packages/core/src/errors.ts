export class QuillbyError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "QuillbyError";
    this.code = code;
    this.context = context ?? {};
  }
}

export class ConfigError extends QuillbyError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("CONFIG_ERROR", message, context);
    this.name = "ConfigError";
  }
}

export class StorageError extends QuillbyError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("STORAGE_ERROR", message, context);
    this.name = "StorageError";
  }
}

export class ProviderError extends QuillbyError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("PROVIDER_ERROR", message, context);
    this.name = "ProviderError";
  }
}

export class AuthError extends QuillbyError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("AUTH_ERROR", message, context);
    this.name = "AuthError";
  }
}

export class ValidationError extends QuillbyError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, context);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends QuillbyError {
  constructor(message: string, context?: Record<string, unknown>) {
    super("NOT_FOUND", message, context);
    this.name = "NotFoundError";
  }
}
