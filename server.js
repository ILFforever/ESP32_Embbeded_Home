const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const cors = require('cors');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/, // Allow localhost on any port
  'https://yourfrontend.com' // Your production frontend URL
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowedOrigin => typeof allowedOrigin === 'string' ? allowedOrigin === origin : allowedOrigin.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));


// Body parser
app.use(express.json());

// Cookie parser
app.use(cookieParser());

// Import route files
const auth = require('./routes/auth');

// Mount routers
app.use('/api/v1/auth', auth);

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
