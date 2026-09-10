/** Error codes are deliberately safe to log or return to an API caller. */
export type FacilitiesFileErrorCode =
  | "FILE_EMPTY"
  | "FILE_TOO_LARGE"
  | "AGGREGATE_TOO_LARGE"
  | "UNSUPPORTED_FILENAME"
  | "CONTENT_TYPE_MISMATCH"
  | "CONTENT_CORRUPT"
  | "ZIP_UNSAFE"
  | "STORAGE_KEY_INVALID"
  | "STORAGE_CONFLICT"
  | "SCANNER_UNAVAILABLE";

export class FacilitiesFileError extends Error {
  constructor(
    public readonly code: FacilitiesFileErrorCode,
    message = code,
  ) {
    super(message);
    this.name = "FacilitiesFileError";
  }
}
