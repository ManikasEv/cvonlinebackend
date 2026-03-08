import express from 'express';
import Stripe from 'stripe';
import sql from '../config/database.js';
import { getAuth, clerkClient } from '@clerk/express';
import { getUserByClerkId, updateUserPremium, createUser } from '../models/database.models.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Handle OPTIONS preflight for all payment routes
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'https://cvonlinestripeclerk.netlify.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.status(200).send();
});

/**
 * POST /api/payment/create-subscription
 * Create a Stripe subscription checkout session
 */
router.post('/create-subscription', async (req, res) => {
  // Ensure CORS headers are set
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'https://cvonlinestripeclerk.netlify.app');
  
  try {
    const { userId } = getAuth(req);
    
    console.log('🔍 Create subscription request received');
    console.log('👤 Clerk User ID from getAuth:', userId);
    
    if (!userId) {
      console.log('❌ No userId - Unauthorized');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    let user = await getUserByClerkId(userId);
    
    // If user doesn't exist in DB, create them with real data from Clerk
    if (!user) {
      console.log('⚠️ User not found in DB, fetching from Clerk and creating...');
      
      // Get user info from Clerk
      const clerkUser = await clerkClient.users.getUser(userId);
      console.log('📧 Clerk user email:', clerkUser.emailAddresses[0]?.emailAddress);
      
      // Create user with real Clerk data
      user = await createUser(
        userId,
        clerkUser.emailAddresses[0]?.emailAddress || 'no-email@example.com',
        clerkUser.firstName || 'User',
        clerkUser.lastName || ''
      );
      console.log('✅ User created with real email:', user.email, 'ID:', user.id);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create or get Stripe customer
    let customerId = user.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id.toString(),
          clerkUserId: user.clerk_user_id
        }
      });
      customerId = customer.id;
      
      // Update user with Stripe customer ID
      await sql`
        UPDATE users 
        SET stripe_customer_id = ${customerId}
        WHERE id = ${user.id}
      `;
    }

    // Create subscription checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'CV Creator Pro',
              description: 'Unlimited CV creation with premium templates',
            },
            unit_amount: 999, // $9.99 per month
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/pricing`,
      metadata: {
        userId: user.id.toString(),
      },
    });

    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * POST /api/payment/webhook
 * Stripe webhook to handle subscription events
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      if (session.mode === 'subscription') {
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        
        // Get user by customer ID
        const users = await sql`
          SELECT * FROM users WHERE stripe_customer_id = ${customerId}
        `;
        
        if (users.length > 0) {
          const userId = users[0].id;
          
          // Update user subscription status
          await sql`
            UPDATE users 
            SET 
              has_premium = true,
              stripe_subscription_id = ${subscriptionId},
              subscription_status = 'active',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${userId}
          `;
          
          // Record payment
          await sql`
            INSERT INTO payments (user_id, stripe_payment_id, amount, currency, status)
            VALUES (${userId}, ${session.payment_intent || subscriptionId}, 999, 'usd', 'completed')
          `;
          
          console.log('Subscription activated for user:', userId);
        }
      }
      break;

    case 'customer.subscription.updated':
      const subscription = event.data.object;
      await sql`
        UPDATE users 
        SET 
          subscription_status = ${subscription.status},
          updated_at = CURRENT_TIMESTAMP
        WHERE stripe_subscription_id = ${subscription.id}
      `;
      console.log('Subscription updated:', subscription.id);
      break;

    case 'customer.subscription.deleted':
      const deletedSub = event.data.object;
      await sql`
        UPDATE users 
        SET 
          has_premium = false,
          subscription_status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
        WHERE stripe_subscription_id = ${deletedSub.id}
      `;
      console.log('Subscription cancelled:', deletedSub.id);
      break;

    case 'invoice.payment_failed':
      const invoice = event.data.object;
      await sql`
        UPDATE users 
        SET subscription_status = 'past_due'
        WHERE stripe_customer_id = ${invoice.customer}
      `;
      console.log('Payment failed for customer:', invoice.customer);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

/**
 * GET /api/payment/subscription-status
 * Get user's subscription status
 */
router.get('/subscription-status', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByClerkId(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let subscriptionDetails = null;

    // If user has a subscription, get details from Stripe
    if (user.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        subscriptionDetails = {
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        };
      } catch (err) {
        console.error('Error fetching subscription:', err);
      }
    }

    res.status(200).json({ 
      hasPremium: user.has_premium,
      subscriptionStatus: user.subscription_status,
      subscriptionDetails,
      stripeCustomerId: user.stripe_customer_id 
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * POST /api/payment/cancel-subscription
 * Cancel user's subscription
 */
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByClerkId(userId);

    if (!user || !user.stripe_subscription_id) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Cancel at period end (so user can use until end of billing period)
    await stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    res.status(200).json({ message: 'Subscription will be cancelled at the end of the billing period' });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
