const express = require('express')
const path = require('path')
const apiRoutes = require('./app/api/route')

const app = express()
const PORT = process.env.PORT || 3300

// Database sementara menyimpan daftar email yang sudah lunas Rp 5.000
const paidEmails = new Set()

app.use(require('cors')())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 1. ENDPOINT WEBHOOK SOCIABUZZ (Menerima Notifikasi Pembayaran)
app.post('/api/webhook/sociabuzz', (req, res) => {
    try {
        const email = req.body.supporter_email || req.body.email;
        const amount = parseInt(req.body.amount || req.body.amount_raw || 0, 10);

        if (email && amount >= 5000) {
            const cleanEmail = email.toLowerCase().trim();
            paidEmails.add(cleanEmail);
            console.log(`[PEMBAYARAN SUKSES] Email: ${cleanEmail} | Nominal: Rp ${amount}`);
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error("Detail Error Webhook:", err);
        res.status(500).send('Error');
    }
});

// 2. MIDDLEWARE PENCEGAT (Memblokir Email yang Belum Bayar Rp 5.000)
app.use('/api', (req, res, next) => {
    // Lewatkan jika request berasal dari Webhook SociaBuzz
    if (req.path === '/webhook/sociabuzz') return next();

    const email = req.body?.email || req.query?.email;

    // Jika ada input email, cek apakah sudah pernah bayar
    if (email) {
        const cleanEmail = email.toLowerCase().trim();
        if (!paidEmails.has(cleanEmail)) {
            return res.status(403).json({
                success: false,
                error: true,
                message: "Email ini belum melakukan pembayaran Rp 5.000 di SociaBuzz.",
                payment_url: "https://sociabuzz.com/jawaaaaaa/tribe"
            });
        }
    }
    next();
});

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

module.exports = app;