const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { initializeFirebase } = require('./config/firebase');
const cors = require('cors');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

app.use(cors({
  origin: true, // Reflect the request origin, as it comes from the browser
  credentials: true,
}));


// Body parser
app.use(express.json());

// Cookie parser
app.use(cookieParser());

// Import route files
const auth = require('./routes/auth');
const devices = require('./routes/devices');

// Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/devices', devices);

app.get('/info', (req, res) => {
  res.send('Arduino-888-SmartHome is running!');
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});
