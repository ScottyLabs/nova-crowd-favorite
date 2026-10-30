export class IrvLimitError extends Error {
  constructor() {
    super("Too many unresolved elimination ties to compute the result. No ranking was produced.");
    this.name = "IrvLimitError";
  }
}
