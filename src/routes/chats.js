const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// Create (or fetch existing) chat between current user and otherUserId
router.post(
  '/',
  auth(),
  [body('otherUserId').isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const otherUserId = Number(req.body.otherUserId);
    const me = req.user.id;
    if (otherUserId === me) return res.status(400).json({ error: 'Cannot chat with yourself' });
    try {
      // Ensure ordering so we don't duplicate chats A/B vs B/A
      const [a, b] = me < otherUserId ? [me, otherUserId] : [otherUserId, me];
      let chat = await prisma.chat.findFirst({ where: { userAId: a, userBId: b } });
      if (!chat) {
        chat = await prisma.chat.create({ data: { userAId: a, userBId: b } });
      }
      return res.status(201).json(chat);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create chat' });
    }
  }
);

// List chats for current user
router.get('/', auth(), async (req, res) => {
  const me = req.user.id;
  try {
    const chats = await prisma.chat.findMany({
      where: { OR: [{ userAId: me }, { userBId: me }] },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(chats);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list chats' });
  }
});

// List messages in a chat (must be participant)
router.get('/:id/messages', auth(), async (req, res) => {
  const me = req.user.id;
  const chatId = Number(req.params.id);
  try {
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (chat.userAId !== me && chat.userBId !== me) return res.status(403).json({ error: 'Forbidden' });
    const msgs = await prisma.message.findMany({
      where: { chatId },
      orderBy: { sentAt: 'asc' },
    });
    return res.json(msgs);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list messages' });
  }
});

// Send a message in a chat (must be participant)
router.post(
  '/:id/messages',
  auth(),
  [body('content').isString().isLength({ min: 1 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const me = req.user.id;
    const chatId = Number(req.params.id);
    try {
      const chat = await prisma.chat.findUnique({ where: { id: chatId } });
      if (!chat) return res.status(404).json({ error: 'Chat not found' });
      if (chat.userAId !== me && chat.userBId !== me) return res.status(403).json({ error: 'Forbidden' });
      const msg = await prisma.message.create({
        data: { chatId, senderId: me, content: req.body.content },
      });
      return res.status(201).json(msg);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

module.exports = router;
