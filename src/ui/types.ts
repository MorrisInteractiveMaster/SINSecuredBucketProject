export type BucketField = { label: string; type: 'sin' | 'account' | 'code' | 'text'; revision: string };
export type Api = <T = any>(
  name: string,
  data?: Record<string, unknown>,
) => Promise<T>;
export type Context = {
  kind: 'admin' | 'contractor';
  workspace?: 'staff';
  liveSin?: boolean;
  requestsV2?: boolean;
  bucketField?: BucketField;
  uid?: string;
  displayLabel?: string;
  email?: string;
  needsVerification?: boolean;
  submitted?: boolean;
  invitationId: string;
  reference: string;
  revision: number;
  keyId: string;
  publicKey: JsonWebKey;
  permissions?: Record<string, boolean>;
};
export type Row = {
  name: string;
  email: string;
  invitationId: string;
  reference: string;
  invitationAt: string | null;
  expiresAt: string | null;
  provider: string;
  signedInAt: string | null;
  invitationStatus: string;
  storedStatus?: string;
  revision?: number | null;
  submissionStatus: string;
  submittedAt: string | null;
  retrievalStatus: string;
  transferStatus: string;
  disposalStatus: string;
  responsibleAdminUid: string;
  lastAction: string;
  lastActionAt: string | null;
  attention: boolean;
};
export type Overview = {
  rows: Row[];
  metrics: Record<string, number>;
  adminDirectory: { uid: string; label: string; active: boolean }[];
  generatedAt: string;
};
export type Event = {
  id: string;
  event: string;
  actorUid: string;
  invitationId: string;
  at: string;
  count?: number;
};
