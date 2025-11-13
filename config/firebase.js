const admin = require('firebase-admin');

// Initialize Firebase Admin
const initializeFirebase = () => {
  try {
    if (process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        })
      });
    } else {
      // Fallback: Use service account key file
      const serviceAccount = require('./serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase:', error.message);
    throw error;
  }
};

// Get Firestore instance
const getFirestore = () => {
  return admin.firestore();
};

// Get Auth instance
const getAuth = () => {
  return admin.auth();
};

module.exports = { initializeFirebase, getFirestore, getAuth, admin };
