/**
 * @module uploadProductImage
 * Configures a multer middleware instance and URL helper for uploading product images to disk.
 */

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

/**
 * Multer middleware for handling single or multi-file product image uploads.
 * Accepts JPEG, PNG, WebP, and GIF files up to 5 MB; stores them under `uploads/products/` with a random hex filename.
 * @type {multer.Multer}
 */
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

/**
 * Returns the public URL path for a stored product image file.
 * @param {string} filename - The stored filename (as returned by multer, e.g. `a3f9...hex.jpg`).
 * @returns {string} The URL path string in the form `/uploads/products/<filename>`.
 */
export function productImageUrl(filename: string): string {
  return `/uploads/products/${filename}`
}
