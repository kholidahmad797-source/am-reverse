const express = require('express')
const path = require('path')
const apiRoutes = require('./app/api/route')

const app = express()
const PORT = process.env.PORT || 3300

// Database sementara di memori server untuk menyimpan email lunas 5K
const paidEmails = new Set()

app.use(require('cors')())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 1. ENDPOINT WEBHOOK SOCIABUZZ (Menerima Notifikasi Pembayaran Otomatis)
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

// Oper database paidEmails ke rute API utama
app.use((req, res, next) => {
    req.paidEmails = paidEmails;
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