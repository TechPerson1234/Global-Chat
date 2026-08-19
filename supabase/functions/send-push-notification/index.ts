import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webpush from 'https://esm.sh/web-push@3.6.6';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;

// CHANGE THIS to your email
webpush.setVapidDetails(
  'mailto:your-email@example.com',
  vapidPublicKey,
  vapidPrivateKey
);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { record, type } = await req.json();
    
    if (type !== 'INSERT') {
      return new Response('Ignored', { status: 200 });
    }

    const newMessage = record;
    const sender = newMessage.username || 'Someone';

    // Fetch all subscriptions except the sender's own session
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .neq('session_id', newMessage.session_id);

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return new Response('Error fetching subscriptions', { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response('No subscribers', { status: 200 });
    }

    // Build payload – keep it small for iOS
    const payload = JSON.stringify({
      title: `💬 ${sender}`,
      body: newMessage.message || '📷 Sent an image',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `msg-${newMessage.id}`,
      data: {
        url: '/',
        messageId: newMessage.id
      }
    });

    // Send to all subscribers
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: sub.keys
          };
          await webpush.sendNotification(pushSubscription, payload);
          return { success: true, endpoint: sub.endpoint };
        } catch (err: any) {
          // If subscription is invalid (410 Gone), delete it
          if (err.statusCode === 410) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
          }
          return { success: false, endpoint: sub.endpoint, error: err.message };
        }
      })
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response('Error: ' + err.message, { status: 500 });
  }
});