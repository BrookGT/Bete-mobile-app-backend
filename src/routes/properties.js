const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// Create property (owner is authenticated user)
router.post(
  '/',
  auth(),
  [
    body('title').isString().isLength({ min: 2 }),
    body('description').isString().isLength({ min: 5 }),
    body('imageUrl').isURL(),
    body('location').isString().isLength({ min: 2 }),
    body('price').isFloat({ gt: 0 }),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { title, description, imageUrl, location, price, lat, lng } = req.body;
    try {
      const created = await prisma.property.create({
        data: {
          title,
          description,
          imageUrl,
          location,
          price: Number(price),
          lat: lat !== undefined ? Number(lat) : undefined,
          lng: lng !== undefined ? Number(lng) : undefined,
          ownerId: req.user.id,
        },
      });
      return res.status(201).json(created);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create property' });
    }
  }
);

// List properties with optional filters: ownerId, q (search in title/description)
router.get('/', async (req, res) => {
  const { ownerId, q } = req.query;
  try {
    const where = {};
    if (ownerId) where.ownerId = Number(ownerId);
    if (q) where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
    const items = await prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list properties' });
  }
});

// Get single property
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.property.findUnique({ where: { id: Number(req.params.id) } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    return res.json(item);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to get property' });
  }
});

// Update property (owner-only)
router.put(
  '/:id',
  auth(),
  [
    body('title').optional().isString().isLength({ min: 2 }),
    body('description').optional().isString().isLength({ min: 5 }),
    body('imageUrl').optional().isURL(),
    body('location').optional().isString().isLength({ min: 2 }),
    body('price').optional().isFloat({ gt: 0 }),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const id = Number(req.params.id);
    try {
      const existing = await prisma.property.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
      const { title, description, imageUrl, location, price, lat, lng } = req.body;
      const updated = await prisma.property.update({
        where: { id },
        data: {
          title,
          description,
          imageUrl,
          location,
          price: price !== undefined ? Number(price) : undefined,
          lat: lat !== undefined ? Number(lat) : undefined,
          lng: lng !== undefined ? Number(lng) : undefined,
        },
      });
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to update property' });
    }
  }
);

// Delete property (owner-only)
router.delete('/:id', auth(), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const existing = await prisma.property.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await prisma.property.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete property' });
  }
});

module.exports = router;
