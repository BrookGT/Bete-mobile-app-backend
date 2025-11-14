const express = require('express');
const upload = require('../upload');
const auth = require('../middleware/auth');

const router = express.Router();

// Single image upload: field name should be 'image'
router.post('/image', auth(), upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // multer-storage-cloudinary sets the hosted file URL on req.file.path
  return res.json({ imageUrl: req.file.path, public_id: req.file.filename });
});

module.exports = router;
