const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// List my custom reminders
router.get('/', auth(), async (req, res) => {
  try {
    const items = await prisma.customReminder.findMany({
      where: { userId: req.user.id },
      orderBy: { dueDate: 'asc' },
    });
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list reminders' });
  }
});

// Create custom reminder
router.post(
  '/',
  auth(),
  [
    body('role').isString().isLength({ min: 1 }),
    body('propertyTitle').isString().isLength({ min: 1 }),
    body('counterparty').optional().isString(),
    body('amount').optional().isFloat({ gt: 0 }),
    body('dueDate').isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { role, propertyTitle, counterparty, amount, dueDate } = req.body;
    try {
      const created = await prisma.customReminder.create({
        data: {
          userId: req.user.id,
          role,
          propertyTitle,
          counterparty: counterparty || null,
          amount: amount != null ? Number(amount) : null,
          dueDate: new Date(dueDate),
        },
      });
      return res.status(201).json(created);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create reminder' });
    }
  }
);

// Update custom reminder (used for mark-paid or edits)
router.patch('/:id', auth(), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const { role, propertyTitle, counterparty, amount, dueDate } = req.body;
  try {
    const existing = await prisma.customReminder.findUnique({ where: { id } });
    if (!existing || (existing.userId !== req.user.id && req.user.role !== 'admin')) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const updated = await prisma.customReminder.update({
      where: { id },
      data: {
        role: role != null ? role : existing.role,
        propertyTitle: propertyTitle != null ? propertyTitle : existing.propertyTitle,
        counterparty: counterparty !== undefined ? counterparty : existing.counterparty,
        amount: amount !== undefined ? (amount != null ? Number(amount) : null) : existing.amount,
        dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
      },
    });
    return res.json(updated);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// Delete custom reminder
router.delete('/:id', auth(), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const existing = await prisma.customReminder.findUnique({ where: { id } });
    if (!existing || (existing.userId !== req.user.id && req.user.role !== 'admin')) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    await prisma.customReminder.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

module.exports = router;
