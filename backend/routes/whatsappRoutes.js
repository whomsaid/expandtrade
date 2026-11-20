import express from 'express';
import { body } from 'express-validator';
import { env } from '../config/env.js';
import { execute, query, queryOne } from '../config/db.js';
import { authenticate, requirePasswordChanged } from '../middleware/auth.js';
import { requireBusiness } from '../middleware/tenant.js';
import { validateRequest } from '../middleware/errorHandler.js';
import { emitToBusiness, logAudit } from '../services/auditService.js';
import { isSmsConfigured } from '../services/smsService.js';
import {
  getWhatsAppStatusSummary,
  isOptInMessage,
  isOptOutMessage,
  isWhatsAppConfigured,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  verifyWhatsAppWebhookSignature,
} from '../services/whatsappService.js';
import { buildWhatsAppDeepLink, normalizePhoneE164 } from '../utils/phone.js';

const router = express.Router();

// Meta WhatsApp Webhook Verification Challenge
router.get('/whatsapp/webhook', (req, res) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  if (mode === 'subscribe' && env.whatsapp.verifyToken && token === env.whatsapp.verifyToken) {
    return res.status(200).type('text/plain').send(challenge);
  }
  return res.status(403).json({ error: 'Webhook verification failed.' });
});

// Meta WhatsApp Incoming Messages & Delivery Status Webhook
router.post('/whatsapp/webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!verifyWhatsAppWebhookSignature(req.rawBody, signature)) {
    return res.status(403).json({ error: 'Invalid webhook signature.' });
  }

  // Acknowledge immediately so Meta never times out retrying
  res.status(200).json({ received: true });

  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};

        // 1. Handle outbound message status updates (sent, delivered, read, failed)
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const st of statuses) {
          const extId = st.id || null;
          const status = String(st.status || 'unknown').toLowerCase();
          const recipientNorm = normalizePhoneE164(st.recipient_id ? `+${st.recipient_id}` : '');
          const phoneE164 = recipientNorm.valid ? recipientNorm.e164 : st.recipient_id || null;
          const errObj = Array.isArray(st.errors) && st.errors[0] ? st.errors[0] : null;
          const errCode = errObj?.code ? String(errObj.code) : null;
          const errMsg = errObj?.message || errObj?.title || null;

          await execute(
            `INSERT INTO whatsapp_webhook_events (event_type, external_message_id, phone_e164, payload_json)
             VALUES ('status', ?, ?, ?)`,
            [extId, phoneE164, JSON.stringify(st)]
          );

          if (extId) {
            await execute(
              `UPDATE whatsapp_messages
               SET status = ?, error_code = COALESCE(?, error_code), error_message = COALESCE(?, error_message),
                   status_updated_at = datetime('now')
               WHERE external_message_id = ?`,
              [status, errCode, errMsg, extId]
            );

            const msgRow = await queryOne(
              'SELECT id, business_id, customer_id, phone_e164 FROM whatsapp_messages WHERE external_message_id = ?',
              [extId]
            );

            if (errCode === '131026' && (msgRow?.phone_e164 || phoneE164)) {
              const targetPhone = msgRow?.phone_e164 || phoneE164;
              await execute(
                `UPDATE customers SET has_whatsapp = 'no' WHERE phone = ?`,
                [targetPhone]
              );
            } else if ((status === 'delivered' || status === 'read') && (msgRow?.phone_e164 || phoneE164)) {
              const targetPhone = msgRow?.phone_e164 || phoneE164;
              await execute(
                `UPDATE customers SET has_whatsapp = 'yes' WHERE phone = ?`,
                [targetPhone]
              );
            }

            if (msgRow?.business_id) {
              emitToBusiness(msgRow.business_id, 'whatsapp:status', {
                messageId: msgRow.id,
                externalMessageId: extId,
                status,
                errorCode: errCode,
                errorMessage: errMsg,
              });
            }
          }
        }

        // 2. Handle inbound WhatsApp messages and OPT-OUT / OPT-IN commands
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const msg of messages) {
          const fromDigits = String(msg.from || '').replace(/\D/g, '');
          const norm = normalizePhoneE164(fromDigits ? `+${fromDigits}` : '');
          const phoneE164 = norm.valid ? norm.e164 : fromDigits ? `+${fromDigits}` : '';
          const extId = msg.id || null;
          const bodyText =
            msg?.text?.body ||
            msg?.button?.text ||
            msg?.interactive?.button_reply?.title ||
            msg?.interactive?.list_reply?.title ||
            `[${msg.type || 'message'} received]`;

          await execute(
            `INSERT INTO whatsapp_webhook_events (event_type, external_message_id, phone_e164, payload_json)
             VALUES ('message', ?, ?, ?)`,
            [extId, phoneE164, JSON.stringify(msg)]
          );

          if (!phoneE164) continue;

          // Mark phone as confirmed WhatsApp user and handle opt-out / opt-in keywords
          await execute(`UPDATE customers SET has_whatsapp = 'yes' WHERE phone = ?`, [phoneE164]);

          if (isOptOutMessage(bodyText)) {
            await execute(
              `UPDATE users SET whatsapp_opt_in = 0, whatsapp_opted_out_at = datetime('now'), updated_at = datetime('now')
               WHERE phone = ?`,
              [phoneE164]
            );
            await execute(
              `UPDATE customers SET whatsapp_opt_in = 0, whatsapp_opted_out_at = datetime('now')
               WHERE phone = ?`,
              [phoneE164]
            );
          } else if (isOptInMessage(bodyText)) {
            await execute(
              `UPDATE users SET whatsapp_opt_in = 1, whatsapp_opted_out_at = NULL, updated_at = datetime('now')
               WHERE phone = ?`,
              [phoneE164]
            );
            await execute(
              `UPDATE customers SET whatsapp_opt_in = 1, whatsapp_opted_out_at = NULL
               WHERE phone = ?`,
              [phoneE164]
            );
          }

          // Match recent outbound conversation or customers to attribute inbound message to workspaces
          const recentOutbound = await queryOne(
            `SELECT business_id, user_id, customer_id, entity_type, entity_id
             FROM whatsapp_messages
             WHERE phone_e164 = ? AND business_id IS NOT NULL
             ORDER BY id DESC LIMIT 1`,
            [phoneE164]
          );

          if (recentOutbound?.business_id) {
            const ins = await execute(
              `INSERT INTO whatsapp_messages
               (business_id, user_id, customer_id, entity_type, entity_id, phone_e164, direction, message_type, body, external_message_id, status, status_updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'inbound', ?, ?, ?, 'received', datetime('now'))`,
              [
                recentOutbound.business_id,
                recentOutbound.user_id || null,
                recentOutbound.customer_id || null,
                recentOutbound.entity_type || null,
                recentOutbound.entity_id || null,
                phoneE164,
                msg.type || 'text',
                String(bodyText).slice(0, 4096),
                extId,
              ]
            );
            emitToBusiness(recentOutbound.business_id, 'whatsapp:message', {
              id: ins.insertId,
              phone_e164: phoneE164,
              direction: 'inbound',
              body: String(bodyText).slice(0, 4096),
            });
          } else {
            const matchingCustomers = await query(
              `SELECT id, business_id, user_id FROM customers WHERE phone = ? LIMIT 10`,
              [phoneE164]
            );
            if (matchingCustomers.length === 0) {
              await execute(
                `INSERT INTO whatsapp_messages
                 (business_id, phone_e164, direction, message_type, body, external_message_id, status, status_updated_at)
                 VALUES (NULL, ?, 'inbound', ?, ?, ?, 'received', datetime('now'))`,
                [phoneE164, msg.type || 'text', String(bodyText).slice(0, 4096), extId]
              );
            } else {
              for (const cust of matchingCustomers) {
                const ins = await execute(
                  `INSERT INTO whatsapp_messages
                   (business_id, user_id, customer_id, entity_type, entity_id, phone_e164, direction, message_type, body, external_message_id, status, status_updated_at)
                   VALUES (?, ?, ?, 'customer', ?, ?, 'inbound', ?, ?, ?, 'received', datetime('now'))`,
                  [
                    cust.business_id,
                    cust.user_id || null,
                    cust.id,
                    cust.id,
                    phoneE164,
                    msg.type || 'text',
                    String(bodyText).slice(0, 4096),
                    extId,
                  ]
                );
                emitToBusiness(cust.business_id, 'whatsapp:message', {
                  id: ins.insertId,
                  customer_id: cust.id,
                  phone_e164: phoneE164,
                  direction: 'inbound',
                  body: String(bodyText).slice(0, 4096),
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp Webhook Error]', err);
  }
});

// Workspace WhatsApp Configuration Status
router.get('/whatsapp/status', authenticate, requirePasswordChanged, requireBusiness, async (_req, res) => {
  res.json({
    ...getWhatsAppStatusSummary(),
    smsConfigured: isSmsConfigured(),
  });
});

// Workspace WhatsApp Conversation History (Tenant-Isolated)
router.get('/whatsapp/messages', authenticate, requirePasswordChanged, requireBusiness, async (req, res, next) => {
  try {
    const rawPhone = String(req.query.phone || '').trim();
    const customerId = Number(req.query.customer_id || 0);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 40)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const where = ['wm.business_id = ?'];
    const params = [req.businessId];

    if (rawPhone) {
      const norm = normalizePhoneE164(rawPhone);
      where.push('wm.phone_e164 = ?');
      params.push(norm.valid ? norm.e164 : rawPhone);
    }
    if (customerId > 0) {
      where.push('wm.customer_id = ?');
      params.push(customerId);
    }

    const rows = await query(
      `SELECT wm.*, u.full_name AS sent_by_name
       FROM whatsapp_messages wm
       LEFT JOIN users u ON u.id = wm.sent_by_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY wm.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      messages: rows.reverse(),
      configured: isWhatsAppConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

// Send Real WhatsApp Message via Official Meta Cloud API (with Consent, Opt-Out & Deep Link Fallback)
router.post(
  '/whatsapp/send',
  authenticate,
  requirePasswordChanged,
  requireBusiness,
  [
    body('phone').trim().notEmpty().withMessage('Recipient phone number is required'),
    body('message').optional().trim().isLength({ max: 4096 }).withMessage('Message must be 4096 characters or less'),
    body('template_name').optional().trim().isLength({ max: 120 }),
    body('customer_id').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { phone, message = '', template_name, template_params = [], customer_id, entity_type, entity_id } = req.body;
      const phoneCheck = normalizePhoneE164(phone);
      if (!phoneCheck.valid) {
        return res.status(400).json({ error: phoneCheck.error });
      }

      if (!template_name && !String(message).trim()) {
        return res.status(400).json({ error: 'Enter a message or select an approved WhatsApp template.' });
      }

      // Check tenant customer consent / opt-out if customer exists
      let customer = null;
      if (customer_id) {
        customer = await queryOne(
          'SELECT id, full_name, phone, whatsapp_opt_in, whatsapp_opted_out_at, has_whatsapp FROM customers WHERE id = ? AND business_id = ?',
          [Number(customer_id), req.businessId]
        );
        if (!customer) {
          return res.status(404).json({ error: 'Customer not found in this business workspace.' });
        }
      } else {
        customer = await queryOne(
          'SELECT id, full_name, phone, whatsapp_opt_in, whatsapp_opted_out_at, has_whatsapp FROM customers WHERE phone = ? AND business_id = ? LIMIT 1',
          [phoneCheck.e164, req.businessId]
        );
      }

      const matchingUser = await queryOne(
        'SELECT id, whatsapp_opt_in, whatsapp_opted_out_at FROM users WHERE phone = ? LIMIT 1',
        [phoneCheck.e164]
      );

      if (customer?.whatsapp_opted_out_at || matchingUser?.whatsapp_opted_out_at) {
        return res.status(403).json({
          error: 'This recipient has opted out of WhatsApp messages. Respect their opt-out preference unless they opt back in.',
          code: 'WHATSAPP_OPTED_OUT',
        });
      }

      if (customer && customer.has_whatsapp === 'no') {
        return res.status(400).json({
          error: 'Earlier delivery indicated this phone number is not active on WhatsApp. Try SMS or a direct phone call instead.',
          code: 'RECIPIENT_NOT_ON_WHATSAPP',
        });
      }

      const waDeepLink = buildWhatsAppDeepLink(phoneCheck.e164, message);

      if (!isWhatsAppConfigured()) {
        return res.json({
          configured: false,
          sent_via: 'wa_me',
          phone_e164: phoneCheck.e164,
          wa_me_url: waDeepLink,
          message: 'Official WhatsApp Cloud API is not configured. Open the direct WhatsApp link to continue in WhatsApp.',
        });
      }

      // If sending a template, enforce opt-in consent on registered customer/user when known
      if (template_name && ((customer && !customer.whatsapp_opt_in) || (matchingUser && !matchingUser.whatsapp_opt_in))) {
        return res.status(403).json({
          error: 'WhatsApp notification consent has not been granted by this recipient yet.',
          code: 'WHATSAPP_CONSENT_REQUIRED',
          wa_me_url: waDeepLink,
        });
      }

      const sendRes = template_name
        ? await sendWhatsAppTemplate({
            to: phoneCheck.e164,
            templateName: template_name,
            bodyParams: Array.isArray(template_params) ? template_params : [],
          })
        : await sendWhatsAppText({
            to: phoneCheck.e164,
            body: message,
          });

      const recordedStatus = sendRes.delivered ? 'sent' : 'failed';
      const ins = await execute(
        `INSERT INTO whatsapp_messages
         (business_id, user_id, customer_id, entity_type, entity_id, phone_e164, direction, message_type, template_name, body, external_message_id, status, error_code, error_message, sent_by_user_id, status_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          req.businessId,
          matchingUser?.id || null,
          customer?.id || null,
          entity_type || (customer ? 'customer' : null),
          entity_id || customer?.id || null,
          phoneCheck.e164,
          template_name ? 'template' : 'text',
          template_name || null,
          String(message || `Template: ${template_name}`).slice(0, 4096),
          sendRes.messageId || null,
          recordedStatus,
          sendRes.errorCode || null,
          sendRes.error || null,
          req.user.id,
        ]
      );

      if (sendRes.hasWhatsapp === 'no' && customer?.id) {
        await execute(`UPDATE customers SET has_whatsapp = 'no' WHERE id = ? AND business_id = ?`, [
          customer.id,
          req.businessId,
        ]);
      }

      if (!sendRes.delivered) {
        return res.status(sendRes.reason === 'RECIPIENT_NOT_ON_WHATSAPP' ? 400 : 502).json({
          error: sendRes.error || 'Unable to send WhatsApp message.',
          code: sendRes.reason || 'WHATSAPP_DELIVERY_FAILED',
          wa_me_url: waDeepLink,
        });
      }

      const saved = await queryOne('SELECT * FROM whatsapp_messages WHERE id = ?', [ins.insertId]);
      emitToBusiness(req.businessId, 'whatsapp:message', saved);

      await logAudit({
        businessId: req.businessId,
        branchId: req.branchId,
        userId: req.user.id,
        action: 'whatsapp.message_sent',
        entityType: entity_type || 'whatsapp_message',
        entityId: ins.insertId,
        changes: { phone_e164: phoneCheck.e164, message_type: template_name ? 'template' : 'text' },
        ipAddress: req.ip,
      });

      res.status(201).json({
        configured: true,
        sent_via: 'cloud_api',
        wa_me_url: waDeepLink,
        data: saved,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Update customer WhatsApp consent (opt-in / opt-out) within workspace
router.patch(
  '/whatsapp/consent',
  authenticate,
  requirePasswordChanged,
  requireBusiness,
  [
    body('customer_id').isInt({ min: 1 }).withMessage('Valid customer ID is required'),
    body('whatsapp_opt_in').isBoolean().withMessage('Consent flag must be true or false'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { customer_id, whatsapp_opt_in } = req.body;
      const cust = await queryOne('SELECT id FROM customers WHERE id = ? AND business_id = ?', [
        Number(customer_id),
        req.businessId,
      ]);
      if (!cust) {
        return res.status(404).json({ error: 'Customer not found in this business workspace.' });
      }
      await execute(
        `UPDATE customers
         SET whatsapp_opt_in = ?,
             whatsapp_opted_out_at = CASE WHEN ? = 1 THEN NULL ELSE datetime('now') END
         WHERE id = ? AND business_id = ?`,
        [whatsapp_opt_in ? 1 : 0, whatsapp_opt_in ? 1 : 0, cust.id, req.businessId]
      );
      res.json({
        message: whatsapp_opt_in
          ? 'Customer opted in to WhatsApp notifications.'
          : 'Customer opted out of WhatsApp notifications.',
        whatsapp_opt_in: Boolean(whatsapp_opt_in),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
