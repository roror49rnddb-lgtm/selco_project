# selco_project
a online store

## Kashier checkout setup

The card payment option on `index.html` is served by three Vercel serverless functions in `api/`.
The Kashier secret key is only used inside those functions, never in the browser.

1. Run `supabase/orders.sql` in the Supabase SQL editor (creates `public.orders` with RLS on and no
   anon policies, so only the service role can read/write it).
2. Add these environment variables in the Vercel project (Settings → Environment Variables):

   | Variable | Value |
   | --- | --- |
   | `KASHIER_MID` | `MID-49672-453` |
   | `KASHIER_API_KEY` | the Kashier Payment API key (test key while `KASHIER_MODE=test`) |
   | `KASHIER_MODE` | `test` (switch to `live` with the live key + MID when going live) |
   | `SUPABASE_URL` | `https://sawzpupdhswkclsfftzf.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (Project Settings → API) |

3. In the Kashier dashboard, set the webhook URL to `https://<your-domain>/api/kashier-webhook`.

Flow: the browser posts the cart to `/api/kashier-session`, which re-prices the items from the
`products` table, stores a `pending` order, signs it and returns the hosted payment page URL.
Kashier redirects back to `/api/kashier-callback` and also calls `/api/kashier-webhook`; both verify
the HMAC signature before setting the order status to `paid` / `failed`.
