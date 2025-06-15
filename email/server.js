const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

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
  
  let contactList = [];
  
  if (contacts && contacts.length > 0) {
    contactList = contacts;
  } else if (emails) {
    contactList = emails.split('\n').filter(email => email.trim()).map((email, index) => ({
      sn: index + 1,
      firstName: '',
      lastName: '',
      email: email.trim()
    }));
  }
  
  const newList = {
    id: Date.now().toString(),
    name,
    contacts: contactList,
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

  // Handle both old format (emails array) and new format (contacts array)
  let contacts = [];
  if (list.contacts && list.contacts.length > 0) {
    contacts = list.contacts;
  } else if (list.emails && list.emails.length > 0) {
    contacts = list.emails.map(email => ({ email, firstName: '' }));
  }

  // Send response immediately and process emails in background
  res.json({ 
    message: `Started sending to ${contacts.length} contacts`,
    totalContacts: contacts.length,
    status: 'processing'
  });

  // Process emails in background
  processEmailsInBackground(contacts, subject, message, html, senderName);
});

// Background email processing function
async function processEmailsInBackground(contacts, subject, message, html, senderName) {
  const results = [];
  let successCount = 0;
  let failCount = 0;
  let duplicateCount = 0;
  
  // Remove duplicates based on email address
  const seenEmails = new Set();
  const uniqueContacts = [];
  
  for (const contact of contacts) {
    const email = contact.email.toLowerCase().trim();
    if (!seenEmails.has(email)) {
      seenEmails.add(email);
      uniqueContacts.push(contact);
    } else {
      duplicateCount++;
      console.log(`🔄 Skipped duplicate email: ${contact.email}`);
    }
  }
  
  console.log(`Starting to send ${uniqueContacts.length} emails (${duplicateCount} duplicates removed from ${contacts.length} total)...`);
  
  for (let i = 0; i < uniqueContacts.length; i++) {
    const contact = uniqueContacts[i];
    
    try {
      // Smart personalization with fallbacks
      let personalizedSubject = subject;
      let personalizedMessage = message;
      let personalizedHtml = html;
      
      // Determine what name to use
      let nameToUse = '';
      if (contact.firstName && contact.firstName.trim()) {
        nameToUse = contact.firstName.trim();
      } else if (contact.lastName && contact.lastName.trim()) {
        nameToUse = contact.lastName.trim();
      } else {
        nameToUse = 'Writer'; // Default fallback
      }
      
      // Replace {{firstName}} with the determined name
      if (nameToUse) {
        personalizedSubject = subject.replace(/\{\{firstName\}\}/g, nameToUse);
        personalizedMessage = message.replace(/\{\{firstName\}\}/g, nameToUse);
        if (html) {
          personalizedHtml = html.replace(/\{\{firstName\}\}/g, nameToUse);
        }
      }

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
      
      successCount++;
      console.log(`✅ Sent ${i + 1}/${uniqueContacts.length} to ${contact.email} (using "${nameToUse}")`);
      
      // Shorter delay for larger lists, longer for smaller lists
      const delay = uniqueContacts.length > 100 ? 1000 : 2000; // 1 second for large lists
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (error) {
      failCount++;
      console.error(`❌ Failed ${i + 1}/${uniqueContacts.length} to ${contact.email}:`, error.message);
      
      // Continue with other emails even if one fails
    }
    
    // Log progress every 50 emails
    if ((i + 1) % 50 === 0) {
      console.log(`Progress: ${i + 1}/${uniqueContacts.length} processed. ✅ ${successCount} sent, ❌ ${failCount} failed`);
    }
  }
  
  console.log(`🎉 Email sending completed! ✅ ${successCount} sent, ❌ ${failCount} failed, 🔄 ${duplicateCount} duplicates removed. Total processed: ${uniqueContacts.length} unique emails.`);
}

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
