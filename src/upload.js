const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const cloudinary = require('./config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'BeteAppImages',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
  },
});

const upload = multer({ storage });

module.exports = upload;
