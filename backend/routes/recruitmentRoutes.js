import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { execute, query, queryOne, transaction } from '../config/db.js';
import { env } from '../config/env.js';
import { authenticate, requireProfileImage } from '../middleware/auth.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { requireBusiness, requirePermission } from '../middleware/tenant.js';
import {
  RECRUITMENT_DIR,
  certificateUpload,
  cleanupMulterFiles,
  cvUpload,
  removeUploadedFile,
  verifyCertificateSignature,
  verifyCvSignature,
} from '../middleware/upload.js';
import { createNotification, logAudit, notifyBusinessManagers } from '../services/auditService.js';

const router = express.Router();

export const EDUCATION_LEVELS = [
  'Primary',
  'Secondary (O-Level)',
  'Secondary (A-Level)',
  'TVET / Vocational',
  'Certificate',
  'Diploma',
  "Bachelor's Degree",
  'Postgraduate Diploma',
  "Master's Degree",
  'PhD',
];

export const EDUCATION_STATUSES = ['Completed', 'In Progress', 'Graduated'];

export const APPLICATION_STATUSES = [
  'submitted',
  'under_review',
  'shortlisted',
  'interview_scheduled',
  'interview_completed',
  'accepted',
  'rejected',
  'withdrawn',
];

const ACTIVE_NON_REAPPLICABLE_STATUSES = [
  'submitted',
  'under_review',
  'shortlisted',
  'interview_scheduled',
  'interview_completed',
  'accepted',
];

function safeJsonParse(raw, fallback = []) {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toSlug(input) {
  const base = String(input || 'vacancy')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'vacancy'}-${crypto.randomBytes(3).toString('hex')}`;
}

function formatVacancy(row) {
  if (!row) return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = Boolean(row.application_deadline && String(row.application_deadline).slice(0, 10) < todayStr);
  return {
    ...row,
    required_document_types: safeJsonParse(row.required_document_types_json, []),
    custom_questions: safeJsonParse(row.custom_questions_json, []),
    is_expired: isExpired,
  };
}

function isSafeInternalDocPath(storedPath) {
  if (!storedPath) return null;
  const resolved = path.resolve(storedPath);
  if (!resolved.startsWith(RECRUITMENT_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

function sanitizeDownloadFilename(name) {
  return String(name || 'document')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

function streamPrivateDocument(doc, req, res) {
  const resolved = isSafeInternalDocPath(doc.stored_path);
  if (!resolved) {
    return res.status(404).json({ error: 'Stored document file is no longer available on disk.' });
  }
  const download = String(req.query.download || '') === '1';
  const safeName = sanitizeDownloadFilename(doc.original_filename || `${doc.document_name || 'document'}`);
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${safeName}"`
  );
  return fs.createReadStream(resolved).pipe(res);
}

async function attachOptionalUser(req) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return null;
    const decoded = jwt.verify(token, env.jwtSecret);
    const session = await queryOne(
      'SELECT id, is_revoked FROM user_sessions WHERE token_jti = ? AND user_id = ?',
      [decoded.jti, decoded.sub]
    );
    if (!session || session.is_revoked) return null;
    const user = await queryOne(
      'SELECT id, full_name, email, phone, avatar_url, is_active, is_platform_admin FROM users WHERE id = ?',
      [decoded.sub]
    );
    if (!user || !user.is_active) return null;
    return user;
  } catch {
    return null;
  }
}

async function loadApplicationRelations(appId, { includeNotes = false, docBaseUrl = '/api/customer/applications' } = {}) {
  const [education, experiences, skills, documents, answers, statusHistory, interviews] = await Promise.all([
    query('SELECT * FROM applicant_education WHERE application_id = ? ORDER BY id ASC', [appId]),
    query('SELECT * FROM applicant_experiences WHERE application_id = ? ORDER BY id ASC', [appId]),
    query('SELECT * FROM applicant_skills WHERE application_id = ? ORDER BY id ASC', [appId]),
    query(
      `SELECT id, application_id, document_category, document_type, document_name, original_filename, mime_type, file_size_bytes, is_active, uploaded_at
       FROM application_documents
       WHERE application_id = ? AND is_active = 1
       ORDER BY CASE WHEN document_category = 'cv' THEN 0 ELSE 1 END, id ASC`,
      [appId]
    ),
    query('SELECT * FROM application_answers WHERE application_id = ? ORDER BY id ASC', [appId]),
    query(
      `SELECT h.*, u.full_name AS changed_by_name
       FROM application_status_history h
       LEFT JOIN users u ON u.id = h.changed_by_user_id
       WHERE h.application_id = ?
       ORDER BY h.id ASC`,
      [appId]
    ),
    query(
      `SELECT i.*, u.full_name AS scheduled_by_name
       FROM job_interviews i
       LEFT JOIN users u ON u.id = i.scheduled_by_user_id
       WHERE i.application_id = ?
       ORDER BY i.id DESC`,
      [appId]
    ),
  ]);

  const docsWithUrls = documents.map((d) => ({
    ...d,
    download_url:
      docBaseUrl === '/api/recruitment/documents'
        ? `/api/recruitment/documents/${d.id}`
        : `/api/customer/applications/${appId}/documents/${d.id}`,
  }));

  let notes = [];
  if (includeNotes) {
    notes = await query(
      `SELECT n.*, u.full_name AS author_name, u.avatar_url AS author_avatar
       FROM recruitment_notes n
       LEFT JOIN users u ON u.id = n.author_user_id
       WHERE n.application_id = ?
       ORDER BY n.id DESC`,
      [appId]
    );
  }

  return {
    education,
    experiences,
    skills,
    documents: docsWithUrls,
    answers,
    status_history: statusHistory,
    interviews,
    notes,
  };
}

function formatStatusLabel(status) {
  return String(status || '')
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

// ================= PUBLIC JOB VACANCIES DISCOVERY =================
router.get('/public/jobs', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const businessId = req.query.business_id ? Number(req.query.business_id) : null;
    const employmentType = String(req.query.employment_type || '').trim();
    const workMode = String(req.query.work_mode || '').trim();

    let sql = `
      SELECT v.*, b.name AS business_name, b.slug AS business_slug, b.logo_url AS business_logo,
             b.category AS business_category, b.district AS business_district, b.country AS business_country,
             br.name AS branch_name
      FROM job_vacancies v
      JOIN businesses b ON b.id = v.business_id
      LEFT JOIN branches br ON br.id = v.branch_id
      WHERE v.status = 'published'
        AND b.status = 'active'
        AND b.is_public_listed = 1
        AND b.deleted_at IS NULL
    `;
    const params = [];

    if (businessId) {
      sql += ' AND v.business_id = ?';
      params.push(businessId);
    }
    if (employmentType) {
      sql += ' AND v.employment_type = ?';
      params.push(employmentType);
    }
    if (workMode) {
      sql += ' AND v.work_mode = ?';
      params.push(workMode);
    }
    if (q) {
      sql += ` AND (LOWER(v.title) LIKE ? OR LOWER(COALESCE(v.department, '')) LIKE ? OR LOWER(v.location) LIKE ? OR LOWER(b.name) LIKE ? OR LOWER(v.description) LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ' ORDER BY COALESCE(v.published_at, v.created_at) DESC, v.id DESC LIMIT 120';
    const rows = await query(sql, params);

    const businesses = await query(
      `SELECT DISTINCT b.id, b.name
       FROM job_vacancies v
       JOIN businesses b ON b.id = v.business_id
       WHERE v.status = 'published' AND b.status = 'active' AND b.is_public_listed = 1 AND b.deleted_at IS NULL
       ORDER BY b.name ASC`
    );

    res.json({
      vacancies: rows.map(formatVacancy),
      businesses,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/public/jobs/:id', async (req, res, next) => {
  try {
    const idParam = String(req.params.id || '').trim();
    const numericId = Number(idParam);
    const row = await queryOne(
      `SELECT v.*, b.name AS business_name, b.slug AS business_slug, b.logo_url AS business_logo,
              b.category AS business_category, b.description AS business_description,
              b.district AS business_district, b.province AS business_province, b.country AS business_country,
              b.physical_address AS business_address, b.operating_hours AS business_hours,
              br.name AS branch_name
       FROM job_vacancies v
       JOIN businesses b ON b.id = v.business_id
       LEFT JOIN branches br ON br.id = v.branch_id
       WHERE ${!Number.isNaN(numericId) && numericId > 0 ? 'v.id = ?' : 'v.slug = ?'}
         AND v.status = 'published'
         AND b.status = 'active'
         AND b.is_public_listed = 1
         AND b.deleted_at IS NULL`,
      [!Number.isNaN(numericId) && numericId > 0 ? numericId : idParam]
    );

    if (!row) {
      return res.status(404).json({ error: 'Job vacancy not found or no longer accepting applications.' });
    }

    const optUser = await attachOptionalUser(req);
    let existingApplication = null;
    if (optUser) {
      existingApplication = await queryOne(
        `SELECT id, reference_number, status, submitted_at, updated_at
         FROM job_applications
         WHERE vacancy_id = ? AND applicant_user_id = ?
         ORDER BY CASE WHEN status = 'draft' THEN 0 ELSE 1 END, id DESC
         LIMIT 1`,
        [row.id, optUser.id]
      );
    }

    res.json({
      vacancy: formatVacancy(row),
      existing_application: existingApplication,
    });
  } catch (err) {
    next(err);
  }
});

// ================= BUSINESS ADMIN RECRUITMENT & VACANCIES =================
router.get(
  '/recruitment/overview',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.view'),
  async (req, res, next) => {
    try {
      const vacancyId = req.query.vacancy_id ? Number(req.query.vacancy_id) : null;
      const status = String(req.query.status || '').trim();
      const educationLevel = String(req.query.education_level || '').trim();
      const hasExperience = req.query.has_work_experience;
      const q = String(req.query.q || '').trim().toLowerCase();

      const vacancies = await query(
        `SELECT v.*, br.name AS branch_name,
                (SELECT COUNT(*) FROM job_applications ja WHERE ja.vacancy_id = v.id AND ja.status != 'draft') AS applicant_count
         FROM job_vacancies v
         LEFT JOIN branches br ON br.id = v.branch_id
         WHERE v.business_id = ?
         ORDER BY v.id DESC`,
        [req.businessId]
      );

      const statRows = await query(
        `SELECT status, COUNT(*) AS cnt
         FROM job_applications
         WHERE business_id = ? AND status != 'draft'
         GROUP BY status`,
        [req.businessId]
      );

      const stats = {
        total: 0,
        submitted: 0,
        under_review: 0,
        shortlisted: 0,
        interview_scheduled: 0,
        interview_completed: 0,
        accepted: 0,
        rejected: 0,
        withdrawn: 0,
      };
      for (const r of statRows) {
        stats[r.status] = Number(r.cnt || 0);
        stats.total += Number(r.cnt || 0);
      }

      let appSql = `
        SELECT ja.*, v.title AS vacancy_title, v.department AS vacancy_department, v.location AS vacancy_location,
               (SELECT ae.education_level FROM applicant_education ae WHERE ae.application_id = ja.id ORDER BY ae.id DESC LIMIT 1) AS highest_education,
               (SELECT COUNT(*) FROM application_documents ad WHERE ad.application_id = ja.id AND ad.is_active = 1 AND ad.document_category = 'certificate') AS certificate_count,
               (SELECT COUNT(*) FROM application_documents ad WHERE ad.application_id = ja.id AND ad.is_active = 1 AND ad.document_category = 'cv') AS has_cv,
               (SELECT ji.interview_date FROM job_interviews ji WHERE ji.application_id = ja.id AND ji.status = 'scheduled' ORDER BY ji.id DESC LIMIT 1) AS next_interview_date,
               (SELECT ji.interview_time FROM job_interviews ji WHERE ji.application_id = ja.id AND ji.status = 'scheduled' ORDER BY ji.id DESC LIMIT 1) AS next_interview_time
        FROM job_applications ja
        JOIN job_vacancies v ON v.id = ja.vacancy_id
        WHERE ja.business_id = ? AND ja.status != 'draft'
      `;
      const params = [req.businessId];

      if (vacancyId) {
        appSql += ' AND ja.vacancy_id = ?';
        params.push(vacancyId);
      }
      if (status) {
        appSql += ' AND ja.status = ?';
        params.push(status);
      }
      if (hasExperience === '1' || hasExperience === '0') {
        appSql += ' AND ja.has_work_experience = ?';
        params.push(Number(hasExperience));
      }
      if (educationLevel) {
        appSql += ` AND EXISTS (SELECT 1 FROM applicant_education ae WHERE ae.application_id = ja.id AND ae.education_level = ?)`;
        params.push(educationLevel);
      }
      if (q) {
        appSql += ` AND (LOWER(ja.full_name) LIKE ? OR LOWER(COALESCE(ja.reference_number, '')) LIKE ? OR LOWER(ja.email) LIKE ? OR LOWER(v.title) LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }

      appSql += ' ORDER BY COALESCE(ja.submitted_at, ja.created_at) DESC, ja.id DESC LIMIT 200';
      const applications = await query(appSql, params);

      res.json({
        vacancies: vacancies.map(formatVacancy),
        stats,
        applications,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/recruitment/vacancies',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.view'),
  async (req, res, next) => {
    try {
      const rows = await query(
        `SELECT v.*, br.name AS branch_name,
                (SELECT COUNT(*) FROM job_applications ja WHERE ja.vacancy_id = v.id AND ja.status != 'draft') AS applicant_count
         FROM job_vacancies v
         LEFT JOIN branches br ON br.id = v.branch_id
         WHERE v.business_id = ?
         ORDER BY v.id DESC`,
        [req.businessId]
      );
      res.json({ vacancies: rows.map(formatVacancy) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/recruitment/vacancies',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.manage'),
  [
    body('title').trim().isLength({ min: 2, max: 180 }).withMessage('Job title is required'),
    body('location').trim().notEmpty().withMessage('Job location is required'),
    body('description').trim().isLength({ min: 10 }).withMessage('Job description must be at least 10 characters'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const {
        title,
        branch_id = null,
        department = '',
        employment_type = 'full_time',
        work_mode = 'on_site',
        location,
        salary_min = null,
        salary_max = null,
        currency_code,
        show_salary = false,
        summary = '',
        description,
        responsibilities = '',
        requirements = '',
        required_education_level = '',
        min_experience_years = 0,
        required_document_types = [],
        custom_questions = [],
        allow_reapplication = false,
        positions_count = 1,
        application_deadline = null,
        publish_now = true,
      } = req.body;

      if (branch_id) {
        const branch = await queryOne(
          'SELECT id FROM branches WHERE id = ? AND business_id = ?',
          [Number(branch_id), req.businessId]
        );
        if (!branch) return res.status(400).json({ error: 'Selected branch does not belong to this business' });
      }

      const status = publish_now ? 'published' : 'draft';
      const slug = toSlug(title);
      const docTypes = Array.isArray(required_document_types) ? required_document_types.filter(Boolean) : [];
      const questions = Array.isArray(custom_questions)
        ? custom_questions
            .filter((q) => q && String(q.label || '').trim())
            .map((q, idx) => ({
              key: String(q.key || `custom_${idx + 1}`).replace(/[^a-zA-Z0-9_]+/g, '_'),
              label: String(q.label).trim(),
              required: Boolean(q.required),
            }))
        : [];

      const resInsert = await execute(
        `INSERT INTO job_vacancies (
          business_id, branch_id, created_by_user_id, title, slug, department,
          employment_type, work_mode, location, salary_min, salary_max, currency_code,
          show_salary, summary, description, responsibilities, requirements,
          required_education_level, min_experience_years, required_document_types_json,
          custom_questions_json, allow_reapplication, positions_count, application_deadline,
          status, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.businessId,
          branch_id ? Number(branch_id) : null,
          req.user.id,
          title.trim(),
          slug,
          String(department || '').trim() || null,
          employment_type || 'full_time',
          work_mode || 'on_site',
          location.trim(),
          salary_min !== null && salary_min !== '' ? Number(salary_min) : null,
          salary_max !== null && salary_max !== '' ? Number(salary_max) : null,
          String(currency_code || req.business.currency_code || 'RWF').trim(),
          show_salary ? 1 : 0,
          String(summary || '').trim() || null,
          description.trim(),
          String(responsibilities || '').trim() || null,
          String(requirements || '').trim() || null,
          String(required_education_level || '').trim() || null,
          Math.max(0, Number(min_experience_years || 0)),
          JSON.stringify(docTypes),
          JSON.stringify(questions),
          allow_reapplication ? 1 : 0,
          Math.max(1, Number(positions_count || 1)),
          application_deadline ? String(application_deadline).slice(0, 10) : null,
          status,
          publish_now ? new Date().toISOString() : null,
        ]
      );

      await logAudit({
        businessId: req.businessId,
        branchId: branch_id ? Number(branch_id) : req.branchId,
        userId: req.user.id,
        action: 'recruitment.vacancy_created',
        entityType: 'job_vacancy',
        entityId: resInsert.insertId,
        changes: { title: title.trim(), status },
        ipAddress: req.ip,
      });

      const created = await queryOne('SELECT * FROM job_vacancies WHERE id = ?', [resInsert.insertId]);
      res.status(201).json({
        message: publish_now ? 'Job vacancy created and published.' : 'Job vacancy saved as draft.',
        vacancy: formatVacancy(created),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/recruitment/vacancies/:id',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.manage'),
  [
    body('title').trim().isLength({ min: 2, max: 180 }).withMessage('Job title is required'),
    body('location').trim().notEmpty().withMessage('Job location is required'),
    body('description').trim().isLength({ min: 10 }).withMessage('Job description must be at least 10 characters'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const vacancy = await queryOne(
        'SELECT * FROM job_vacancies WHERE id = ? AND business_id = ?',
        [Number(req.params.id), req.businessId]
      );
      if (!vacancy) return res.status(404).json({ error: 'Job vacancy not found' });

      const {
        title,
        branch_id = vacancy.branch_id,
        department = '',
        employment_type = vacancy.employment_type,
        work_mode = vacancy.work_mode,
        location,
        salary_min = null,
        salary_max = null,
        currency_code = vacancy.currency_code,
        show_salary = Boolean(vacancy.show_salary),
        summary = '',
        description,
        responsibilities = '',
        requirements = '',
        required_education_level = '',
        min_experience_years = 0,
        required_document_types = [],
        custom_questions = [],
        allow_reapplication = Boolean(vacancy.allow_reapplication),
        positions_count = 1,
        application_deadline = null,
      } = req.body;

      const docTypes = Array.isArray(required_document_types) ? required_document_types.filter(Boolean) : [];
      const questions = Array.isArray(custom_questions)
        ? custom_questions
            .filter((q) => q && String(q.label || '').trim())
            .map((q, idx) => ({
              key: String(q.key || `custom_${idx + 1}`).replace(/[^a-zA-Z0-9_]+/g, '_'),
              label: String(q.label).trim(),
              required: Boolean(q.required),
            }))
        : [];

      await execute(
        `UPDATE job_vacancies
         SET branch_id = ?, title = ?, department = ?, employment_type = ?, work_mode = ?, location = ?,
             salary_min = ?, salary_max = ?, currency_code = ?, show_salary = ?, summary = ?, description = ?,
             responsibilities = ?, requirements = ?, required_education_level = ?, min_experience_years = ?,
             required_document_types_json = ?, custom_questions_json = ?, allow_reapplication = ?,
             positions_count = ?, application_deadline = ?, updated_at = datetime('now')
         WHERE id = ? AND business_id = ?`,
        [
          branch_id ? Number(branch_id) : null,
          title.trim(),
          String(department || '').trim() || null,
          employment_type || 'full_time',
          work_mode || 'on_site',
          location.trim(),
          salary_min !== null && salary_min !== '' ? Number(salary_min) : null,
          salary_max !== null && salary_max !== '' ? Number(salary_max) : null,
          String(currency_code || 'RWF').trim(),
          show_salary ? 1 : 0,
          String(summary || '').trim() || null,
          description.trim(),
          String(responsibilities || '').trim() || null,
          String(requirements || '').trim() || null,
          String(required_education_level || '').trim() || null,
          Math.max(0, Number(min_experience_years || 0)),
          JSON.stringify(docTypes),
          JSON.stringify(questions),
          allow_reapplication ? 1 : 0,
          Math.max(1, Number(positions_count || 1)),
          application_deadline ? String(application_deadline).slice(0, 10) : null,
          vacancy.id,
          req.businessId,
        ]
      );

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'recruitment.vacancy_updated',
        entityType: 'job_vacancy',
        entityId: vacancy.id,
        changes: { title: title.trim() },
        ipAddress: req.ip,
      });

      const updated = await queryOne('SELECT * FROM job_vacancies WHERE id = ?', [vacancy.id]);
      res.json({ message: 'Job vacancy updated.', vacancy: formatVacancy(updated) });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/recruitment/vacancies/:id/status',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.manage'),
  [body('status').isIn(['draft', 'published', 'closed', 'archived']).withMessage('Valid vacancy status required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const vacancy = await queryOne(
        'SELECT * FROM job_vacancies WHERE id = ? AND business_id = ?',
        [Number(req.params.id), req.businessId]
      );
      if (!vacancy) return res.status(404).json({ error: 'Job vacancy not found' });

      const nextStatus = req.body.status;
      await execute(
        `UPDATE job_vacancies
         SET status = ?, published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN datetime('now') ELSE published_at END,
             updated_at = datetime('now')
         WHERE id = ? AND business_id = ?`,
        [nextStatus, nextStatus, vacancy.id, req.businessId]
      );

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'recruitment.vacancy_status_updated',
        entityType: 'job_vacancy',
        entityId: vacancy.id,
        changes: { previous: vacancy.status, status: nextStatus },
        ipAddress: req.ip,
      });

      const updated = await queryOne('SELECT * FROM job_vacancies WHERE id = ?', [vacancy.id]);
      res.json({ message: `Vacancy status set to ${nextStatus}.`, vacancy: formatVacancy(updated) });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/recruitment/applications/:id',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.view'),
  async (req, res, next) => {
    try {
      const application = await queryOne(
        `SELECT ja.*, v.title AS vacancy_title, v.department AS vacancy_department, v.location AS vacancy_location,
                v.employment_type AS vacancy_employment_type, v.work_mode AS vacancy_work_mode,
                v.custom_questions_json, v.required_document_types_json
         FROM job_applications ja
         JOIN job_vacancies v ON v.id = ja.vacancy_id
         WHERE ja.id = ? AND ja.business_id = ? AND ja.status != 'draft'`,
        [Number(req.params.id), req.businessId]
      );
      if (!application) {
        return res.status(404).json({ error: 'Application not found in your business workspace' });
      }

      const relations = await loadApplicationRelations(application.id, {
        includeNotes: true,
        docBaseUrl: '/api/recruitment/documents',
      });

      res.json({
        application: {
          ...application,
          custom_questions: safeJsonParse(application.custom_questions_json, []),
          required_document_types: safeJsonParse(application.required_document_types_json, []),
        },
        ...relations,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/recruitment/applications/:id/status',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.manage'),
  [
    body('status')
      .isIn(['submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'interview_completed', 'accepted', 'rejected'])
      .withMessage('Valid recruitment status is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const application = await queryOne(
        `SELECT ja.*, v.title AS vacancy_title
         FROM job_applications ja
         JOIN job_vacancies v ON v.id = ja.vacancy_id
         WHERE ja.id = ? AND ja.business_id = ?`,
        [Number(req.params.id), req.businessId]
      );
      if (!application || application.status === 'draft') {
        return res.status(404).json({ error: 'Submitted application not found in your business workspace' });
      }
      if (application.status === 'withdrawn') {
        return res.status(400).json({ error: 'Cannot change status of an application withdrawn by the applicant' });
      }

      const nextStatus = req.body.status;
      const note = String(req.body.note || '').trim() || null;

      await transaction(async (tx) => {
        await tx.execute(
          `UPDATE job_applications SET status = ?, updated_at = datetime('now') WHERE id = ? AND business_id = ?`,
          [nextStatus, application.id, req.businessId]
        );
        await tx.execute(
          `INSERT INTO application_status_history (application_id, previous_status, new_status, changed_by_user_id, note)
           VALUES (?, ?, ?, ?, ?)`,
          [application.id, application.status, nextStatus, req.user.id, note]
        );
      });

      await createNotification({
        businessId: req.businessId,
        userId: application.applicant_user_id,
        eventType: 'recruitment_status',
        title: `Application ${application.reference_number}: ${formatStatusLabel(nextStatus)}`,
        message: `Your application for ${application.vacancy_title} at ${req.business.name} is now ${formatStatusLabel(nextStatus)}.${note ? ` Note: ${note}` : ''}`,
        relatedUrl: `/customer?tab=applications&applicationId=${application.id}`,
      });

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'recruitment.application_status_updated',
        entityType: 'job_application',
        entityId: application.id,
        changes: { previous: application.status, status: nextStatus, note },
        ipAddress: req.ip,
      });

      res.json({ message: `Application marked as ${formatStatusLabel(nextStatus)}.`, status: nextStatus });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/recruitment/applications/:id/interviews',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.manage'),
  [
    body('interview_date').trim().notEmpty().withMessage('Interview date is required'),
    body('interview_time').trim().notEmpty().withMessage('Interview time is required'),
    body('interview_mode').isIn(['In-person', 'Phone', 'Online Video']).withMessage('Valid interview mode is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const application = await queryOne(
        `SELECT ja.*, v.title AS vacancy_title
         FROM job_applications ja
         JOIN job_vacancies v ON v.id = ja.vacancy_id
         WHERE ja.id = ? AND ja.business_id = ? AND ja.status != 'draft'`,
        [Number(req.params.id), req.businessId]
      );
      if (!application) {
        return res.status(404).json({ error: 'Application not found in your business workspace' });
      }
      if (application.status === 'withdrawn') {
        return res.status(400).json({ error: 'Cannot schedule an interview for a withdrawn application' });
      }

      const {
        interview_date,
        interview_time,
        interview_mode,
        location_or_link = '',
        interviewer_name = '',
        instructions = '',
      } = req.body;

      const interviewId = await transaction(async (tx) => {
        const ins = await tx.execute(
          `INSERT INTO job_interviews (
            application_id, business_id, vacancy_id, scheduled_by_user_id,
            interview_date, interview_time, interview_mode, location_or_link,
            interviewer_name, instructions, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
          [
            application.id,
            req.businessId,
            application.vacancy_id,
            req.user.id,
            interview_date.trim(),
            interview_time.trim(),
            interview_mode,
            String(location_or_link || '').trim() || null,
            String(interviewer_name || '').trim() || null,
            String(instructions || '').trim() || null,
          ]
        );

        if (['submitted', 'under_review', 'shortlisted'].includes(application.status)) {
          await tx.execute(
            `UPDATE job_applications SET status = 'interview_scheduled', updated_at = datetime('now') WHERE id = ?`,
            [application.id]
          );
          await tx.execute(
            `INSERT INTO application_status_history (application_id, previous_status, new_status, changed_by_user_id, note)
             VALUES (?, ?, 'interview_scheduled', ?, ?)`,
            [
              application.id,
              application.status,
              req.user.id,
              `${interview_mode} interview scheduled for ${interview_date} at ${interview_time}`,
            ]
          );
        }
        return ins.insertId;
      });

      await createNotification({
        businessId: req.businessId,
        userId: application.applicant_user_id,
        eventType: 'recruitment_interview',
        title: `Interview Scheduled — ${application.vacancy_title}`,
        message: `${req.business.name} scheduled a ${interview_mode} interview on ${interview_date} at ${interview_time}${location_or_link ? ` (${location_or_link})` : ''}.`,
        relatedUrl: `/customer?tab=applications&applicationId=${application.id}`,
      });

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'recruitment.interview_scheduled',
        entityType: 'job_interview',
        entityId: interviewId,
        changes: { application_id: application.id, interview_date, interview_time, interview_mode },
        ipAddress: req.ip,
      });

      const interview = await queryOne('SELECT * FROM job_interviews WHERE id = ?', [interviewId]);
      res.status(201).json({ message: 'Interview scheduled and applicant notified.', interview });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/recruitment/interviews/:interviewId',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.manage'),
  async (req, res, next) => {
    try {
      const interview = await queryOne(
        `SELECT ji.*, ja.applicant_user_id, ja.status AS app_status, v.title AS vacancy_title
         FROM job_interviews ji
         JOIN job_applications ja ON ja.id = ji.application_id
         JOIN job_vacancies v ON v.id = ji.vacancy_id
         WHERE ji.id = ? AND ji.business_id = ?`,
        [Number(req.params.interviewId), req.businessId]
      );
      if (!interview) {
        return res.status(404).json({ error: 'Interview record not found in your business workspace' });
      }

      const nextStatus = req.body.status || interview.status;
      const nextOutcome = req.body.outcome || interview.outcome;
      const feedback = req.body.feedback !== undefined ? String(req.body.feedback || '').trim() : interview.feedback;
      const interviewDate = req.body.interview_date ? String(req.body.interview_date).trim() : interview.interview_date;
      const interviewTime = req.body.interview_time ? String(req.body.interview_time).trim() : interview.interview_time;
      const interviewMode = req.body.interview_mode || interview.interview_mode;
      const locationOrLink = req.body.location_or_link !== undefined ? String(req.body.location_or_link || '').trim() : interview.location_or_link;
      const instructions = req.body.instructions !== undefined ? String(req.body.instructions || '').trim() : interview.instructions;

      await transaction(async (tx) => {
        await tx.execute(
          `UPDATE job_interviews
           SET status = ?, outcome = ?, feedback = ?, interview_date = ?, interview_time = ?,
               interview_mode = ?, location_or_link = ?, instructions = ?, updated_at = datetime('now')
           WHERE id = ? AND business_id = ?`,
          [
            nextStatus,
            nextOutcome,
            feedback || null,
            interviewDate,
            interviewTime,
            interviewMode,
            locationOrLink || null,
            instructions || null,
            interview.id,
            req.businessId,
          ]
        );

        if (nextStatus === 'completed' && interview.app_status === 'interview_scheduled') {
          await tx.execute(
            `UPDATE job_applications SET status = 'interview_completed', updated_at = datetime('now') WHERE id = ?`,
            [interview.application_id]
          );
          await tx.execute(
            `INSERT INTO application_status_history (application_id, previous_status, new_status, changed_by_user_id, note)
             VALUES (?, 'interview_scheduled', 'interview_completed', ?, ?)`,
            [interview.application_id, req.user.id, `Interview completed (${nextOutcome})`]
          );
        }
      });

      if (nextStatus === 'cancelled' || req.body.interview_date || req.body.interview_time) {
        await createNotification({
          businessId: req.businessId,
          userId: interview.applicant_user_id,
          eventType: 'recruitment_interview',
          title: `Interview Updated — ${interview.vacancy_title}`,
          message:
            nextStatus === 'cancelled'
              ? `Your scheduled interview with ${req.business.name} was cancelled.`
              : `Your interview with ${req.business.name} was updated to ${interviewDate} at ${interviewTime} (${interviewMode}).`,
          relatedUrl: `/customer?tab=applications&applicationId=${interview.application_id}`,
        });
      }

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'recruitment.interview_updated',
        entityType: 'job_interview',
        entityId: interview.id,
        changes: { status: nextStatus, outcome: nextOutcome },
        ipAddress: req.ip,
      });

      const updated = await queryOne('SELECT * FROM job_interviews WHERE id = ?', [interview.id]);
      res.json({ message: 'Interview record updated.', interview: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/recruitment/applications/:id/notes',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.manage'),
  [body('note').trim().isLength({ min: 2, max: 2000 }).withMessage('Internal review note is required')],
  validateRequest,
  async (req, res, next) => {
    try {
      const application = await queryOne(
        `SELECT id FROM job_applications WHERE id = ? AND business_id = ? AND status != 'draft'`,
        [Number(req.params.id), req.businessId]
      );
      if (!application) {
        return res.status(404).json({ error: 'Application not found in your business workspace' });
      }

      const ins = await execute(
        `INSERT INTO recruitment_notes (application_id, business_id, author_user_id, note) VALUES (?, ?, ?, ?)`,
        [application.id, req.businessId, req.user.id, req.body.note.trim()]
      );

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'recruitment.note_added',
        entityType: 'recruitment_note',
        entityId: ins.insertId,
        changes: { application_id: application.id },
        ipAddress: req.ip,
      });

      const created = await queryOne(
        `SELECT n.*, u.full_name AS author_name, u.avatar_url AS author_avatar
         FROM recruitment_notes n
         LEFT JOIN users u ON u.id = n.author_user_id
         WHERE n.id = ?`,
        [ins.insertId]
      );
      res.status(201).json({ message: 'Internal recruitment note added.', note: created });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/recruitment/documents/:docId',
  authenticate,
  requireBusiness,
  requirePermission('recruitment.view'),
  async (req, res, next) => {
    try {
      const doc = await queryOne(
        `SELECT * FROM application_documents WHERE id = ? AND business_id = ? AND is_active = 1`,
        [Number(req.params.docId), req.businessId]
      );
      if (!doc) {
        return res.status(404).json({ error: 'Document not found or access denied for this business' });
      }

      await logAudit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'recruitment.document_accessed',
        entityType: 'application_document',
        entityId: doc.id,
        changes: { category: doc.document_category, download: req.query.download === '1' },
        ipAddress: req.ip,
      });

      return streamPrivateDocument(doc, req, res);
    } catch (err) {
      next(err);
    }
  }
);

// ================= CUSTOMER / APPLICANT ROUTES =================
router.get('/customer/applications', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT ja.*, v.title AS vacancy_title, v.department AS vacancy_department, v.location AS vacancy_location,
              v.employment_type AS vacancy_employment_type, v.work_mode AS vacancy_work_mode,
              v.application_deadline AS vacancy_deadline,
              b.name AS business_name, b.slug AS business_slug, b.logo_url AS business_logo,
              (SELECT ji.interview_date FROM job_interviews ji WHERE ji.application_id = ja.id AND ji.status = 'scheduled' ORDER BY ji.id DESC LIMIT 1) AS next_interview_date,
              (SELECT ji.interview_time FROM job_interviews ji WHERE ji.application_id = ja.id AND ji.status = 'scheduled' ORDER BY ji.id DESC LIMIT 1) AS next_interview_time,
              (SELECT ji.interview_mode FROM job_interviews ji WHERE ji.application_id = ja.id AND ji.status = 'scheduled' ORDER BY ji.id DESC LIMIT 1) AS next_interview_mode
       FROM job_applications ja
       JOIN job_vacancies v ON v.id = ja.vacancy_id
       JOIN businesses b ON b.id = ja.business_id
       WHERE ja.applicant_user_id = ?
       ORDER BY ja.updated_at DESC, ja.id DESC`,
      [req.user.id]
    );
    res.json({ applications: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/customer/applications/:id', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const application = await queryOne(
      `SELECT ja.*, v.title AS vacancy_title, v.department AS vacancy_department, v.location AS vacancy_location,
              v.employment_type AS vacancy_employment_type, v.work_mode AS vacancy_work_mode,
              v.description AS vacancy_description, v.requirements AS vacancy_requirements,
              v.required_document_types_json, v.custom_questions_json, v.application_deadline AS vacancy_deadline,
              b.name AS business_name, b.slug AS business_slug, b.logo_url AS business_logo,
              b.district AS business_district, b.country AS business_country
       FROM job_applications ja
       JOIN job_vacancies v ON v.id = ja.vacancy_id
       JOIN businesses b ON b.id = ja.business_id
       WHERE ja.id = ? AND ja.applicant_user_id = ?`,
      [Number(req.params.id), req.user.id]
    );
    if (!application) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    const relations = await loadApplicationRelations(application.id, {
      includeNotes: false, // NEVER expose internal business staff notes to applicants
      docBaseUrl: '/api/customer/applications',
    });

    res.json({
      application: {
        ...application,
        required_document_types: safeJsonParse(application.required_document_types_json, []),
        custom_questions: safeJsonParse(application.custom_questions_json, []),
      },
      ...relations,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/customer/jobs/:vacancyId/draft', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    if (req.user.is_platform_admin) {
      return res.status(403).json({ error: 'Platform Super Admin accounts cannot apply for business jobs.' });
    }

    const vacancy = await queryOne(
      `SELECT v.*, b.name AS business_name, b.status AS business_status
       FROM job_vacancies v
       JOIN businesses b ON b.id = v.business_id
       WHERE v.id = ? AND v.status = 'published' AND b.status = 'active' AND b.deleted_at IS NULL`,
      [Number(req.params.vacancyId)]
    );
    if (!vacancy) {
      return res.status(404).json({ error: 'Job vacancy not found or no longer accepting applications' });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (vacancy.application_deadline && String(vacancy.application_deadline).slice(0, 10) < todayStr) {
      return res.status(400).json({ error: 'The application deadline for this vacancy has passed.' });
    }

    const existingDraft = await queryOne(
      `SELECT id FROM job_applications WHERE vacancy_id = ? AND applicant_user_id = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`,
      [vacancy.id, req.user.id]
    );
    if (existingDraft) {
      const fullApp = await queryOne('SELECT * FROM job_applications WHERE id = ?', [existingDraft.id]);
      const relations = await loadApplicationRelations(existingDraft.id, { includeNotes: false });
      return res.json({
        message: 'Resumed existing draft application.',
        application: fullApp,
        vacancy: formatVacancy(vacancy),
        ...relations,
      });
    }

    const priorApps = await query(
      `SELECT id, status, reference_number FROM job_applications
       WHERE vacancy_id = ? AND applicant_user_id = ? AND status != 'draft'
       ORDER BY id DESC`,
      [vacancy.id, req.user.id]
    );

    if (priorApps.length > 0) {
      const hasActive = priorApps.some((a) => ACTIVE_NON_REAPPLICABLE_STATUSES.includes(a.status));
      if (hasActive || !vacancy.allow_reapplication) {
        return res.status(409).json({
          error: `You have already applied for ${vacancy.title} (${priorApps[0].reference_number || 'submitted'}). Multiple applications to the same vacancy are not permitted.`,
          existing_application_id: priorApps[0].id,
        });
      }
    }

    const profile = await queryOne('SELECT * FROM customer_profiles WHERE user_id = ?', [req.user.id]);
    const ins = await execute(
      `INSERT INTO job_applications (
        vacancy_id, business_id, applicant_user_id, full_name, profile_photo_url,
        phone, email, country, district, residential_address, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [
        vacancy.id,
        vacancy.business_id,
        req.user.id,
        req.user.full_name,
        req.user.avatar_url || null,
        req.user.phone || '',
        req.user.email || '',
        profile?.country || 'Rwanda',
        profile?.city || null,
        profile?.default_address || null,
      ]
    );

    const created = await queryOne('SELECT * FROM job_applications WHERE id = ?', [ins.insertId]);
    const relations = await loadApplicationRelations(ins.insertId, { includeNotes: false });

    res.status(201).json({
      message: 'Draft job application started.',
      application: created,
      vacancy: formatVacancy(vacancy),
      ...relations,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/customer/applications/:id', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const application = await queryOne(
      'SELECT * FROM job_applications WHERE id = ? AND applicant_user_id = ?',
      [Number(req.params.id), req.user.id]
    );
    if (!application) {
      return res.status(404).json({ error: 'Job application not found' });
    }
    if (application.status !== 'draft') {
      return res.status(403).json({
        error: 'Submitted applications cannot have personal details, qualifications, or answers altered.',
      });
    }

    const {
      full_name,
      date_of_birth,
      gender,
      phone,
      email,
      nationality,
      country,
      province,
      district,
      sector,
      residential_address,
      has_work_experience,
      years_of_experience,
      skills_summary,
      availability,
      preferred_employment_type,
      expected_salary,
      why_want_position,
      why_select_you,
      cover_letter,
      accuracy_confirmed,
      education,
      experiences,
      skills,
      answers,
    } = req.body;

    await transaction(async (tx) => {
      const normalizedExpFlag =
        has_work_experience === true || has_work_experience === 1 || has_work_experience === '1'
          ? 1
          : has_work_experience === false || has_work_experience === 0 || has_work_experience === '0'
            ? 0
            : application.has_work_experience;

      await tx.execute(
        `UPDATE job_applications
         SET full_name = ?, date_of_birth = ?, gender = ?, phone = ?, email = ?, nationality = ?,
             country = ?, province = ?, district = ?, sector = ?, residential_address = ?,
             has_work_experience = ?, years_of_experience = ?, skills_summary = ?, availability = ?,
             preferred_employment_type = ?, expected_salary = ?, why_want_position = ?,
             why_select_you = ?, cover_letter = ?, accuracy_confirmed = ?, updated_at = datetime('now')
         WHERE id = ? AND applicant_user_id = ?`,
        [
          String(full_name ?? application.full_name).trim(),
          date_of_birth !== undefined ? (date_of_birth ? String(date_of_birth).slice(0, 10) : null) : application.date_of_birth,
          gender !== undefined ? String(gender || '').trim() || null : application.gender,
          String(phone ?? application.phone).trim(),
          String(email ?? application.email).trim(),
          nationality !== undefined ? String(nationality || '').trim() || null : application.nationality,
          country !== undefined ? String(country || '').trim() || null : application.country,
          province !== undefined ? String(province || '').trim() || null : application.province,
          district !== undefined ? String(district || '').trim() || null : application.district,
          sector !== undefined ? String(sector || '').trim() || null : application.sector,
          residential_address !== undefined ? String(residential_address || '').trim() || null : application.residential_address,
          normalizedExpFlag,
          normalizedExpFlag === 0
            ? 0
            : Math.max(0, Number(years_of_experience ?? application.years_of_experience ?? 0)),
          skills_summary !== undefined ? String(skills_summary || '').trim() || null : application.skills_summary,
          availability !== undefined ? String(availability || '').trim() || null : application.availability,
          preferred_employment_type !== undefined
            ? String(preferred_employment_type || '').trim() || null
            : application.preferred_employment_type,
          expected_salary !== undefined && expected_salary !== null && expected_salary !== ''
            ? Number(expected_salary)
            : expected_salary === '' || expected_salary === null
              ? null
              : application.expected_salary,
          why_want_position !== undefined ? String(why_want_position || '').trim() || null : application.why_want_position,
          why_select_you !== undefined ? String(why_select_you || '').trim() || null : application.why_select_you,
          cover_letter !== undefined ? String(cover_letter || '').trim() || null : application.cover_letter,
          accuracy_confirmed !== undefined ? (accuracy_confirmed ? 1 : 0) : application.accuracy_confirmed,
          application.id,
          req.user.id,
        ]
      );

      if (Array.isArray(education)) {
        await tx.execute('DELETE FROM applicant_education WHERE application_id = ?', [application.id]);
        for (const edu of education) {
          if (!edu || !String(edu.institution_name || '').trim()) continue;
          const level = EDUCATION_LEVELS.includes(edu.education_level) ? edu.education_level : 'Other';
          const eduStatus = EDUCATION_STATUSES.includes(edu.education_status) ? edu.education_status : 'Completed';
          await tx.execute(
            `INSERT INTO applicant_education (
              application_id, education_level, institution_name, field_of_study,
              qualification_obtained, start_year, graduation_year, country, education_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              application.id,
              level,
              String(edu.institution_name).trim(),
              String(edu.field_of_study || '').trim(),
              String(edu.qualification_obtained || '').trim(),
              edu.start_year ? Number(edu.start_year) : null,
              edu.graduation_year ? Number(edu.graduation_year) : null,
              String(edu.country || '').trim() || null,
              eduStatus,
            ]
          );
        }
      }

      if (normalizedExpFlag === 0) {
        await tx.execute('DELETE FROM applicant_experiences WHERE application_id = ?', [application.id]);
      } else if (Array.isArray(experiences)) {
        await tx.execute('DELETE FROM applicant_experiences WHERE application_id = ?', [application.id]);
        for (const exp of experiences) {
          if (!exp || !String(exp.company_name || '').trim()) continue;
          await tx.execute(
            `INSERT INTO applicant_experiences (
              application_id, company_name, job_title, employment_type, work_location,
              start_date, end_date, is_current, responsibilities, achievements,
              reason_for_leaving, reference_person, reference_phone
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              application.id,
              String(exp.company_name).trim(),
              String(exp.job_title || '').trim(),
              String(exp.employment_type || '').trim() || null,
              String(exp.work_location || '').trim() || null,
              String(exp.start_date || '').trim(),
              exp.is_current ? null : String(exp.end_date || '').trim() || null,
              exp.is_current ? 1 : 0,
              String(exp.responsibilities || '').trim() || null,
              String(exp.achievements || '').trim() || null,
              String(exp.reason_for_leaving || '').trim() || null,
              String(exp.reference_person || '').trim() || null,
              String(exp.reference_phone || '').trim() || null,
            ]
          );
        }
      }

      if (Array.isArray(skills)) {
        await tx.execute('DELETE FROM applicant_skills WHERE application_id = ?', [application.id]);
        const allowedCategories = ['technical', 'professional', 'computer', 'training', 'language', 'other'];
        for (const sk of skills) {
          if (!sk || !String(sk.skill_name || '').trim()) continue;
          const cat = allowedCategories.includes(sk.skill_category) ? sk.skill_category : 'technical';
          await tx.execute(
            `INSERT INTO applicant_skills (application_id, skill_category, skill_name, proficiency_level, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [
              application.id,
              cat,
              String(sk.skill_name).trim(),
              String(sk.proficiency_level || '').trim() || null,
              String(sk.notes || '').trim() || null,
            ]
          );
        }
      }

      if (Array.isArray(answers)) {
        await tx.execute('DELETE FROM application_answers WHERE application_id = ?', [application.id]);
        for (const ans of answers) {
          if (!ans || !String(ans.question_key || '').trim()) continue;
          await tx.execute(
            `INSERT INTO application_answers (application_id, vacancy_id, question_key, question_label, answer_text)
             VALUES (?, ?, ?, ?, ?)`,
            [
              application.id,
              application.vacancy_id,
              String(ans.question_key).trim(),
              String(ans.question_label || ans.question_key).trim(),
              String(ans.answer_text || '').trim(),
            ]
          );
        }
      }
    });

    const updated = await queryOne('SELECT * FROM job_applications WHERE id = ?', [application.id]);
    const relations = await loadApplicationRelations(application.id, { includeNotes: false });
    res.json({
      message: 'Draft saved.',
      application: updated,
      ...relations,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/customer/applications/:id/cv',
  authenticate,
  requireProfileImage,
  cvUpload.single('cv'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'CV file (PDF or DOCX, max 10MB) is required.' });
      }
      if (!verifyCvSignature(req.file.path, req.file.mimetype)) {
        cleanupMulterFiles(req);
        return res.status(400).json({
          error: 'Invalid CV file content. Upload a genuine PDF or DOCX document.',
        });
      }

      const application = await queryOne(
        'SELECT * FROM job_applications WHERE id = ? AND applicant_user_id = ?',
        [Number(req.params.id), req.user.id]
      );
      if (!application) {
        cleanupMulterFiles(req);
        return res.status(404).json({ error: 'Job application not found' });
      }
      if (application.status !== 'draft') {
        cleanupMulterFiles(req);
        return res.status(403).json({ error: 'Cannot modify CV after application has been submitted.' });
      }

      const oldCvs = await query(
        `SELECT id, stored_path FROM application_documents
         WHERE application_id = ? AND document_category = 'cv' AND is_active = 1`,
        [application.id]
      );

      const ins = await execute(
        `INSERT INTO application_documents (
          application_id, business_id, applicant_user_id, document_category, document_type,
          document_name, original_filename, stored_path, mime_type, file_size_bytes, is_active
        ) VALUES (?, ?, ?, 'cv', 'Curriculum Vitae', 'Curriculum Vitae (CV)', ?, ?, ?, ?, 1)`,
        [
          application.id,
          application.business_id,
          req.user.id,
          req.file.originalname || 'cv',
          req.file.path,
          req.file.mimetype,
          req.file.size || 0,
        ]
      );

      for (const old of oldCvs) {
        await execute('UPDATE application_documents SET is_active = 0 WHERE id = ?', [old.id]);
        removeUploadedFile(old.stored_path);
      }

      const doc = await queryOne(
        `SELECT id, application_id, document_category, document_type, document_name, original_filename, mime_type, file_size_bytes, is_active, uploaded_at
         FROM application_documents WHERE id = ?`,
        [ins.insertId]
      );

      res.status(201).json({
        message: 'CV uploaded securely.',
        document: {
          ...doc,
          download_url: `/api/customer/applications/${application.id}/documents/${doc.id}`,
        },
      });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.post(
  '/customer/applications/:id/documents',
  authenticate,
  requireProfileImage,
  certificateUpload.single('document'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Document file (PDF, JPG, JPEG, PNG, max 10MB) is required.' });
      }
      if (!verifyCertificateSignature(req.file.path, req.file.mimetype)) {
        cleanupMulterFiles(req);
        return res.status(400).json({
          error: 'Invalid document content. Upload a genuine PDF, JPG, JPEG, or PNG file.',
        });
      }

      const application = await queryOne(
        'SELECT * FROM job_applications WHERE id = ? AND applicant_user_id = ?',
        [Number(req.params.id), req.user.id]
      );
      if (!application) {
        cleanupMulterFiles(req);
        return res.status(404).json({ error: 'Job application not found' });
      }
      if (application.status !== 'draft') {
        cleanupMulterFiles(req);
        return res.status(403).json({ error: 'Cannot upload additional documents after submission.' });
      }

      const docType = String(req.body.document_type || 'Academic Certificate').trim().slice(0, 100);
      const docName = String(req.body.document_name || req.file.originalname || docType).trim().slice(0, 200);

      const ins = await execute(
        `INSERT INTO application_documents (
          application_id, business_id, applicant_user_id, document_category, document_type,
          document_name, original_filename, stored_path, mime_type, file_size_bytes, is_active
        ) VALUES (?, ?, ?, 'certificate', ?, ?, ?, ?, ?, ?, 1)`,
        [
          application.id,
          application.business_id,
          req.user.id,
          docType,
          docName,
          req.file.originalname || docName,
          req.file.path,
          req.file.mimetype,
          req.file.size || 0,
        ]
      );

      const doc = await queryOne(
        `SELECT id, application_id, document_category, document_type, document_name, original_filename, mime_type, file_size_bytes, is_active, uploaded_at
         FROM application_documents WHERE id = ?`,
        [ins.insertId]
      );

      res.status(201).json({
        message: 'Certificate/document uploaded.',
        document: {
          ...doc,
          download_url: `/api/customer/applications/${application.id}/documents/${doc.id}`,
        },
      });
    } catch (err) {
      cleanupMulterFiles(req);
      next(err);
    }
  }
);

router.delete(
  '/customer/applications/:id/documents/:docId',
  authenticate,
  requireProfileImage,
  async (req, res, next) => {
    try {
      const application = await queryOne(
        'SELECT id, status FROM job_applications WHERE id = ? AND applicant_user_id = ?',
        [Number(req.params.id), req.user.id]
      );
      if (!application) return res.status(404).json({ error: 'Job application not found' });
      if (application.status !== 'draft') {
        return res.status(403).json({ error: 'Documents cannot be removed after submission.' });
      }

      const doc = await queryOne(
        `SELECT * FROM application_documents WHERE id = ? AND application_id = ? AND applicant_user_id = ? AND is_active = 1`,
        [Number(req.params.docId), application.id, req.user.id]
      );
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      await execute('UPDATE application_documents SET is_active = 0 WHERE id = ?', [doc.id]);
      removeUploadedFile(doc.stored_path);

      res.json({ message: 'Document removed.' });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/customer/applications/:id/submit', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const application = await queryOne(
      'SELECT * FROM job_applications WHERE id = ? AND applicant_user_id = ?',
      [Number(req.params.id), req.user.id]
    );
    if (!application) return res.status(404).json({ error: 'Job application not found' });
    if (application.status !== 'draft') {
      return res.status(409).json({ error: `Application has already been ${application.status}.` });
    }

    const vacancy = await queryOne(
      `SELECT v.*, b.name AS business_name, b.status AS business_status
       FROM job_vacancies v
       JOIN businesses b ON b.id = v.business_id
       WHERE v.id = ?`,
      [application.vacancy_id]
    );
    if (!vacancy || vacancy.status !== 'published' || vacancy.business_status !== 'active') {
      return res.status(400).json({ error: 'This job vacancy is no longer open for submission.' });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (vacancy.application_deadline && String(vacancy.application_deadline).slice(0, 10) < todayStr) {
      return res.status(400).json({ error: 'The application deadline for this vacancy has passed.' });
    }

    const accuracyFlag = req.body?.accuracy_confirmed !== undefined
      ? Boolean(req.body.accuracy_confirmed)
      : Boolean(application.accuracy_confirmed);
    if (!accuracyFlag) {
      return res.status(400).json({ error: 'You must confirm that all submitted application details are accurate and truthful.' });
    }

    // Validate required personal fields
    if (!String(application.full_name || '').trim() || !String(application.phone || '').trim() || !String(application.email || '').trim()) {
      return res.status(400).json({ error: 'Step 1 (Personal Information): Full name, phone, and email are required.' });
    }
    if (!String(application.profile_photo_url || req.user.avatar_url || '').trim()) {
      return res.status(400).json({ error: 'A profile image is required before submitting your application.' });
    }

    // Validate Step 2 Education
    const eduRows = await query('SELECT * FROM applicant_education WHERE application_id = ?', [application.id]);
    if (eduRows.length === 0) {
      return res.status(400).json({ error: 'Step 2 (Educational Background): Add at least one educational background record.' });
    }

    // Validate Step 4 Experience flag
    if (application.has_work_experience !== 0 && application.has_work_experience !== 1) {
      return res.status(400).json({ error: 'Step 4 (Work Experience): Indicate whether you have prior work experience (Yes or No).' });
    }
    if (application.has_work_experience === 1) {
      const expRows = await query('SELECT * FROM applicant_experiences WHERE application_id = ?', [application.id]);
      if (expRows.length === 0) {
        return res.status(400).json({ error: 'Step 4 (Work Experience): Add at least one work experience record or select No.' });
      }
    }

    // Validate Step 5 Mandatory CV
    const activeCv = await queryOne(
      `SELECT id FROM application_documents WHERE application_id = ? AND document_category = 'cv' AND is_active = 1`,
      [application.id]
    );
    if (!activeCv) {
      return res.status(400).json({ error: 'Step 5 (CV Upload): Uploading your CV (PDF or DOCX) is mandatory before submission.' });
    }

    // Validate Step 3 Vacancy-required certificate document types
    const requiredDocTypes = safeJsonParse(vacancy.required_document_types_json, []);
    if (requiredDocTypes.length > 0) {
      const uploadedCerts = await query(
        `SELECT document_type FROM application_documents WHERE application_id = ? AND document_category = 'certificate' AND is_active = 1`,
        [application.id]
      );
      const uploadedTypes = new Set(uploadedCerts.map((c) => String(c.document_type).toLowerCase()));
      const missingDocs = requiredDocTypes.filter((t) => !uploadedTypes.has(String(t).toLowerCase()));
      if (missingDocs.length > 0) {
        return res.status(400).json({
          error: `Step 3 (Diplomas & Certificates): Missing required document(s): ${missingDocs.join(', ')}.`,
        });
      }
    }

    // Validate Step 7 Job-specific questions
    if (!String(application.why_want_position || '').trim() || !String(application.why_select_you || '').trim()) {
      return res.status(400).json({
        error: 'Step 7 (Job-Specific Questions): Please answer both why you want this position and why you should be selected.',
      });
    }
    const customQuestions = safeJsonParse(vacancy.custom_questions_json, []);
    if (customQuestions.length > 0) {
      const savedAnswers = await query('SELECT * FROM application_answers WHERE application_id = ?', [application.id]);
      const ansMap = new Map(savedAnswers.map((a) => [a.question_key, String(a.answer_text || '').trim()]));
      const missingQ = customQuestions.find((q) => q.required && !ansMap.get(q.key));
      if (missingQ) {
        return res.status(400).json({ error: `Step 7 (Job-Specific Questions): "${missingQ.label}" is required.` });
      }
    }

    // Duplicate safeguard check right before submit
    const priorSubmitted = await query(
      `SELECT id, status FROM job_applications WHERE vacancy_id = ? AND applicant_user_id = ? AND status != 'draft' AND id != ?`,
      [vacancy.id, req.user.id, application.id]
    );
    if (priorSubmitted.length > 0) {
      const hasActive = priorSubmitted.some((a) => ACTIVE_NON_REAPPLICABLE_STATUSES.includes(a.status));
      if (hasActive || !vacancy.allow_reapplication) {
        return res.status(409).json({ error: 'An application for this vacancy already exists on your account.' });
      }
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const refNumber = `APP-${datePart}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    await transaction(async (tx) => {
      await tx.execute(
        `UPDATE job_applications
         SET reference_number = ?, accuracy_confirmed = 1, status = 'submitted',
             submitted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND applicant_user_id = ?`,
        [refNumber, application.id, req.user.id]
      );
      await tx.execute(
        `INSERT INTO application_status_history (application_id, previous_status, new_status, changed_by_user_id, note)
         VALUES (?, NULL, 'submitted', ?, 'Application submitted by applicant')`,
        [application.id, req.user.id]
      );
    });

    await createNotification({
      businessId: application.business_id,
      userId: req.user.id,
      eventType: 'recruitment_submitted',
      title: `Application Submitted — ${refNumber}`,
      message: `Your application for ${vacancy.title} at ${vacancy.business_name} has been submitted successfully.`,
      relatedUrl: `/customer?tab=applications&applicationId=${application.id}`,
    });

    await notifyBusinessManagers(
      application.business_id,
      'recruitment_new_application',
      `New Job Application (${refNumber})`,
      `${application.full_name} applied for ${vacancy.title}.`,
      `/app/recruitment?applicationId=${application.id}`
    );

    await logAudit({
      businessId: application.business_id,
      userId: req.user.id,
      action: 'recruitment.application_submitted',
      entityType: 'job_application',
      entityId: application.id,
      changes: { reference_number: refNumber, vacancy_id: vacancy.id },
      ipAddress: req.ip,
    });

    const submitted = await queryOne('SELECT * FROM job_applications WHERE id = ?', [application.id]);
    res.json({
      message: `Application ${refNumber} submitted successfully.`,
      reference_number: refNumber,
      application: submitted,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/customer/applications/:id/withdraw', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const application = await queryOne(
      `SELECT ja.*, v.title AS vacancy_title
       FROM job_applications ja
       JOIN job_vacancies v ON v.id = ja.vacancy_id
       WHERE ja.id = ? AND ja.applicant_user_id = ?`,
      [Number(req.params.id), req.user.id]
    );
    if (!application) return res.status(404).json({ error: 'Job application not found' });

    if (['draft', 'accepted', 'rejected', 'withdrawn'].includes(application.status)) {
      return res.status(400).json({
        error: `Applications with status "${formatStatusLabel(application.status)}" cannot be withdrawn.`,
      });
    }

    const reason = String(req.body?.reason || '').trim() || 'Withdrawn by applicant';
    await transaction(async (tx) => {
      await tx.execute(
        `UPDATE job_applications SET status = 'withdrawn', withdrawn_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND applicant_user_id = ?`,
        [application.id, req.user.id]
      );
      await tx.execute(
        `INSERT INTO application_status_history (application_id, previous_status, new_status, changed_by_user_id, note)
         VALUES (?, ?, 'withdrawn', ?, ?)`,
        [application.id, application.status, req.user.id, reason]
      );
    });

    await notifyBusinessManagers(
      application.business_id,
      'recruitment_withdrawn',
      `Application Withdrawn (${application.reference_number})`,
      `${application.full_name} withdrew their application for ${application.vacancy_title}.`,
      `/app/recruitment?applicationId=${application.id}`
    );

    await logAudit({
      businessId: application.business_id,
      userId: req.user.id,
      action: 'recruitment.application_withdrawn',
      entityType: 'job_application',
      entityId: application.id,
      changes: { reason },
      ipAddress: req.ip,
    });

    res.json({ message: 'Application withdrawn successfully.', status: 'withdrawn' });
  } catch (err) {
    next(err);
  }
});

router.delete('/customer/applications/:id', authenticate, requireProfileImage, async (req, res, next) => {
  try {
    const application = await queryOne(
      'SELECT id, status FROM job_applications WHERE id = ? AND applicant_user_id = ?',
      [Number(req.params.id), req.user.id]
    );
    if (!application) return res.status(404).json({ error: 'Draft application not found' });
    if (application.status !== 'draft') {
      return res.status(400).json({ error: 'Only unsubmitted draft applications can be discarded. Use withdraw for submitted applications.' });
    }

    const docs = await query('SELECT stored_path FROM application_documents WHERE application_id = ?', [application.id]);
    await execute('DELETE FROM job_applications WHERE id = ? AND applicant_user_id = ?', [application.id, req.user.id]);
    for (const d of docs) {
      removeUploadedFile(d.stored_path);
    }

    res.json({ message: 'Draft application discarded.' });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/customer/applications/:id/documents/:docId',
  authenticate,
  requireProfileImage,
  async (req, res, next) => {
    try {
      const doc = await queryOne(
        `SELECT * FROM application_documents
         WHERE id = ? AND application_id = ? AND applicant_user_id = ? AND is_active = 1`,
        [Number(req.params.docId), Number(req.params.id), req.user.id]
      );
      if (!doc) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }
      return streamPrivateDocument(doc, req, res);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
