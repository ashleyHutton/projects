const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../../lib/auth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  yearly: process.env.STRIPE_PRICE_YEARLY,
};

module.exports = async (req, res) => {
  // Handle portal redirect (GET request)
  if (req.method === 'GET' && req.query.action === 'portal') {
    return handlePortal(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body;

  if (action === 'portal') {
    return handlePortalPost(req, res);
  }

  // Default: create-checkout
  return handleCheckout(req, res);
};

async function handleCheckout(req, res) {
  try {
    const auth = await requireAuth(req);
    
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated. Please log in first.' });
    }

    const { plan } = req.body;

    if (!plan || !PRICES[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: user } = await supabase
      .from('users')
      .select('id, email, stripe_customer_id')
      .eq('id', auth.userId)
      .single();

    // Build checkout session options
    const sessionOptions = {
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
        metadata: {
          user_id: user.id,
        },
      },
      metadata: {
        user_id: user.id,
      },
      success_url: `${process.env.APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}#pricing`,
    };

    // If user already has a Stripe customer, use it
    if (user.stripe_customer_id) {
      sessionOptions.customer = user.stripe_customer_id;
    } else {
      // Pre-fill email for new customers
      sessionOptions.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

async function handlePortal(req, res) {
  try {
    const auth = await requireAuth(req);
    
    if (!auth) {
      return res.redirect('/daily-digest/login');
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data: user, error } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', auth.userId)
      .single();

    if (error || !user?.stripe_customer_id) {
      return res.redirect('/daily-digest/#pricing');
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.APP_URL}/dashboard`,
    });

    res.redirect(portalSession.url);
  } catch (err) {
    console.error('Stripe portal error:', err);
    res.redirect('/daily-digest/dashboard?error=billing_failed');
  }
}

async function handlePortalPost(req, res) {
  try {
    const auth = await requireAuth(req);
    
    if (!auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data: user, error } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', auth.userId)
      .single();

    if (error || !user?.stripe_customer_id) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.APP_URL}/dashboard`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    console.error('Stripe portal error:', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
}
