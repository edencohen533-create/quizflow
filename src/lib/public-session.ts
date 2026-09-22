// Public identifiers and opaque capability only; signing stays in server-only code.
export interface PublicSession {
  sessionId: string;
  leadId: string;
  submissionId: string;
  token: string;
}
