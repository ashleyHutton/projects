const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  yearly: process.env.STRIPE_PRICE_YEARLY,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Debug: check env vars
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });
  }
  if (!process.env.STRIPE_PRICE_MONTHLY || !process.env.STRIPE_PRICE_YEARLY) {
    return res.status(500).json({ error: 'Missing price IDs', monthly: !!process.env.STRIPE_PRICE_MONTHLY, yearly: !!process.env.STRIPE_PRICE_YEARLY });
  }
  if (!process.env.APP_URL) {
    return res.status(500).json({ error: 'Missing APP_URL' });
  }

  try {
    const { plan } = req.body;

    if (!plan || !PRICES[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICES[plan],
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7,
      },
      success_url: `${process.env.APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}#pricing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ 
      error: 'Failed to create checkout session', 
      details: err.message,
      debug: {
        appUrl: process.env.APP_URL,
        successUrl: `${process.env.APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        priceId: PRICES[req.body?.plan]
      }
    });
  }
};
