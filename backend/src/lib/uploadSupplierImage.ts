import { randomBytes } from 'crypto'
import multer from 'multer'
import { put } from '@vercel/blob'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function hasValidImageMagicBytes(buf: Buffer): boolean {
  if (buf.length < 12) return false
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true
  // GIF87a / GIF89a: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true
  // WebP: RIFF at 0-3 and WEBP at 8-11
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true
  return false
}

export const uploadSupplierImage = multer({
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

export async function saveSupplierImage(file: Express.Multer.File): Promise<string> {
  if (!hasValidImageMagicBytes(file.buffer)) {
    throw new Error('File content does not match a supported image format.')
  }
  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg'
  const safeExt = /^(jpe?g|png|webp|gif)$/.test(ext) ? ext : 'jpg'
  const filename = `suppliers/${randomBytes(12).toString('hex')}.${safeExt}`
  const blob = await put(filename, file.buffer, { access: 'public', contentType: file.mimetype })
  return blob.url
}
