const express = require('express')
const path = require('path')
const crypto = require('crypto')
const apiRoutes = require('./app/api/route')

const app = express()
const PORT = process.env.PORT || 3300

// Menyimpan daftar email yang sudah lunas Rp 5.000 (1x rangkaian aktivasi)
const paidEmails = new Set()
const usedPasses = new Set()
const TICKET_SECRET = process.env.WEBHOOK_SECRET || 'am-orbital-station-secret-2026'

function createPassCookie(email) {
    const expires = Date.now() + 15 * 60 * 1000 // Berlaku 15 menit saat membuka email
    const payload = `${email}|${expires}`
    const sig = crypto.createHmac('sha256', TICKET_SECRET).update(payload).digest('hex')
    const token = Buffer.from(`${payload}|${sig}`).toString('base64url')
    return `am_paid_pass=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=900`
}

function getValidPassSig(req, expectedEmail) {
    const rawCookie = req.headers.cookie || ''
    const match = rawCookie.split(';').map(c => c.trim()).find(c => c.startsWith('am_paid_pass='))
    if (!match) return null

    try {
        const token = match.split('=')[1]
        const decoded = Buffer.from(token, 'base64url').toString('utf8')
        const [email, expiresStr, sig] = decoded.split('|')
        if (!email || !expiresStr || !sig) return null
        if (email !== expectedEmail) return null
        if (Date.now() > Number(expiresStr)) return null
        if (usedPasses.has(sig)) return null

        const expectedSig = crypto.createHmac('sha256', TICKET_SECRET).update(`${email}|${expiresStr}`).digest('hex')
        if (sig !== expectedSig) return null
        return sig
    } catch {
        return null
    }
}

app.use(require('cors')())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 1. ENDPOINT WEBHOOK SAWERIA (Otomatis menerima notifikasi pembayaran)
app.post('/api/webhook/saweria', (req, res) => {
    try {
        const email = req.body.donator_email || req.body.email
        const amount = Number(req.body.amount_raw || req.body.amount || 0)

        if (email && amount >= 5000) {
            const cleanEmail = email.toLowerCase().trim()
            paidEmails.add(cleanEmail)
            console.log(`[SAWERIA LUNAS] Email: ${cleanEmail} | Nominal: Rp ${amount}`)
        } else {
            console.log(`[SAWERIA DITOLAK] Email: ${email} | Nominal kurang: Rp ${amount}`)
        }

        res.status(200).send('OK')
    } catch (err) {
        console.error('Error Webhook Saweria:', err)
        res.status(500).send('Error')
    }
})

app.use((req, res, next) => {
    req.paidEmails = paidEmails
    next()
})

// 2. PENJAGA PEMBAYARAN 1X PENUH (Kirim Link -> Verifikasi Link -> Hangus Setelah Token Keluar)
app.use('/api', (req, res, next) => {
    if (req.path === '/webhook/saweria') return next()

    const email = req.body?.email || req.query?.email
    if (!email) return next()

    const cleanEmail = email.toLowerCase().trim()
    const hasPaidInMemory = paidEmails.has(cleanEmail)
    const validPassSig = getValidPassSig(req, cleanEmail)

    if (!hasPaidInMemory && !validPassSig) {
        return res.status(403).json({
            success: false,
            error: true,
            message: 'Email ini belum melakukan pembayaran Rp 5.000 di Saweria.'
        })
    }

    const originalJson = res.json
    res.json = function (data) {
        if (data && data.success) {
            if (req.path === '/send-link') {
                // Tahap 1 berhasil: JANGAN hapus hak bayar dulu, beri tiket sesi untuk tahap Proses Tautan
                res.setHeader('Set-Cookie', createPassCookie(cleanEmail))
                console.log(`[KIRIM LINK] Hak aktivasi ${cleanEmail} disimpan untuk tahap verifikasi tautan.`)
            } else if (req.path === '/verify-link') {
                // Tahap 2 berhasil (token keluar): Hapus hak bayar agar 1x bayar = 1x token
                paidEmails.delete(cleanEmail)
                if (validPassSig) usedPasses.add(validPassSig)
                res.setHeader('Set-Cookie', 'am_paid_pass=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0')
                console.log(`[TOKEN SELESAI] Hak aktivasi ${cleanEmail} telah dipakai dan ditutup.`)
            }
        }
        return originalJson.call(this, data)
    }

    next()
})

app.use(express.static(path.join(__dirname, 'public'), {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate')
        }
    }
}))

app.use('/api', apiRoutes)

app.listen(PORT, () => {
    console.log(`server jalan di http://localhost:${PORT}`)
})

module.exports = app