import { randomBytes } from 'crypto'
import multer from 'multer'
import { put } from '@vercel/blob'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter(_req, file, cb) {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPEG, PNG, WebP and GIF images are allowed.'))
    }
  },
})

export async function saveProductImage(file: Express.Multer.File): Promise<string> {
  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg'
  const safeExt = /^(jpe?g|png|webp|gif)$/.test(ext) ? ext : 'jpg'
  const filename = `products/${randomBytes(12).toString('hex')}.${safeExt}`
  const blob = await put(filename, file.buffer, { access: 'public', contentType: file.mimetype })
  return blob.url
}
