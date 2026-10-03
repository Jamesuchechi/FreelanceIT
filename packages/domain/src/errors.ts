/** Error thrown for any domain invariant violation. `code` is stable and maps to RPC error codes. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_TRANSITION'
  | 'OVERPAYMENT'
  | 'VOID_NOT_ALLOWED';
