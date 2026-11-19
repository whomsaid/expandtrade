import crypto from 'node:crypto';
import { execute, queryOne } from '../config/db.js';
import { emitToUser } from './auditService.js';

export async function createBackgroundJob({ businessId = null, userId, jobType, stageLabel = 'queued' }) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO background_jobs (id, business_id, user_id, job_type, status, progress, stage_label)
     VALUES (?, ?, ?, ?, 'queued', 0, ?)`,
    [id, businessId, userId, jobType, stageLabel]
  );
  const job = await getBackgroundJob(id);
  emitToUser(userId, 'job:progress', job);
  return job;
}

export async function updateBackgroundJob(jobId, { status, progress, stageLabel, result, errorMessage } = {}) {
  const existing = await queryOne('SELECT * FROM background_jobs WHERE id = ?', [jobId]);
  if (!existing) return null;

  const nextStatus = status || existing.status;
  const nextProgress = progress !== undefined ? Math.max(0, Math.min(100, Number(progress))) : existing.progress;
  const nextStage = stageLabel !== undefined ? stageLabel : existing.stage_label;
  const nextResultJson = result !== undefined ? JSON.stringify(result) : existing.result_json;
  const nextErr = errorMessage !== undefined ? errorMessage : existing.error_message;
  const isFinished = ['completed', 'failed', 'cancelled'].includes(nextStatus);

  await execute(
    `UPDATE background_jobs
     SET status = ?,
         progress = ?,
         stage_label = ?,
         result_json = ?,
         error_message = ?,
         updated_at = datetime('now'),
         completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END
     WHERE id = ?`,
    [nextStatus, nextProgress, nextStage, nextResultJson, nextErr, isFinished ? 1 : 0, jobId]
  );

  const updated = await getBackgroundJob(jobId);
  if (updated) {
    emitToUser(updated.user_id, 'job:progress', updated);
  }
  return updated;
}

export async function getBackgroundJob(jobId) {
  const row = await queryOne('SELECT * FROM background_jobs WHERE id = ?', [jobId]);
  if (!row) return null;
  let result = null;
  if (row.result_json) {
    try {
      result = JSON.parse(row.result_json);
    } catch {
      result = null;
    }
  }
  return {
    id: row.id,
    business_id: row.business_id,
    user_id: row.user_id,
    job_type: row.job_type,
    status: row.status,
    progress: Number(row.progress || 0),
    stage_label: row.stage_label,
    result,
    error_message: row.error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}
