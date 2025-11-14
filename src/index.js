require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const prisma = require('./lib/prisma');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
// File uploads: limit body size if needed (handled by multer per route)

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
const uploadRoutes = require('./routes/upload');
const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/properties');
const favouriteRoutes = require('./routes/favourites');
const chatRoutes = require('./routes/chats');
const rentalRoutes = require('./routes/rentals');
const userRoutes = require('./routes/users');

// Root route
app.get('/', (req, res) => {
  res.send('Backend running!');
});

// Health route (optional)
app.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Debug: list mounted routes
app.get('/_routes', (req, res) => {
  try {
    const paths = [];
    app._router.stack.forEach((layer) => {
      if (layer.route && layer.route.path) {
        paths.push(`${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
      } else if (layer.name === 'router' && layer.regexp) {
        const match = layer.regexp.toString().match(/^\/\^\\\/(.*?)\\\/?\(\?=\\\/$|\$\)\$\//);
        if (match && match[1]) paths.push(`MOUNT /${match[1]}`);
      }
    });
    res.json({ routes: paths });
  } catch (e) {
    res.status(500).json({ error: 'Unable to list routes' });
  }
});

app.use('/upload', uploadRoutes);
app.use('/auth', authRoutes);
app.use('/properties', propertyRoutes);
app.use('/favourites', favouriteRoutes);
app.use('/chats', chatRoutes);
app.use('/rentals', rentalRoutes);
app.use('/users', userRoutes);

// Start HTTP server and attach Socket.IO
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Socket auth middleware: expects Authorization: Bearer <token> in handshake headers
io.use((socket, next) => {
  try {
    const authHeader = socket.handshake.headers['authorization'] || socket.handshake.auth?.token;
    let token = null;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7);
    } else if (typeof authHeader === 'string') {
      token = authHeader; // allow raw token via handshake.auth.token
    }
    if (!token) return next(new Error('Unauthorized'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (e) {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user?.id;
  if (!userId) {
    socket.disconnect(true);
    return;
  }

  // Join a personal room for presence/DM if needed
  socket.join(`user:${userId}`);

  // Join a chat room
  socket.on('chat:join', async ({ chatId }) => {
    try {
      const id = Number(chatId);
      if (!id) return;
      const chat = await prisma.chat.findFirst({
        where: {
          id,
          OR: [{ userAId: userId }, { userBId: userId }],
        },
        select: { id: true },
      });
      if (!chat) return;
      socket.join(`chat:${id}`);
    } catch (e) {
      // swallow errors for now
    }
  });

  // Send a message
  socket.on('message:send', async ({ chatId, content }) => {
    try {
      const id = Number(chatId);
      if (!id || !content || typeof content !== 'string' || !content.trim()) return;
      const chat = await prisma.chat.findFirst({
        where: { id, OR: [{ userAId: userId }, { userBId: userId }] },
        select: { id: true },
      });
      if (!chat) return;
      const msg = await prisma.message.create({
        data: { chatId: id, senderId: userId, content: content.trim() },
      });
      io.to(`chat:${id}`).emit('message:new', msg);
    } catch (e) {
      // swallow
    }
  });

  // Typing indicator
  socket.on('typing', ({ chatId, isTyping }) => {
    const id = Number(chatId);
    if (!id) return;
    io.to(`chat:${id}`).emit('typing', { chatId: id, userId, isTyping: !!isTyping });
  });

  socket.on('disconnect', () => {
    // presence/offline events could be emitted here
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('HTTP server error:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// Optional: keep event loop alive briefly if something exits prematurely
// setInterval(() => {}, 1 << 30);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl, method: req.method });
});
