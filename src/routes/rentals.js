const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

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
