const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Email configuration - using SMTP with your domain
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST, // Your domain's SMTP server
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER, // hey@enchantgifts.store
    pass: process.env.SMTP_PASS  // Your email password or app password
  },
  // Remove tracking headers and keep it clean
  headers: {
    'X-Priority': '3',
    'X-MSMail-Priority': 'Normal',
    'Importance': 'Normal'
  }
});

// Store email lists in memory (in production, use a database)
let emailLists = [];
let emailTemplates = [];

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all email lists
app.get('/api/lists', (req, res) => {
  res.json(emailLists);
});

// Create new email list
app.post('/api/lists', (req, res) => {
  const { name, contacts, emails } = req.body;
  const newList = {
    id: Date.now().toString(),
    name,
    contacts: contacts || emails?.split('\n').filter(email => email.trim()).map((email, index) => ({
      sn: index + 1,
      firstName: '',
      lastName: '',
      email: email.trim()
    })) || [],
    createdAt: new Date()
  };
  emailLists.push(newList);
  res.json(newList);
});

// Delete email list
app.delete('/api/lists/:id', (req, res) => {
  emailLists = emailLists.filter(list => list.id !== req.params.id);
  res.json({ success: true });
});

// Send email to list
app.post('/api/send', async (req, res) => {
  const { listId, subject, message, html, senderName } = req.body;
  
  const list = emailLists.find(l => l.id === listId);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }

  const results = [];
  const contacts = list.contacts || list.emails?.map(email => ({ email, firstName: '' })) || [];
  
  for (const contact of contacts) {
    try {
      // Personalize the message for each contact
      const personalizedSubject = contact.firstName ? 
        subject.replace(/\{\{firstName\}\}/g, contact.firstName) : subject;
      
      const personalizedMessage = contact.firstName ? 
        message.replace(/\{\{firstName\}\}/g, contact.firstName) : message;
      
      const personalizedHtml = html && contact.firstName ? 
        html.replace(/\{\{firstName\}\}/g, contact.firstName) : html;

      const mailOptions = {
        from: `${senderName} <hey@enchantgifts.store>`,
        to: contact.email,
        subject: personalizedSubject,
        text: personalizedMessage,
        headers: {
          'List-Unsubscribe': null,
          'X-Mailer': null,
          'X-Campaign': null,
          'Precedence': null
        }
      };

      // Add HTML version if rich text was used
      if (personalizedHtml && personalizedHtml !== personalizedMessage) {
        mailOptions.html = personalizedHtml;
      }

      await transporter.sendMail(mailOptions);
      
      results.push({ 
        email: contact.email, 
        firstName: contact.firstName,
        status: 'sent' 
      });
      
      // Add delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`Failed to send to ${contact.email}:`, error);
      results.push({ 
        email: contact.email, 
        firstName: contact.firstName,
        status: 'failed', 
        error: error.message 
      });
    }
  }
  
  res.json({ results });
});

// Test email configuration
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
