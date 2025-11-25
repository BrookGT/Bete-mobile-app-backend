const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');

const router = express.Router();

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Lightweight ping to verify router is mounted
router.get('/_ping', (req, res) => res.json({ ok: true }));

router.post(
  '/register',
  [
    body('name').isString().isLength({ min: 2 }),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, email, password } = req.body;
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: 'Email already in use' });
      const hash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({ data: { name, email, password: hash } });
      const token = sign(user);
      return res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (e) {
      console.error('Register error:', e?.code || e?.name || e, e?.message);
      return res.status(500).json({ error: 'Registration failed' });
    }
  }
);

router.post(
  '/login',
  [body('email').isEmail(), body('password').isString()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        // specific message when account does not exist
        return res.status(404).json({ error: 'Account not found. Please sign up.' });
      }

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        // specific message for wrong password
        return res.status(401).json({ error: 'Incorrect password. Please try again.' });
      }

      const token = sign(user);
      return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (e) {
      console.error('Login error:', e?.code || e?.name || e, e?.message);
      return res.status(500).json({ error: 'Login failed' });
    }
  }
);

module.exports = router;
