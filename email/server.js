const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  requireTLS: true,
  tls: {
    rejectUnauthorized: false
  },
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  headers: {
    'X-Priority': '3',
    'X-MSMail-Priority': 'Normal',
    'Importance': 'Normal'
  }
});

let emailLists = [];

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/lists', (req, res) => {
  res.json(emailLists);
});

app.post('/api/lists', (req, res) => {
  const { name, emails } = req.body;
  const newList = {
    id: Date.now().toString(),
    name,
    emails: emails.split('\n').filter(email => email.trim()),
    createdAt: new Date()
  };
  emailLists.push(newList);
  res.json(newList);
});

app.delete('/api/lists/:id', (req, res) => {
  emailLists = emailLists.filter(list => list.id !== req.params.id);
  res.json({ success: true });
});

app.post('/api/send', async (req, res) => {
  const { listId, subject, message, senderName } = req.body;
  
  const list = emailLists.find(l => l.id === listId);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }

  const results = [];
  
  for (const email of list.emails) {
    try {
      await transporter.sendMail({
        from: `${senderName} <hey@enchantgifts.store>`,
        to: email,
        subject: subject,
        text: message,
        headers: {
          'List-Unsubscribe': null,
          'X-Mailer': null,
          'X-Campaign': null,
          'Precedence': null
        }
      });
      
      results.push({ email, status: 'sent' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`Failed to send to ${email}:`, error);
      results.push({ email, status: 'failed', error: error.message });
    }
  }
  
  res.json({ results });
});

app.post('/api/test', async (req, res) => {
  try {
    await transporter.verify();
    res.json({ success: true, message: 'SMTP configuration is valid' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
