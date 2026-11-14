const express = require('express')
const path = require('path')
const apiRoutes = require('./app/api/route')

const app = express()
const PORT = process.env.PORT || 3300

// Menyimpan daftar email yang sudah lunas Rp 5.000
const paidEmails = new Set()

app.use(require('cors')())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 1. ENDPOINT WEBHOOK SAWERIA (Menerima notifikasi pembayaran otomatis)
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

// 2. PENYELARAS LINK & PENJAGA PEMBAYARAN KHUSUS TAHAP VERIFIKASI (/verify-link)
app.use('/api', (req, res, next) => {
    if (req.path === '/webhook/saweria') return next()

    // Salin req.body.link ke semua nama field yang mungkin dibaca app/api/route.js
    if (req.body && req.body.link) {
        const rawLink = String(req.body.link).trim()
        req.body.link = rawLink
        req.body.url = req.body.url || rawLink
        req.body.emailLink = req.body.emailLink || rawLink
        req.body.oobLink = req.body.oobLink || rawLink
        req.body.magicLink = req.body.magicLink || rawLink
        req.body.activationLink = req.body.activationLink || rawLink
        req.body.verifyLink = req.body.verifyLink || rawLink
        req.body.authLink = req.body.authLink || rawLink
        req.body.signInLink = req.body.signInLink || rawLink
    }

    // Tahap 1 (/send-link): Gratis tanpa cek pembayaran
    if (req.path !== '/verify-link') {
        return next()
    }

    // Tahap 2 (/verify-link): Wajib sudah bayar Rp 5.000
    const email = req.body?.email || req.query?.email
    if (!email) {
        return res.status(400).json({
            success: false,
            error: true,
            message: 'Alamat email tidak ditemukan. Ulangi dari langkah awal.'
        })
    }

    const cleanEmail = email.toLowerCase().trim()
    if (!paidEmails.has(cleanEmail)) {
        return res.status(403).json({
            success: false,
            error: true,
            message: 'Selesaikan pembayaran Rp 5.000 di Saweria untuk memproses tautan ini.'
        })
    }

    // Hapus hak bayar setelah token berhasil dibuat (1x bayar = 1x token)
    const originalJson = res.json
    res.json = function (data) {
        if (data && data.success) {
            paidEmails.delete(cleanEmail)
            console.log(`[TOKEN SELESAI] Hak aktivasi ${cleanEmail} telah dipakai dan ditutup.`)
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