import { query, queryOne } from '../config/db.js';

export async function loadMemberPermissions(memberId, roleId) {
  const rolePerms = await query(
    `SELECT p.perm_key
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
    [roleId]
  );
  const permSet = new Set(rolePerms.map((r) => r.perm_key));

  const overrides = await query(
    `SELECT p.perm_key, mp.is_allowed
     FROM member_permissions mp
     JOIN permissions p ON p.id = mp.permission_id
     WHERE mp.business_member_id = ?`,
    [memberId]
  );
  for (const ov of overrides) {
    if (ov.is_allowed) permSet.add(ov.perm_key);
    else permSet.delete(ov.perm_key);
  }
  return Array.from(permSet);
}

export async function requireBusiness(req, res, next) {
  try {
    if (req.user?.must_change_password) {
      return res.status(403).json({
        error: 'Temporary password must be changed immediately before accessing your business dashboard.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    const rawBusinessId =
      req.headers['x-business-id'] ||
      req.params.businessId ||
      req.query.businessId ||
      req.body?.business_id;

    const businessId = Number(rawBusinessId);
    if (!businessId || Number.isNaN(businessId)) {
      return res.status(400).json({ error: 'Active business workspace header (x-business-id) is required' });
    }

    const isSuperAdmin = Boolean(req.user?.is_platform_admin);

    const business = await queryOne(
      'SELECT * FROM businesses WHERE id = ?',
      [businessId]
    );
    if (!business || business.status === 'deleted' || business.deleted_at) {
      return res.status(404).json({ error: 'Business workspace not found' });
    }
    if (!isSuperAdmin) {
      if (business.status === 'suspended') {
        return res.status(403).json({ error: 'This business workspace is currently suspended. Contact BizTrade Africa support.' });
      }
      if (business.status === 'deactivated') {
        return res.status(403).json({ error: 'This business workspace has been deactivated by the platform administrator.' });
      }
      if (business.status === 'pending_activation') {
        return res.status(403).json({ error: 'This business workspace is pending Business Admin account activation.' });
      }
    }

    let membership = await queryOne(
      `SELECT bm.*, r.code AS role_code, r.name AS role_name
       FROM business_members bm
       JOIN roles r ON r.id = bm.role_id
       WHERE bm.business_id = ? AND bm.user_id = ? AND bm.status = 'active'`,
      [businessId, req.user.id]
    );

    if (!membership && isSuperAdmin) {
      membership = {
        id: 0,
        business_id: businessId,
        user_id: req.user.id,
        role_id: 0,
        assigned_branch_id: null,
        all_branches_access: 1,
        job_title: 'Platform Super Admin',
        status: 'active',
        role_code: 'business_owner',
        role_name: 'Super Admin Control',
        is_super_admin_override: true,
      };
    }

    if (!membership) {
      return res.status(403).json({
        error: 'Tenant isolation violation: you do not belong to this business workspace',
      });
    }

    let permissions;
    if (isSuperAdmin || membership.is_super_admin_override) {
      const allPerms = await query('SELECT perm_key FROM permissions');
      permissions = allPerms.map((p) => p.perm_key);
    } else {
      permissions = await loadMemberPermissions(membership.id, membership.role_id);
    }
    const requestedBranchId = Number(req.headers['x-branch-id'] || req.query.branchId || req.body?.branch_id || 0);

    let effectiveBranchId = membership.assigned_branch_id || null;
    if (requestedBranchId) {
      const branch = await queryOne(
        'SELECT id FROM branches WHERE id = ? AND business_id = ? AND is_active = 1',
        [requestedBranchId, businessId]
      );
      if (!branch) {
        return res.status(403).json({ error: 'Branch does not belong to this business or is inactive' });
      }
      if (!isSuperAdmin && !membership.all_branches_access && membership.assigned_branch_id && membership.assigned_branch_id !== requestedBranchId) {
        return res.status(403).json({ error: 'You are not authorized to access this branch' });
      }
      effectiveBranchId = requestedBranchId;
    }

    if (!effectiveBranchId) {
      const mainBranch = await queryOne(
        'SELECT id FROM branches WHERE business_id = ? AND is_active = 1 ORDER BY is_main DESC, id ASC LIMIT 1',
        [businessId]
      );
      effectiveBranchId = mainBranch?.id || null;
    }

    req.business = business;
    req.businessId = businessId;
    req.membership = membership;
    req.permissions = permissions;
    req.branchId = effectiveBranchId;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(permKey) {
  return (req, res, next) => {
    if (req.user?.is_platform_admin) {
      return next();
    }
    if (!req.membership) {
      return res.status(403).json({ error: 'Business membership required' });
    }
    if (req.membership.role_code === 'business_owner' || req.membership.role_code === 'business_admin') {
      return next();
    }
    if (!req.permissions || !req.permissions.includes(permKey)) {
      return res.status(403).json({
        error: `Permission denied: missing "${permKey}" authorization`,
      });
    }
    next();
  };
}
