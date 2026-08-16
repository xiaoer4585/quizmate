export class PublicError extends Error {
  constructor(
    message: string,
    readonly code = "BAD_REQUEST",
    readonly statusCode = 400
  ) {
    super(message);
    this.name = "PublicError";
  }
}
