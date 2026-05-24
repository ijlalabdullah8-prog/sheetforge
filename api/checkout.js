export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan_name, email } = req.body;

  const variantId = plan_name === 'pro'
    ? process.env.LEMONSQUEEZY_PRO_VARIANT_ID
    : process.env.LEMONSQUEEZY_SCALE_VARIANT_ID;

  if (!variantId) return res.status(400).json({ error: 'Invalid plan' });

  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: email,
            },
            product_options: {
              redirect_url: 'https://sheetforge-delta.vercel.app',
            },
          },
          relationships: {
            store: {
              data: {
                type: 'stores',
                id: process.env.LEMONSQUEEZY_STORE_ID,
              },
            },
            variant: {
              data: {
                type: 'variants',
                id: String(variantId),
              },
            },
          },
        },
      }),
    });

    const data = await response.json();
    const checkoutUrl = data?.data?.attributes?.url;

    if (!checkoutUrl) return res.status(500).json({ error: 'Failed to create checkout' });

    return res.json({ url: checkoutUrl });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Checkout failed' });
  }
}