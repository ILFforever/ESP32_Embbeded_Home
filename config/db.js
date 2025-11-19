const { initializeFirebase } = require('./firebase');

// Connect with Firebase
const connectDB = async () => {
  try {
    initializeFirebase();
    console.log('Firebase Connected Successfully');
    return true;
  } catch (error) {
    console.error(`Error connecting to Firebase: ${error.message}`);
    throw error;
  }
}

module.exports = connectDB;