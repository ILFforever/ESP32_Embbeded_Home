# ESP32 Smart Home - Frontend

Frontend application for the ESP32 Smart Home system built with React and TypeScript.

## Features

- 🔐 User Authentication (Login/Register)
- 🏠 Real-time Device Control
- 📊 Sensor Data Visualization
- 👥 Admin Panel for User Management
- 📱 Responsive Design
- 🔄 Real-time Updates via WebSocket

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Backend server running (see main branch)

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build
```

## Environment Variables

Copy `.env.example` to `.env` and update with your backend URL:

```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=ws://localhost:5000
REACT_APP_ENV=development
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── context/        # React Context providers
├── hooks/          # Custom React hooks
├── pages/          # Page components (routes)
├── services/       # API services
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
└── styles/         # Global styles
```

## Available Scripts

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests

## Integration with Backend

This frontend connects to the Express/Firebase backend from the main branch:

- **API Base URL**: `http://localhost:5000/api/v1`
- **Authentication**: JWT tokens stored in localStorage
- **Real-time**: WebSocket connection for sensor updates

## Development

1. Start the backend server (see main branch README)
2. Run `npm start` in this directory
3. Access the app at `http://localhost:3000`

## ESP32 Device Integration

The frontend interfaces with:
- Main LCD Hub
- Secondary LCD (Mesh)
- Room Sensors
- Doorbell LCD
- Doorbell Camera (Face Recognition)

## License

MIT License - See LICENSE file for details
