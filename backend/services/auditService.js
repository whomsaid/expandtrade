import { execute, query } from '../config/db.js';
import { invalidatePrefix } from './cacheService.js';

let ioInstance = null;

export function setSocketIo(io) {
  ioInstance = io;
}

export function emitToBusiness(businessId, event, payload) {
  if (businessId && ['sale:created', 'inventory:updated', 'order:updated', 'expense:updated', 'payroll:updated'].includes(event)) {
    invalidatePrefix(`dashboard:${businessId}:`);
  }
  if (ioInstance && businessId) {
    ioInstance.to(`business:${businessId}`).emit(event, payload);
  }
}

export function emitToUser(userId, event, payload) {
  if (ioInstance && userId) {
    ioInstance.to(`user:${userId}`).emit(event, payload);
  }
}

export async function logAudit({
  businessId = null,
  branchId = null,
  userId = null,
  action,
  entityType,
  entityId = null,
  changes = null,
  ipAddress = null,
}) {
  try {
    await execute(
      `INSERT INTO activity_logs (business_id, branch_id, user_id, action, entity_type, entity_id, changes_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        branchId,
        userId,
        action,
        entityType,
        entityId ? String(entityId) : null,
        changes ? JSON.stringify(changes) : null,
        ipAddress,
      ]
    );
    if (businessId) {
      await execute(
        `INSERT INTO business_activity_logs (business_id, branch_id, user_id, action, entity_type, entity_id, changes_json, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId,
          branchId,
          userId,
          action,
          entityType,
          entityId ? String(entityId) : null,
          changes ? JSON.stringify(changes) : null,
          ipAddress,
        ]
      );
    }
  } catch (err) {
    console.error('[AuditLog Error]', err.message);
  }
}

export async function createNotification({
  businessId = null,
  userId,
  eventType,
  title,
  message,
  relatedUrl = null,
}) {
  try {
    const res = await execute(
      `INSERT INTO notifications (business_id, user_id, event_type, title, message, related_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [businessId, userId, eventType, title, message, relatedUrl]
    );
    const notif = {
      id: res.insertId,
      business_id: businessId,
      user_id: userId,
      event_type: eventType,
      title,
      message,
      is_read: 0,
      related_url: relatedUrl,
      created_at: new Date().toISOString(),
    };
    emitToUser(userId, 'notification:new', notif);
    return notif;
  } catch (err) {
    console.error('[Notification Error]', err.message);
    return null;
  }
}

export async function notifyBusinessManagers(businessId, eventType, title, message, relatedUrl = null) {
  const managers = await query(
    `SELECT bm.user_id
     FROM business_members bm
     JOIN roles r ON r.id = bm.role_id
     WHERE bm.business_id = ? AND bm.status = 'active'
       AND r.code IN ('business_owner', 'business_admin', 'manager', 'branch_manager', 'inventory_manager')`,
    [businessId]
  );
  for (const m of managers) {
    await createNotification({
      businessId,
      userId: m.user_id,
      eventType,
      title,
      message,
      relatedUrl,
    });
  }
}
