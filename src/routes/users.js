const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// Get current user profile
router.get('/me', auth(), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true, avatarUrl: true },
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    return res.json(user);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update current user profile (name, avatarUrl)
router.put(
  '/me',
  auth(),
  [
    body('name').optional().isString().isLength({ min: 2 }),
    body('avatarUrl').optional().isURL(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, avatarUrl } = req.body;
    try {
      const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: { name, avatarUrl },
        select: { id: true, name: true, email: true, role: true, createdAt: true, avatarUrl: true },
      });
      return res.json(updated);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

module.exports = router;
