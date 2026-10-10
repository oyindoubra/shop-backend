const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path'); // Added path module for static file paths
const { createClient } = require('@supabase/supabase-js');
const Mailgun = require('mailgun.js');
const formData = require('form-data');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// OPTION 1: SERVE STATIC FILES & INDEX.HTML
// ==========================================
// Serve all static frontend assets (index.html, styles, scripts) from the root folder
app.use(express.static(path.join(__dirname)));

// Route root requests explicitly to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Initialize Mailgun Client
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ 
  username: 'api', 
  key: process.env.MAILGUN_API_KEY
});

// Initialize Google OAuth Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 1. Google OAuth Token Verification Route
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    res.json({ 
      success: true, 
      user: { 
        email: payload.email, 
        name: payload.name, 
        picture: payload.picture 
      } 
    });
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid Google Token' });
  }
});

// 2. Fetch Products Route
app.get('/api/products', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*');
    if (error) {
      // Fallback demo products if table is empty
      return res.json([
        { id: '1', name: 'Wireless Headphones', price: 99.99, category: 'Electronics', image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500' },
        { id: '2', name: 'Minimalist Watch', price: 149.50, category: 'Accessories', image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500' },
        { id: '3', name: 'Ergonomic Chair', price: 299.00, category: 'Home & Living', image_url: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=500' }
      ]);
    }
    res.json(data && data.length > 0 ? data : [
      { id: '1', name: 'Wireless Headphones', price: 99.99, category: 'Electronics', image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500' },
      { id: '2', name: 'Minimalist Watch', price: 149.50, category: 'Accessories', image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500' },
      { id: '3', name: 'Ergonomic Chair', price: 299.00, category: 'Home & Living', image_url: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=500' }
    ]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Checkout Route (Saves Order to Supabase & Dispatches Mailgun Email)
app.post('/api/checkout', async (req, res) => {
  const { user_email, items, total_amount, shipping_address } = req.body;

  let orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

  // Attempt Supabase DB Insert
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert([{ 
        user_email: user_email || 'guest@example.com', 
        items: items || [], 
        total_amount: total_amount || 0, 
        shipping_address: shipping_address || {} 
      }])
      .select();

    if (!error && data && data.length > 0) {
      orderId = data[0].id;
    }
  } catch (dbErr) {
    console.log('Database insert note:', dbErr.message);
  }

  // Sanitize Mailgun Domain
  const cleanDomain = (process.env.MAILGUN_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Dispatch Email via Mailgun
  let emailSent = false;
  if (cleanDomain && process.env.MAILGUN_API_KEY) {
    try {
      await mg.messages.create(cleanDomain, {
        from: `Shop Admin <postmaster@${cleanDomain}>`,
        to: [user_email],
        subject: `Order Confirmation #${orderId.toString().slice(0, 8)}`,
        text: `Thank you for your order! Total Amount: $${total_amount}. Order ID: ${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <h2 style="color: #4F46E5;">Order Confirmed!</h2>
            <p>Thank you for purchasing from our store.</p>
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Total Paid:</strong> $${total_amount}</p>
          </div>
        `
      });
      emailSent = true;
      console.log('Mailgun email sent successfully to:', user_email);
    } catch (mailErr) {
      console.error('Mailgun Dispatch Error:', mailErr.message);
    }
  }

  res.json({ success: true, orderId, emailSent });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend server running on http://localhost:${PORT}`));