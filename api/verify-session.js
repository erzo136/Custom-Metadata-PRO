const Stripe = require('stripe');
const crypto = require('crypto');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
function generateToken(email, expiry) {
  const secret = process.env.TOKEN_SECRET || 'change-this-secret';
  const payload = `${email}:${expiry}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${sig}`;
}
function getExpiryMs(subscription) {
  const item = subscription.items.data[0];
  const interval = item.price.recurring?.interval;
  const count = item.price.recurring?.interval_count || 1;
  const MS = { day:86400000, week:604800000, month:2629746000, year:31556952000 };
  return Date.now() + (MS[interval] || MS.month) * count + 86400000;
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ valid: false, error: 'Missing session_id' });
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription', 'subscription.items.data.price'],
    });
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(200).json({ valid: false, error: 'Payment not completed' });
    }
    const email = session.customer_details?.email || '';
    const expiry = getExpiryMs(session.subscription);
    const token = generateToken(email, expiry);
    return res.status(200).json({ valid: true, token, expiry, email });
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
};
