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
    body('description').optional({ nullable: true }).isString(),
    body('imageUrl').optional({ nullable: true }).isString(),
    body('images').optional().isArray(),
    body('location').optional({ nullable: true }).isString(),
    body('price').isFloat({ gt: 0 }),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('listingType').optional().isIn(['rent', 'sale']),
    body('bedrooms').optional({ nullable: true }).isInt({ min: 0 }),
    body('bathrooms').optional({ nullable: true }).isInt({ min: 0 }),
    body('area').optional({ nullable: true }).isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { 
      title, description, imageUrl, images, location, price, 
      lat, lng, listingType, bedrooms, bathrooms, area 
    } = req.body;
    try {
      const created = await prisma.property.create({
        data: {
          title,
          description: description || null,
          imageUrl: imageUrl || null,
          images: Array.isArray(images) ? images : [],
          location: location || null,
          price: Number(price),
          lat: lat !== undefined ? Number(lat) : null,
          lng: lng !== undefined ? Number(lng) : null,
          listingType: listingType || 'rent',
          bedrooms: bedrooms !== undefined ? Number(bedrooms) : null,
          bathrooms: bathrooms !== undefined ? Number(bathrooms) : null,
          area: area || null,
          ownerId: req.user.id,
        },
      });
      return res.status(201).json(created);
    } catch (e) {
      console.error('Create property error:', e);
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
    body('description').optional({ nullable: true }).isString(),
    body('imageUrl').optional({ nullable: true }).isString(),
    body('images').optional().isArray(),
    body('location').optional({ nullable: true }).isString(),
    body('price').optional().isFloat({ gt: 0 }),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('listingType').optional().isIn(['rent', 'sale']),
    body('bedrooms').optional({ nullable: true }).isInt({ min: 0 }),
    body('bathrooms').optional({ nullable: true }).isInt({ min: 0 }),
    body('area').optional({ nullable: true }).isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const id = Number(req.params.id);
    try {
      const existing = await prisma.property.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
      const { 
        title, description, imageUrl, images, location, price, 
        lat, lng, listingType, bedrooms, bathrooms, area 
      } = req.body;
      
      // Build update data object, only including defined fields
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description || null;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;
      if (images !== undefined) updateData.images = Array.isArray(images) ? images : [];
      if (location !== undefined) updateData.location = location || null;
      if (price !== undefined) updateData.price = Number(price);
      if (lat !== undefined) updateData.lat = lat !== null ? Number(lat) : null;
      if (lng !== undefined) updateData.lng = lng !== null ? Number(lng) : null;
      if (listingType !== undefined) updateData.listingType = listingType;
      if (bedrooms !== undefined) updateData.bedrooms = bedrooms !== null ? Number(bedrooms) : null;
      if (bathrooms !== undefined) updateData.bathrooms = bathrooms !== null ? Number(bathrooms) : null;
      if (area !== undefined) updateData.area = area || null;

      const updated = await prisma.property.update({
        where: { id },
        data: updateData,
      });
      return res.json(updated);
    } catch (e) {
      console.error('Update property error:', e);
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
