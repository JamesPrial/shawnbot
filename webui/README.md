# ShawnBot WebUI

Admin web interface for the ShawnBot Discord bot.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create environment configuration:
```bash
cp .env.example .env.local
```

3. Configure `.env.local` with your API credentials:
   - `VITE_API_URL` - Admin API base URL (default: `http://localhost:3000`)
   - `VITE_API_TOKEN` - Bearer token matching the bot's `ADMIN_API_TOKEN`

## Development

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build to dist/
npm run preview   # Preview production build locally
```

## Code Quality

```bash
npm run lint      # Check for lint errors
npm run lint:fix  # Auto-fix lint errors
npm run typecheck # Type check without emitting
npm test          # Run tests in watch mode (vitest)
npm run test:run  # Run tests once
```

## Technology Stack

- **React 18+** - UI framework
- **TypeScript 5.5** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Vitest** - Unit testing framework

## Project Structure

```
webui/
├── src/
│   ├── __tests__/     # Test files
│   ├── App.tsx        # Root component
│   ├── main.tsx       # React entry point
│   └── index.css      # Tailwind directives
├── index.html         # HTML entry point
├── vite.config.ts     # Vite configuration
└── tsconfig.json      # TypeScript configuration
```

## API Integration

The webui communicates with the ShawnBot Admin API at `http://127.0.0.1:3000`. The Vite dev server proxies `/api` and `/health` requests to avoid CORS issues.

See [CLAUDE.md](./CLAUDE.md) for detailed API documentation and development guidelines.
