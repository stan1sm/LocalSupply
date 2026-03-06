import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import multer from 'multer'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'products')
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdir(UPLOAD_DIR, { recursive: true }, (err: Error | null) => {
      cb(err, UPLOAD_DIR)
    })
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg'
    const safeExt = /^\.(jpe?g|png|webp|gif)$/i.test(ext) ? ext : '.jpg'
    const name = randomBytes(12).toString('hex') + safeExt
    cb(null, name)
  },
})

export const uploadProductImage = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter(_req, file, cb) {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPEG, PNG, WebP and GIF images are allowed.'))
    }
  },
})

export function productImageUrl(filename: string): string {
  return `/uploads/products/${filename}`
}
