/**
 * Extraction request bookkeeping (architecture.md §6.2-3, -7, -8).
 * Each request carries the session generation, a request id and the document revision it was
 * started for. A response is accepted only if all three still match; anything else is discarded
 * without being shown or stored. The on-device call itself cannot be aborted with SDK 13.3.0
 * (tech-stack.md §4), so a stale response is invalidated instead.
 */
export interface ExtractionRequest {
  readonly sessionGeneration: number;
  readonly requestId: number;
  readonly documentRevision: number;
}

export class ExtractionRequests {
  private sessionGeneration = 0;
  private documentRevision = 0;
  private seq = 0;
  private current: ExtractionRequest | undefined;

  /** Image replaced, removed or re-cropped. */
  newDocument(): void {
    this.documentRevision += 1;
    this.current = undefined;
  }

  /** Session ended: invalidate everything first. */
  endSession(): void {
    this.sessionGeneration += 1;
    this.newDocument();
  }

  /** Starts a request; any earlier one becomes stale. */
  begin(): ExtractionRequest {
    this.seq += 1;
    this.current = {
      sessionGeneration: this.sessionGeneration,
      requestId: this.seq,
      documentRevision: this.documentRevision,
    };
    return this.current;
  }

  isCurrent(r: ExtractionRequest): boolean {
    const c = this.current;
    return (
      c !== undefined &&
      c.requestId === r.requestId &&
      c.sessionGeneration === r.sessionGeneration &&
      c.documentRevision === r.documentRevision
    );
  }

  /** Accepts the response only if current; afterwards no request is pending. */
  settle(r: ExtractionRequest): boolean {
    if (!this.isCurrent(r)) return false;
    this.current = undefined;
    return true;
  }
}
