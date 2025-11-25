const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
let nodemailer; try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

const router = express.Router();

// Start a rental (owner-only or admin)
router.post(
  '/start',
  auth(),
  [
    body('propertyId').isInt({ gt: 0 }),
    body('borrowerId').isInt({ gt: 0 }),
    body('startDate').isISO8601(),
    body('nextDueDate').isISO8601(),
    body('rentAmount').isFloat({ gt: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

// ----- Linking flow: invites -----
// CommonJS-safe short code generator (avoids ESM nanoid import)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode(length = 8) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// Create an invite (owner or participant), optional email delivery
router.post(
  '/:id/invites',
  auth(),
  [body('inviteeEmail').optional().isEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const id = Number(req.params.id);
    const me = req.user.id;
    const { inviteeEmail } = req.body;
    try {
      const rental = await prisma.rental.findUnique({ include: { property: true }, where: { id } });
      if (!rental) return res.status(404).json({ error: 'Rental not found' });
      if (rental.borrowerId !== me && rental.property.ownerId !== me && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const code = genCode();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days
      const invite = await prisma.rentalInvite.create({
        data: { rentalId: id, code, inviterId: me, inviteeEmail: inviteeEmail || null, expiresAt },
      });

      // Optional email sending if configured and inviteeEmail present
      if (inviteeEmail && nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: inviteeEmail,
            subject: 'Bete rent invite',
            text: `Use this code to join the rental: ${code}`,
          });
        } catch (e) {
          // ignore email errors
        }
      }

      return res.status(201).json(invite);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create invite' });
    }
  }
);

// List invites for a rental (participants only)
router.get('/:id/invites', auth(), async (req, res) => {
  const id = Number(req.params.id);
  const me = req.user.id;
  try {
    const rental = await prisma.rental.findUnique({ include: { property: true }, where: { id } });
    if (!rental) return res.status(404).json({ error: 'Rental not found' });
    if (rental.borrowerId !== me && rental.property.ownerId !== me && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const invites = await prisma.rentalInvite.findMany({ where: { rentalId: id }, orderBy: { id: 'desc' } });
    return res.json(invites);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list invites' });
  }
});

// Accept an invite by code (sets borrower or links user based on who is missing)
router.post('/invites/:code/accept', auth(), async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const me = req.user.id;
  try {
    const invite = await prisma.rentalInvite.findUnique({ where: { code } });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (new Date(invite.expiresAt).getTime() < Date.now()) return res.status(410).json({ error: 'Invite expired' });
    if (invite.status !== 'pending') return res.status(409).json({ error: 'Invite already used' });

    const rental = await prisma.rental.findUnique({ include: { property: true }, where: { id: invite.rentalId } });
    if (!rental) return res.status(404).json({ error: 'Rental not found' });

    // If current user is not part of rental, try to link as borrower
    let updatedRental = rental;
    if (rental.borrowerId !== me && rental.property.ownerId !== me) {
      // Prefer linking as borrower if slot is different from owner
      if (rental.property.ownerId !== me) {
        updatedRental = await prisma.rental.update({ where: { id: rental.id }, data: { borrowerId: me } });
      }
    }

    await prisma.rentalInvite.update({ where: { id: invite.id }, data: { status: 'accepted', acceptedBy: me } });
    return res.json({ ok: true, rental: updatedRental });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to accept invite' });
  }
});
    const { propertyId, borrowerId, startDate, nextDueDate, rentAmount } = req.body;
    const me = req.user;
    try {
      const property = await prisma.property.findUnique({ where: { id: Number(propertyId) } });
      if (!property) return res.status(404).json({ error: 'Property not found' });
      if (property.ownerId !== me.id && me.role !== 'admin') {
        return res.status(403).json({ error: 'Only owner or admin can start rental' });
      }
      const rental = await prisma.rental.create({
        data: {
          propertyId: Number(propertyId),
          borrowerId: Number(borrowerId),
          startDate: new Date(startDate),
          nextDueDate: new Date(nextDueDate),
          rentAmount: Number(rentAmount),
        },
      });
      return res.status(201).json(rental);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to start rental' });
    }
  }
);

// End a rental (owner-only or admin)
router.post('/:id/end', auth(), async (req, res) => {
  const id = Number(req.params.id);
  const me = req.user;
  try {
    const rental = await prisma.rental.findUnique({ include: { property: true }, where: { id } });
    if (!rental) return res.status(404).json({ error: 'Rental not found' });
    if (rental.property.ownerId !== me.id && me.role !== 'admin') {
      return res.status(403).json({ error: 'Only owner or admin can end rental' });
    }
    const updated = await prisma.rental.update({ where: { id }, data: { isActive: false } });
    return res.json(updated);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to end rental' });
  }
});

// List my rentals (role=owner|renter)
router.get('/mine', auth(), async (req, res) => {
  const role = (req.query.role || 'renter').toLowerCase();
  const me = req.user.id;
  try {
    if (role === 'owner') {
      const items = await prisma.rental.findMany({
        where: { property: { ownerId: me } },
        include: { property: true },
        orderBy: { startDate: 'desc' },
      });
      return res.json(items);
    }
    const items = await prisma.rental.findMany({
      where: { borrowerId: me },
      include: { property: true },
      orderBy: { startDate: 'desc' },
    });
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list rentals' });
  }
});

// List reminders for a rental (must be participant)
router.get('/:id/reminders', auth(), async (req, res) => {
  const id = Number(req.params.id);
  const me = req.user.id;
  try {
    const rental = await prisma.rental.findUnique({ include: { property: true }, where: { id } });
    if (!rental) return res.status(404).json({ error: 'Rental not found' });
    if (rental.borrowerId !== me && rental.property.ownerId !== me && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const reminders = await prisma.rentReminder.findMany({ where: { rentalId: id }, orderBy: { dueDate: 'asc' } });
    return res.json(reminders);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list reminders' });
  }
});

// Create reminder for a rental (owner or borrower)
router.post(
  '/:id/reminders',
  auth(),
  [body('dueDate').isISO8601(), body('status').optional().isString()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const id = Number(req.params.id);
    const { dueDate, status } = req.body;
    try {
      const rental = await prisma.rental.findUnique({ include: { property: true }, where: { id } });
      if (!rental) return res.status(404).json({ error: 'Rental not found' });
      if (rental.borrowerId !== req.user.id && rental.property.ownerId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const reminder = await prisma.rentReminder.create({
        data: { rentalId: id, dueDate: new Date(dueDate), status: status || 'pending' },
      });
      return res.status(201).json(reminder);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create reminder' });
    }
  }
);

// Update reminder status (participant or admin)
router.patch('/reminders/:reminderId', auth(), async (req, res) => {
  const reminderId = Number(req.params.reminderId);
  const { status, notifiedAt } = req.body;
  try {
    const reminder = await prisma.rentReminder.findUnique({ where: { id: reminderId } });
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    const rental = await prisma.rental.findUnique({ include: { property: true }, where: { id: reminder.rentalId } });
    if (!rental) return res.status(404).json({ error: 'Rental not found' });
    if (rental.borrowerId !== req.user.id && rental.property.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updated = await prisma.rentReminder.update({
      where: { id: reminderId },
      data: {
        status: status || reminder.status,
        notifiedAt: notifiedAt ? new Date(notifiedAt) : reminder.notifiedAt,
      },
    });
    return res.json(updated);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update reminder' });
  }
});

module.exports = router;
