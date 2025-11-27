const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// Create (or fetch existing) chat between current user and otherUserId
// Now also accepts optional propertyId to link chat to a specific property
router.post(
  '/',
  auth(),
  [body('otherUserId').isInt({ gt: 0 }), body('propertyId').optional().isInt({ gt: 0 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const otherUserId = Number(req.body.otherUserId);
    const propertyId = req.body.propertyId ? Number(req.body.propertyId) : null;
    const me = req.user.id;
    if (otherUserId === me) return res.status(400).json({ error: 'Cannot chat with yourself' });
    try {
      // Ensure ordering so we don't duplicate chats A/B vs B/A
      const [a, b] = me < otherUserId ? [me, otherUserId] : [otherUserId, me];
      
      // Find existing chat - now also consider propertyId if provided
      let chat;
      if (propertyId) {
        // Look for chat with same users AND same property
        chat = await prisma.chat.findFirst({ 
          where: { userAId: a, userBId: b, propertyId } 
        });
      } else {
        // Legacy: find any chat between these users
        chat = await prisma.chat.findFirst({ where: { userAId: a, userBId: b } });
      }
      
      if (!chat) {
        chat = await prisma.chat.create({ 
          data: { userAId: a, userBId: b, propertyId } 
        });
      }
      return res.status(201).json(chat);
    } catch (e) {
      console.error('create chat error', e);
      return res.status(500).json({ error: 'Failed to create chat' });
    }
  }
);

// List chats for current user (includes other user's info and property info)
router.get('/', auth(), async (req, res) => {
  const me = req.user.id;
  try {
    const chats = await prisma.chat.findMany({
      where: { OR: [{ userAId: me }, { userBId: me }] },
      orderBy: { createdAt: 'desc' },
      include: {
        userA: { select: { id: true, name: true, avatarUrl: true } },
        userB: { select: { id: true, name: true, avatarUrl: true } },
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
        property: { select: { id: true, title: true, imageUrl: true, price: true } },
      },
    });
    // Map to include the "other" user info, property info, and last message preview
    const result = chats.map((c) => {
      const other = c.userAId === me ? c.userB : c.userA;
      const lastMsg = c.messages?.[0];
      return {
        id: c.id,
        otherUserId: other?.id,
        otherUserName: other?.name || 'User',
        otherUserAvatar: other?.avatarUrl || null,
        lastMessage: lastMsg?.content || '',
        lastMessageAt: lastMsg?.sentAt || c.createdAt,
        createdAt: c.createdAt,
        // Property info
        propertyId: c.property?.id || null,
        propertyTitle: c.property?.title || null,
        propertyImage: c.property?.imageUrl || null,
        propertyPrice: c.property?.price || null,
      };
    });
    return res.json(result);
  } catch (e) {
    console.error('list chats error', e);
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
