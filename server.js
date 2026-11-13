const express = require('express')
const path = require('path')
const apiRoutes = require('./app/api/route')

const app = express()
const PORT = process.env.PORT || 3300

// Menyimpan daftar email yang sudah lunas Rp 5.000 (1x pakai)
const paidEmails = new Set()

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

// 2. MIDDLEWARE PENCEGAT (Memblokir email yang belum bayar Rp 5.000)
app.use('/api', (req, res, next) => {
    if (req.path === '/webhook/saweria') return next()

    const email = req.body?.email || req.query?.email
    if (email) {
        const cleanEmail = email.toLowerCase().trim()
        if (!paidEmails.has(cleanEmail)) {
            return res.status(403).json({
                success: false,
                error: true,
                message: 'Email ini belum melakukan pembayaran Rp 5.000 di Saweria.'
            })
        }
    }
    next()
})

// 3. HAPUS HAK AKTIVASI SETELAH DIPAKAI (1x bayar = 1x aktivasi)
app.use('/api', (req, res, next) => {
    if (req.path === '/webhook/saweria') return next()

    const originalJson = res.json
    res.json = function (data) {
        const email = req.body?.email || req.query?.email
        if (email && data && data.success) {
            const cleanEmail = email.toLowerCase().trim()
            paidEmails.delete(cleanEmail)
            console.log(`[PAKAI TOKEN] Hak aktivasi ${cleanEmail} telah digunakan dan dihapus.`)
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