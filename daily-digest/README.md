# 📬 Daily Digest

AI-powered morning briefings. Get your GitHub activity, RSS feeds, and more summarized and delivered to your inbox.

## Features

- 🐙 **GitHub Activity** — PRs, issues, commits summarized
- 📰 **RSS Feeds** — Your favorite sources, distilled
- 🤖 **AI Summaries** — Claude reads everything, gives you the TL;DR
- 📧 **Morning Email** — Delivered when you want it

## Tech Stack

- **Frontend:** Static HTML/CSS
- **Backend:** Vercel Serverless Functions
- **Payments:** Stripe (subscriptions)
- **Email:** Resend
- **AI:** Claude (Anthropic)
- **Cron:** Vercel Cron

## Setup

### 1. Clone & Install

```bash
cd daily-digest
npm install
```

### 2. Create Stripe Products

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Create two products:
   - Monthly: $5/month
   - Yearly: $49/year
3. Copy the price IDs

### 3. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. New OAuth App
3. Set callback URL to `https://your-domain.com/api/auth/github/callback`

### 4. Set Up Resend

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain
3. Get API key

### 5. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

Add these to your Vercel project settings too.

### 6. Deploy

```bash
vercel --prod
```

### 7. Set Up Stripe Webhook

1. In Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

## Local Development

```bash
npm run dev
```

## TODO

- [ ] Database integration (Vercel KV or Supabase)
- [ ] User session management
- [ ] Email verification
- [ ] Unsubscribe handling
- [ ] More feed sources (Twitter, Reddit, etc.)

## License

MIT
