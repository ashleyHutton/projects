# Daily Digest — TODO

## ✅ Completed
- [x] Landing page with pricing ($5/mo, $49/yr)
- [x] Stripe checkout + subscription flow
- [x] GitHub OAuth integration
- [x] Supabase database (users, github_connections, feeds, settings)
- [x] AI-powered digest generation (Claude)
- [x] Email delivery via Resend
- [x] Toast notifications
- [x] Dashboard shows real state from DB
- [x] RSS feed management (add/remove, persisted)
- [x] Settings persistence (delivery time, timezone, summary length)
- [x] Daily cron job configured (runs hourly, sends at user's scheduled time)

## 🔧 TODO
- [ ] Include RSS feeds in digest email (currently only GitHub)
- [ ] Proper auth/sessions — login flow for multi-user support
- [ ] Stripe webhook handling — update subscription status on events
- [ ] Rate limiting on test digest (prevent abuse)
- [ ] Email verification for new users
- [ ] Unsubscribe flow
- [ ] Billing portal link (Stripe customer portal)
- [ ] Error handling/retry for failed digest sends
- [ ] Track digest history (what was sent, when)

## 💡 Nice-to-Have
- [ ] Multiple GitHub accounts per user
- [ ] More feed sources (Twitter, Reddit, etc.)
- [ ] Custom digest templates
- [ ] Weekly digest option
- [ ] Usage dashboard (digests sent count)

## 🔗 Links
- Live: https://projects.ashleyweinaug.com/daily-digest/
- Dashboard: https://projects.ashleyweinaug.com/daily-digest/dashboard
- Supabase: https://supabase.com/dashboard/project/lzdvtilobfwsyqhhhsvm
- Stripe: https://dashboard.stripe.com/test/products
