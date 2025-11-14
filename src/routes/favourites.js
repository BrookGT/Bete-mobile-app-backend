const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// Add to favourites
router.post(
  '/',
  auth(),
  [body('propertyId').isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { propertyId } = req.body;
    try {
      const fav = await prisma.favourite.create({
        data: { userId: req.user.id, propertyId: Number(propertyId) },
      });
      return res.status(201).json(fav);
    } catch (e) {
      // unique constraint not defined; duplicates will just create multiple rows; prevent via upsert
      try {
        const existing = await prisma.favourite.findFirst({ where: { userId: req.user.id, propertyId: Number(propertyId) } });
        if (existing) return res.json(existing);
        return res.status(500).json({ error: 'Failed to add favourite' });
      } catch (_) {
        return res.status(500).json({ error: 'Failed to add favourite' });
      }
    }
  }
);

// Remove from favourites
router.delete('/:propertyId', auth(), async (req, res) => {
  const propertyId = Number(req.params.propertyId);
  try {
    const existing = await prisma.favourite.findFirst({ where: { userId: req.user.id, propertyId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await prisma.favourite.delete({ where: { id: existing.id } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to remove favourite' });
  }
});

// List favourites for current user (expand property)
router.get('/', auth(), async (req, res) => {
  try {
    const items = await prisma.favourite.findMany({
      where: { userId: req.user.id },
      include: { property: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list favourites' });
  }
});

module.exports = router;
