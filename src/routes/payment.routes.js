import express from 'express';
import Stripe from 'stripe';
import sql from '../config/database.js';
import { getAuth, clerkClient } from '@clerk/express';
import { getUserByClerkId, updateUserPremium, createUser } from '../models/database.models.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/payment/create-subscription
 * Create a Stripe subscription checkout session
 */
router.post('/create-subscription', async (req, res) => {
  console.log('\n========================================');
  console.log('💳 [SUBSCRIPTION] Create subscription request received');
  console.log('========================================');
  
  try {
    const { userId } = getAuth(req);
    
    console.log('📋 [SUBSCRIPTION] Clerk User ID from getAuth:', userId || 'NONE');
    console.log('🌐 [SUBSCRIPTION] Request origin:', req.headers.origin);
    
    if (!userId) {
      console.log('❌ [SUBSCRIPTION] No userId - Unauthorized');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('🔍 [SUBSCRIPTION] Checking if user exists in database...');
    let user = await getUserByClerkId(userId);
    
    // If user doesn't exist in DB, create them with real data from Clerk
    if (!user) {
      console.log('⚠️ [SUBSCRIPTION] User not found in DB, fetching from Clerk...');
      
      // Get user info from Clerk
      const clerkUser = await clerkClient.users.getUser(userId);
      const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress;
      
      console.log('📧 [SUBSCRIPTION] Clerk user data:', {
        email: clerkEmail,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName
      });
      
      // Create user with real Clerk data
      console.log('💾 [SUBSCRIPTION] Creating user in database...');
      user = await createUser(
        userId,
        clerkEmail || 'no-email@example.com',
        clerkUser.firstName || 'User',
        clerkUser.lastName || ''
      );
      console.log('✅ [SUBSCRIPTION] User created successfully:', {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      });
    } else {
      console.log('✅ [SUBSCRIPTION] User found in database:', {
        id: user.id,
        email: user.email,
        has_premium: user.has_premium
      });
    }

    if (!user) {
      console.log('❌ [SUBSCRIPTION] User creation failed');
      return res.status(404).json({ error: 'User not found' });
    }

    // Create or get Stripe customer
    let customerId = user.stripe_customer_id;
    
    if (!customerId) {
      console.log('💳 [SUBSCRIPTION] No Stripe customer ID - creating new customer...');
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id.toString(),
          clerkUserId: user.clerk_user_id
        }
      });
      customerId = customer.id;
      console.log('✅ [SUBSCRIPTION] Stripe customer created:', customerId);
      
      // Update user with Stripe customer ID
      console.log('💾 [SUBSCRIPTION] Saving Stripe customer ID to database...');
      await sql`
        UPDATE users 
        SET stripe_customer_id = ${customerId}
        WHERE id = ${user.id}
      `;
      console.log('✅ [SUBSCRIPTION] Stripe customer ID saved');
    } else {
      console.log('✅ [SUBSCRIPTION] Using existing Stripe customer:', customerId);
    }

    // Create subscription checkout session
    console.log('🛒 [SUBSCRIPTION] Creating Stripe checkout session...');
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

    console.log('✅ [SUBSCRIPTION] Checkout session created successfully');
    console.log('📊 [SUBSCRIPTION] Session details:', {
      sessionId: session.id,
      customerId: session.customer,
      url: session.url
    });
    console.log('========================================\n');

    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('❌ [SUBSCRIPTION] Error creating subscription:', error.message);
    console.error('❌ [SUBSCRIPTION] Error stack:', error.stack);
    console.log('========================================\n');
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * POST /api/payment/webhook
 * Stripe webhook to handle subscription events
 */
router.post('/webhook', async (req, res) => {
  console.log('\n========================================');
  console.log('🪝 [WEBHOOK] Stripe webhook received');
  console.log('========================================');
  
  const sig = req.headers['stripe-signature'];
  console.log('📋 [WEBHOOK] Signature present:', sig ? 'YES' : 'NO');

  let event;

  try {
    console.log('🔐 [WEBHOOK] Verifying webhook signature...');
    console.log('🔑 [WEBHOOK] Webhook secret configured:', process.env.STRIPE_WEBHOOK_SECRET ? 'YES (starts with ' + process.env.STRIPE_WEBHOOK_SECRET.substring(0, 10) + '...)' : 'NO - MISSING!');
    
    // For raw body parser, req.body will be a Buffer
    const body = req.body;
    console.log('📊 [WEBHOOK] Body received:', !!body, '- Type:', typeof body, '- Is Buffer:', Buffer.isBuffer(body));
    
    if (!body) {
      throw new Error('No body available for webhook verification');
    }
    
    // Stripe's constructEvent accepts Buffer directly
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log('✅ [WEBHOOK] Signature verified successfully');
    console.log('📊 [WEBHOOK] Event type:', event.type);
  } catch (err) {
    console.error('❌ [WEBHOOK] Signature verification failed:', err.message);
    console.log('========================================\n');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  console.log('🔄 [WEBHOOK] Processing event:', event.type);
  
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        console.log('💰 [WEBHOOK] Checkout session completed');
        const session = event.data.object;
        
        console.log('📊 [WEBHOOK] Session data:', {
          mode: session.mode,
          customer: session.customer,
          subscription: session.subscription,
          payment_intent: session.payment_intent
        });
        
        if (session.mode === 'subscription') {
          const customerId = session.customer;
          const subscriptionId = session.subscription;
          
          console.log('🔍 [WEBHOOK] Looking up user by Stripe customer ID:', customerId);
          
          // Get user by customer ID
          const users = await sql`
            SELECT * FROM users WHERE stripe_customer_id = ${customerId}
          `;
          
          if (users.length > 0) {
            const userId = users[0].id;
            console.log('✅ [WEBHOOK] User found:', {
              userId,
              email: users[0].email
            });
            
            console.log('💾 [WEBHOOK] Updating user subscription status...');
            
            // Update user subscription status
            const updateResult = await sql`
              UPDATE users 
              SET 
                has_premium = true,
                stripe_subscription_id = ${subscriptionId},
                subscription_status = 'active',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ${userId}
              RETURNING *
            `;
            
            console.log('✅ [WEBHOOK] User subscription status updated');
            console.log('📊 [WEBHOOK] Updated user data:', {
              id: updateResult[0]?.id,
              has_premium: updateResult[0]?.has_premium,
              subscription_status: updateResult[0]?.subscription_status
            });
            
            // Record payment
            console.log('💾 [WEBHOOK] Recording payment in database...');
            try {
              await sql`
                INSERT INTO payments (user_id, stripe_payment_id, amount, currency, status)
                VALUES (${userId}, ${session.payment_intent || subscriptionId}, 999, 'usd', 'completed')
              `;
              console.log('✅ [WEBHOOK] Payment recorded');
            } catch (paymentError) {
              // If payment already exists (duplicate), just log it and continue
              if (paymentError.code === '23505') {
                console.log('⚠️ [WEBHOOK] Payment already recorded (duplicate), continuing...');
              } else {
                throw paymentError;
              }
            }
            
            console.log('🎉 [WEBHOOK] Subscription activated for user:', userId);
          } else {
            console.log('⚠️ [WEBHOOK] No user found with Stripe customer ID:', customerId);
            console.log('⚠️ [WEBHOOK] This might be because the user checkout was created but user not yet in DB');
          }
        }
        break;

      case 'customer.subscription.updated':
        console.log('🔄 [WEBHOOK] Subscription updated');
        const subscription = event.data.object;
        
        console.log('📊 [WEBHOOK] Subscription data:', {
          id: subscription.id,
          status: subscription.status
        });
        
        await sql`
          UPDATE users 
          SET 
            subscription_status = ${subscription.status},
            updated_at = CURRENT_TIMESTAMP
          WHERE stripe_subscription_id = ${subscription.id}
        `;
        console.log('✅ [WEBHOOK] Subscription status updated:', subscription.id);
        break;

      case 'customer.subscription.deleted':
        console.log('❌ [WEBHOOK] Subscription deleted/cancelled');
        const deletedSub = event.data.object;
        
        console.log('📊 [WEBHOOK] Cancelled subscription:', deletedSub.id);
        
        await sql`
          UPDATE users 
          SET 
            has_premium = false,
            subscription_status = 'cancelled',
            updated_at = CURRENT_TIMESTAMP
          WHERE stripe_subscription_id = ${deletedSub.id}
        `;
        console.log('✅ [WEBHOOK] User premium status revoked');
        break;

      case 'invoice.payment_failed':
        console.log('⚠️ [WEBHOOK] Payment failed');
        const invoice = event.data.object;
        
        console.log('📊 [WEBHOOK] Failed payment for customer:', invoice.customer);
        
        await sql`
          UPDATE users 
          SET subscription_status = 'past_due'
          WHERE stripe_customer_id = ${invoice.customer}
        `;
        console.log('✅ [WEBHOOK] User status updated to past_due');
        break;

      default:
        console.log(`ℹ️ [WEBHOOK] Unhandled event type: ${event.type}`);
    }

    console.log('========================================\n');
    res.json({ received: true });
  } catch (error) {
    console.error('❌ [WEBHOOK] Error processing webhook event:', error.message);
    console.error('❌ [WEBHOOK] Error code:', error.code);
    console.error('❌ [WEBHOOK] Error detail:', error.detail);
    console.error('❌ [WEBHOOK] Full error:', error);
    console.log('========================================\n');
    
    // Still return 200 to Stripe so it doesn't retry
    // But log the error so we can debug
    res.status(500).json({ 
      error: 'Webhook processing failed', 
      message: error.message 
    });
  }
});

/**
 * GET /api/payment/subscription-status
 * Get user's subscription status
 */
router.get('/subscription-status', async (req, res) => {
  console.log('\n========================================');
  console.log('📊 [SUBSCRIPTION STATUS] Request received');
  console.log('========================================');
  
  try {
    const { userId } = getAuth(req);
    console.log('📋 [SUBSCRIPTION STATUS] Clerk User ID:', userId || 'NONE');
    
    if (!userId) {
      console.log('❌ [SUBSCRIPTION STATUS] No userId - Unauthorized');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('🔍 [SUBSCRIPTION STATUS] Looking up user in database...');
    const user = await getUserByClerkId(userId);

    if (!user) {
      console.log('❌ [SUBSCRIPTION STATUS] User not found in database');
      console.log('========================================\n');
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ [SUBSCRIPTION STATUS] User found:', {
      id: user.id,
      email: user.email,
      has_premium: user.has_premium,
      subscription_status: user.subscription_status
    });

    let subscriptionDetails = null;

    // If user has a subscription, get details from Stripe
    if (user.stripe_subscription_id) {
      console.log('🔍 [SUBSCRIPTION STATUS] Fetching subscription details from Stripe...');
      console.log('📋 [SUBSCRIPTION STATUS] Subscription ID:', user.stripe_subscription_id);
      
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        subscriptionDetails = {
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        };
        console.log('✅ [SUBSCRIPTION STATUS] Stripe subscription details:', subscriptionDetails);
      } catch (err) {
        console.error('❌ [SUBSCRIPTION STATUS] Error fetching Stripe subscription:', err.message);
      }
    } else {
      console.log('ℹ️ [SUBSCRIPTION STATUS] User has no active subscription');
    }

    const response = { 
      hasPremium: user.has_premium,
      subscriptionStatus: user.subscription_status,
      subscriptionDetails,
      stripeCustomerId: user.stripe_customer_id 
    };
    
    console.log('📤 [SUBSCRIPTION STATUS] Sending response:', response);
    console.log('========================================\n');

    res.status(200).json(response);
  } catch (error) {
    console.error('❌ [SUBSCRIPTION STATUS] Error:', error.message);
    console.error('❌ [SUBSCRIPTION STATUS] Stack:', error.stack);
    console.log('========================================\n');
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * GET /api/payment/debug-tables
 * Debug endpoint to check table structure (REMOVE IN PRODUCTION!)
 */
router.get('/debug-tables', async (req, res) => {
  try {
    // Check users table structure
    const usersColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;
    
    // Check payments table structure
    const paymentsColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'payments'
      ORDER BY ordinal_position
    `;
    
    // Get sample user data
    const sampleUsers = await sql`
      SELECT id, clerk_user_id, email, has_premium, stripe_customer_id, stripe_subscription_id, subscription_status
      FROM users
      LIMIT 5
    `;
    
    res.json({
      usersTableColumns: usersColumns,
      paymentsTableColumns: paymentsColumns,
      sampleUsers: sampleUsers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
