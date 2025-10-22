# 🚀 Quick Start Guide

## One-Command Setup

```bash
npm run setup
```

That's it! This command will:
1. ✅ Install PostgreSQL (if needed)
2. ✅ Configure database with your .env credentials
3. ✅ Create tables and indexes
4. ✅ Test Sora API connection
5. ✅ Install all dependencies

## Running the App

**Terminal 1 - Scanner:**
```bash
npm run scanner
```

**Terminal 2 - App:**
```bash
npm run dev
```

## Access Points

- **Main Feed**: http://localhost:3000
- **Dashboard**: http://localhost:3000/scanner-debug
- **Setup Guide**: http://localhost:3000/setup

## Environment Setup

Before running setup, create `.env` from `env.example`:

```bash
cp env.example .env
```

Edit `.env` with your credentials:
```env
AUTH_BEARER_TOKEN=your_token_here
DB_PASSWORD=postgres
```

## Troubleshooting

**Setup fails?**
```bash
npm run setup
```

**Scanner not working?**
```bash
npm run scanner
```

**Database issues?**
```bash
npm run setup
```

## Documentation

- [Full README](README.md)
- [Database Setup](docs/DATABASE_SETUP.md)
- [Scanner Guide](docs/README_SCANNER.md)
- [API Docs](docs/API-Doc.md)

---

**Need help?** Check the [main README](README.md) for detailed information.

