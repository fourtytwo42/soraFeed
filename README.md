# 🎬 Sora Feed - TikTok-Style Video Feed App

A beautiful, responsive video feed application for browsing Sora-generated videos with PostgreSQL-powered indexing and real-time monitoring.

## ✨ Features

- 📱 **TikTok-style Interface** - Vertical scrolling video feed with smooth animations
- 🎥 **Video Controls** - Play/pause, mute, download, and share functionality
- 🔄 **Remix Navigation** - Swipe through video remixes with horizontal gestures
- ❤️ **Favorites System** - Save and browse your favorite videos
- 🔍 **Real-time Scanner** - Automatic indexing of latest Sora posts
- 📊 **Debug Dashboard** - Monitor scanner performance and database stats
- 🗄️ **PostgreSQL Backend** - Robust database with duplicate detection
- 🎨 **Modern UI** - Beautiful gradients, smooth animations, responsive design

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/fourtytwo42/soraFeed.git
cd soraFeed
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp env.example .env
```

Edit `.env` and add your credentials:

```env
# Sora API Authentication
AUTH_BEARER_TOKEN=your_jwt_token_here
USER_AGENT=Mozilla/5.0...
ACCEPT_LANGUAGE=en-US,en;q=0.9

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sora_feed
DB_USER=postgres
DB_PASSWORD=postgres
```

### 3. Run Setup (One Command!)

```bash
npm run setup
```

This single command will:
- ✅ Install PostgreSQL (if not installed)
- ✅ Create and configure the database
- ✅ Initialize database tables
- ✅ Test Sora API connection
- ✅ Install all npm dependencies

### 4. Start the Application

**Start the scanner** (in one terminal):
```bash
npm run scanner
```

**Start the app** (in another terminal):
```bash
npm run dev
```

### 5. Access the App

- **Main Feed**: http://localhost:3000
- **Scanner Dashboard**: http://localhost:3000/scanner-debug
- **Setup Guide**: http://localhost:3000/setup

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Complete setup (PostgreSQL + database + dependencies) |
| `npm run dev` | Start Next.js development server |
| `npm run scanner` | Start PostgreSQL scanner service |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

## 🗂️ Project Structure

```
soraFeed/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── page.tsx           # Main feed page
│   │   ├── scanner-debug/     # Scanner monitoring dashboard
│   │   ├── setup/             # Setup guide page
│   │   └── api/               # API routes
│   ├── components/            # React components
│   │   ├── VideoFeed.tsx     # Main video feed component
│   │   ├── VideoPost.tsx     # Individual video post
│   │   ├── FeedLoader.tsx    # Feed data loader
│   │   └── RemixCacheDebug.tsx
│   ├── lib/                   # Utilities
│   │   ├── api.ts            # Sora API client
│   │   ├── db.ts             # Database connection
│   │   └── remixCache.ts     # Remix caching system
│   └── types/                 # TypeScript types
│       └── sora.ts           # Sora API types
├── scripts/                   # Setup and utility scripts
│   ├── scanner.js            # PostgreSQL scanner
│   ├── setup.js              # Automated setup script
│   └── test-*.js             # Test utilities
├── docs/                      # Documentation
│   ├── DATABASE_SETUP.md     # Detailed database guide
│   ├── README_SCANNER.md     # Scanner documentation
│   └── INSTALLATION_COMPLETE.md
├── public/                    # Static assets
├── .env                       # Environment variables (create from env.example)
└── package.json
```

## 🎯 Key Features Explained

### Video Feed
- Vertical scrolling with keyboard navigation (↑↓)
- Smooth animations with Framer Motion
- Auto-play on scroll
- Pause on click/hover

### Remix Navigation
- Horizontal swipe gestures
- Visual remix indicators
- Sliding window for many remixes
- Preloaded remix data with caching

### Scanner System
- Polls Sora API every 10 seconds
- Fetches latest 200 posts
- Automatic duplicate detection
- Real-time monitoring dashboard

### Social Sharing
- Share to Facebook & Twitter
- Download videos locally
- Copy permalink to clipboard

## 📊 Database Schema

### sora_posts
- `id` (PRIMARY KEY) - Unique post identifier
- `post_data` (JSONB) - Complete post data
- `profile_data` (JSONB) - User profile data
- `text` (TEXT) - Post caption
- `posted_at`, `updated_at` (BIGINT) - Timestamps
- `indexed_at` (TIMESTAMP) - When added to database

### scanner_stats
- Tracks scanner performance metrics
- Records scan duration and errors
- Stores current scanner status

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_BEARER_TOKEN` | Sora API JWT token | Required |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_NAME` | Database name | sora_feed |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | postgres |

### Scanner Settings

Edit `scripts/scanner.js` to customize:
- Scan frequency (default: 10 seconds)
- Posts per scan (default: 200)
- API endpoint and parameters

## 📚 Documentation

- **[Database Setup](docs/DATABASE_SETUP.md)** - Detailed PostgreSQL setup guide
- **[Scanner Guide](docs/README_SCANNER.md)** - Scanner system documentation
- **[API Documentation](API-Doc.md)** - Sora API reference

## 🐛 Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql

# Reset database
npm run setup
```

### Scanner Not Working

```bash
# Check scanner logs
npm run scanner

# Verify API token in .env
cat .env | grep AUTH_BEARER_TOKEN

# Test API connection
node scripts/test-api.js
```

### Port 3000 Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm run dev
```

## 🚀 Deployment

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Environment Setup

Make sure to set production environment variables:
- `NODE_ENV=production`
- Valid `AUTH_BEARER_TOKEN`
- Production database credentials

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI powered by [Tailwind CSS](https://tailwindcss.com/)
- Animations with [Framer Motion](https://www.framer.com/motion/)
- Database: [PostgreSQL](https://www.postgresql.org/)

---

**Made with ❤️ for the Sora community**
