const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Disable body parsing, we need the raw body for webhook verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Map Stripe subscription status to our internal status
 */
function mapSubscriptionStatus(stripeStatus) {
  const statusMap = {
    active: 'active',
    past_due: 'past_due',
    unpaid: 'unpaid',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'expired',
    trialing: 'trialing',  // Keep as 'trialing' to match dashboard/cron checks
    paused: 'paused',
  };
  return statusMap[stripeStatus] || stripeStatus;
}

/**
 * Find user by Stripe customer ID
 */
async function findUserByStripeCustomer(customerId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error finding user by Stripe customer:', error);
  }
  return data;
}

/**
 * Find user by email
 */
async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error finding user by email:', error);
  }
  return data;
}

/**
 * Update user's subscription status
 */
async function updateUserSubscription(userId, updates) {
  const { error } = await supabase
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating user subscription:', error);
    throw error;
  }
}

/**
 * Handle checkout.session.completed
 * Link Stripe customer to user account
 */
async function handleCheckoutCompleted(session) {
  const customerEmail = session.customer_email || session.customer_details?.email;
  const customerId = session.customer;

  if (!customerEmail) {
    console.error('No email found in checkout session');
    return;
  }

  console.log('Checkout completed for:', customerEmail);

  // Find existing user by email
  let user = await findUserByEmail(customerEmail);

  if (user) {
    // Update existing user with Stripe customer ID
    await updateUserSubscription(user.id, {
      stripe_customer_id: customerId,
      subscription_status: 'active', // They just subscribed!
    });
    console.log('Updated existing user with Stripe customer ID:', user.id);
  } else {
    // Create new user (they subscribed without signing up first)
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: customerEmail,
        stripe_customer_id: customerId,
        subscription_status: 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating user:', error);
      throw error;
    }
    console.log('Created new user from checkout:', data.id);
  }
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;
  const status = mapSubscriptionStatus(subscription.status);

  console.log('Subscription update:', customerId, status);

  const user = await findUserByStripeCustomer(customerId);
  if (!user) {
    console.error('No user found for Stripe customer:', customerId);
    return;
  }

  await updateUserSubscription(user.id, {
    subscription_status: status,
  });
  console.log('Updated subscription status for user:', user.id, status);
}

/**
 * Handle subscription deleted (canceled)
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;

  console.log('Subscription deleted for customer:', customerId);

  const user = await findUserByStripeCustomer(customerId);
  if (!user) {
    console.error('No user found for Stripe customer:', customerId);
    return;
  }

  await updateUserSubscription(user.id, {
    subscription_status: 'canceled',
  });
  console.log('Marked user as canceled:', user.id);
}

/**
 * Handle invoice payment failed
 */
async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;

  console.log('Payment failed for customer:', customerId);

  const user = await findUserByStripeCustomer(customerId);
  if (!user) {
    console.error('No user found for Stripe customer:', customerId);
    return;
  }

  // Don't immediately cancel - Stripe will retry
  // Just log for now, subscription.updated will handle status change
  console.log('Payment failed for user:', user.id);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Received Stripe event:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error handling webhook event:', err);
    // Still return 200 to acknowledge receipt
    // Stripe will retry on 5xx errors
  }

  res.json({ received: true });
};
