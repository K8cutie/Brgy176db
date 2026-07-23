// ═══════════════════════════════════════════════════════════
// form-scans storage helper
//
// Uploads a scanned ORIGINAL form image into the private per-parish
// `form-scans` Supabase Storage bucket, and mints short-lived signed URLs to
// view one. The record stores only the returned object PATH (RecordAttachment.
// storagePath) — never the bytes.
//
// Cloud-only: the bucket exists only in the SaaS (cloud) backend. In
// desktop/local mode these no-op (return null) so the rest of the feature —
// matching, the record's attachment list, the review flow — still works; only
// the image bytes need the cloud bucket.
//
// The AnySupabase type doesn't declare `.storage` (same as `.functions`), so we
// narrow it locally, exactly as ScanPage/AiAssistant narrow the functions API.
// ═══════════════════════════════════════════════════════════

import { getSupabase } from './supabaseClient';
import { getCloudParishId, isCloud } from './cloudStore';

const BUCKET = 'form-scans';

type StorageLike = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File | Blob,
        opts?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ data: { path: string } | null; error: unknown }>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
      remove: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

function objectId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extFor(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'application/pdf') return 'pdf';
  return 'jpg';
}

/** Whether scanned-image storage is available in this session (cloud + a parish). */
export function formScansAvailable(): boolean {
  return isCloud() && !!getCloudParishId();
}

/**
 * Upload a scanned form into the private bucket under the caller's parish
 * prefix (`<parishId>/<recordId>/<uuid>.<ext>` — the WITH CHECK RLS policy
 * enforces the prefix). Returns the object path to store on the record, or
 * null when storage isn't available (desktop/local, no parish) or on failure.
 */
export async function uploadFormScan(recordId: string, file: File): Promise<string | null> {
  const parishId = getCloudParishId();
  if (!isCloud() || !parishId) return null;
  const safeRecordId = String(recordId).replace(/[^a-zA-Z0-9._-]/g, '_') || 'record';
  const path = `${parishId}/${safeRecordId}/${objectId()}.${extFor(file)}`;
  try {
    const supa = (await getSupabase()) as unknown as StorageLike;
    const { error } = await supa.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

/** Best-effort delete of a stored scan (e.g. to clean up an orphan when the
 *  record it was meant for could not be linked). Never throws. */
export async function removeFormScan(storagePath: string): Promise<void> {
  if (!isCloud() || !storagePath) return;
  try {
    const supa = (await getSupabase()) as unknown as StorageLike;
    await supa.storage.from(BUCKET).remove([storagePath]);
  } catch {
    /* best-effort — an orphaned private object is harmless */
  }
}

/** Short-lived signed URL to view a stored scan (private bucket → no public URL). */
export async function getFormScanUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!isCloud() || !storagePath) return null;
  try {
    const supa = (await getSupabase()) as unknown as StorageLike;
    const { data, error } = await supa.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
