import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// GrooveSell webhook payload interface
interface GrooveSellWebhook {
  event_type: string
  order_id: string
  customer_email: string
  product_id: string
  product_name: string
  amount: number
  currency: string
  status: 'completed' | 'refunded' | 'cancelled'
  subscription_type?: 'monthly' | 'yearly'
  created_at: string
}

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${expectedSignature}`),
    Buffer.from(signature)
  )
}

function getCreditsForPurchase(): number {
  // Both plans get 5 credits per month
  // Monthly: 5 credits
  // Yearly: 5 credits (monthly renewal will add more)
  return parseInt(process.env.NEXT_PUBLIC_CREDITS_PER_MONTH || '5')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-groovesell-signature')
    
    // Verify webhook signature
    const webhookSecret = process.env.GROOVESELL_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('GROOVESELL_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    if (!signature) {
      console.error('Missing webhook signature')
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    if (!verifyWebhookSignature(body, signature, webhookSecret)) {
      console.error('Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const webhookData: GrooveSellWebhook = JSON.parse(body)
    console.log('GrooveSell webhook received:', webhookData)

    const supabase = await createClient()

    // Handle different event types
    switch (webhookData.event_type) {
      case 'purchase.completed':
      case 'subscription.created':
        await handlePurchaseCompleted(supabase, webhookData)
        break
      
      case 'subscription.renewed':
        await handleSubscriptionRenewed(supabase, webhookData)
        break
      
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(supabase, webhookData)
        break
      
      case 'refund.processed':
        await handleRefund(supabase, webhookData)
        break
      
      default:
        console.log(`Unhandled event type: ${webhookData.event_type}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handlePurchaseCompleted(supabase: Awaited<ReturnType<typeof createClient>>, data: GrooveSellWebhook) {
  try {
    // Find user by email
    const { data: users, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('email', data.customer_email)
      .single()

    if (userError || !users) {
      console.error('User not found for email:', data.customer_email)
      return
    }

    const userId = users.id
    const creditsToAdd = getCreditsForPurchase()

    // Add credits to user account
    const { error: addCreditsError } = await supabase
      .rpc('add_credits', { 
        user_uuid: userId, 
        credits_to_add: creditsToAdd 
      })

    if (addCreditsError) {
      console.error('Error adding credits:', addCreditsError)
      return
    }

    // Update subscription status
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        subscription_status: 'active',
        subscription_type: data.subscription_type || 'monthly',
        groovesell_customer_id: data.order_id
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Error updating subscription status:', updateError)
      return
    }

    // Record transaction
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        groovesell_order_id: data.order_id,
        transaction_type: 'purchase',
        credits_added: creditsToAdd,
        amount: data.amount,
        currency: data.currency,
        subscription_type: data.subscription_type || 'monthly',
        status: 'completed'
      })

    if (transactionError) {
      console.error('Error recording transaction:', transactionError)
    }

    console.log(`Successfully processed purchase for ${data.customer_email}: +${creditsToAdd} credits`)
  } catch (error) {
    console.error('Error in handlePurchaseCompleted:', error)
  }
}

async function handleSubscriptionRenewed(supabase: Awaited<ReturnType<typeof createClient>>, data: GrooveSellWebhook) {
  try {
    // Find user by email
    const { data: users, error: userError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', data.customer_email)
      .single()

    if (userError || !users) {
      console.error('User not found for renewal:', data.customer_email)
      return
    }

    const userId = users.id
    const creditsToAdd = getCreditsForPurchase()

    // Add monthly credits
    await supabase.rpc('add_credits', { 
      user_uuid: userId, 
      credits_to_add: creditsToAdd 
    })

    // Record transaction
    await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        groovesell_order_id: data.order_id,
        transaction_type: 'purchase',
        credits_added: creditsToAdd,
        amount: data.amount,
        currency: data.currency,
        subscription_type: data.subscription_type || 'monthly',
        status: 'completed'
      })

    console.log(`Subscription renewed for ${data.customer_email}: +${creditsToAdd} credits`)
  } catch (error) {
    console.error('Error in handleSubscriptionRenewed:', error)
  }
}

async function handleSubscriptionCancelled(supabase: Awaited<ReturnType<typeof createClient>>, data: GrooveSellWebhook) {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ subscription_status: 'cancelled' })
      .eq('email', data.customer_email)

    if (error) {
      console.error('Error updating cancelled subscription:', error)
    } else {
      console.log(`Subscription cancelled for ${data.customer_email}`)
    }
  } catch (error) {
    console.error('Error in handleSubscriptionCancelled:', error)
  }
}

async function handleRefund(supabase: Awaited<ReturnType<typeof createClient>>, data: GrooveSellWebhook) {
  try {
    // Find the original transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('user_id, credits_added')
      .eq('groovesell_order_id', data.order_id)
      .single()

    if (transactionError || !transaction) {
      console.error('Original transaction not found for refund:', data.order_id)
      return
    }

    // Remove credits (but don't go below 0)
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('total_credits, used_credits')
      .eq('id', transaction.user_id)
      .single()

    if (userProfile) {
      const creditsToRemove = Math.min(transaction.credits_added, userProfile.total_credits)
      
      await supabase
        .from('user_profiles')
        .update({ 
          total_credits: Math.max(0, userProfile.total_credits - creditsToRemove),
          subscription_status: 'cancelled'
        })
        .eq('id', transaction.user_id)
    }

    // Record refund transaction
    await supabase
      .from('transactions')
      .insert({
        user_id: transaction.user_id,
        groovesell_order_id: `${data.order_id}-refund`,
        transaction_type: 'refund',
        credits_added: -transaction.credits_added,
        amount: -data.amount,
        currency: data.currency,
        status: 'completed'
      })

    console.log(`Refund processed for order ${data.order_id}`)
  } catch (error) {
    console.error('Error in handleRefund:', error)
  }
}
