const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getFirestore } = require('../config/firebase');

class User {
    constructor(data) {
        this.id = data.id || null;
        this.name = data.name || null;
        this.telephone_number = data.telephone_number || null;
        this.email = data.email || null;
        this.password = data.password || null;
        this.resetPasswordToken = data.resetPasswordToken || null;
        this.resetPasswordExpire = data.resetPasswordExpire || null;
        this.createdAt = data.createdAt || new Date();
        this.role = data.role || 'user';
    }

    // Validation
    static validate(userData) {
        const errors = [];

        if (!userData.name) {
            errors.push('Please add a name');
        }

        if (!userData.telephone_number) {
            errors.push('Please add a telephone number in form of XXX-XXXXXXX');
        } else if (!/^\d{3}-\d{7}$/.test(userData.telephone_number)) {
            errors.push('Please add a valid telephone number');
        }

        if (!userData.email) {
            errors.push('Please add an email');
        } else if (!/^(([^<>()\[\]\\.,;:\s@\"]+(\.[^<>()\[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(userData.email)) {
            errors.push('Please add a valid email');
        }

        if (!userData.password) {
            errors.push('Please add a password');
        } else if (userData.password.length < 6) {
            errors.push('Password must be at least 6 characters');
        }

        if (!['user', 'admin'].includes(userData.role || 'user')) {
            errors.push('Invalid role');
        }

        return errors;
    }

    // Hash password
    static async hashPassword(password) {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    }

    // Compare password
    static async matchPassword(enteredPassword, hashedPassword) {
        return await bcrypt.compare(enteredPassword, hashedPassword);
    }

    // Generate JWT token
    static getSignedJwtToken(userId) {
        return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRE
        });
    }

    // Create user in Firestore
    static async create(userData) {
        const errors = User.validate(userData);
        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }

        const db = getFirestore();

        // Check if email already exists
        const existingUser = await db.collection('users')
            .where('email', '==', userData.email)
            .get();

        if (!existingUser.empty) {
            throw new Error('Email already exists');
        }

        // Hash password
        const hashedPassword = await User.hashPassword(userData.password);

        const newUser = {
            name: userData.name,
            telephone_number: userData.telephone_number,
            email: userData.email,
            password: hashedPassword,
            role: userData.role || 'user',
            createdAt: new Date(),
            resetPasswordToken: null,
            resetPasswordExpire: null
        };

        const docRef = await db.collection('users').add(newUser);

        return new User({ id: docRef.id, ...newUser });
    }

    // Find user by ID
    static async findById(id) {
        const db = getFirestore();
        const doc = await db.collection('users').doc(id).get();

        if (!doc.exists) {
            return null;
        }

        return new User({ id: doc.id, ...doc.data() });
    }

    // Find one user by query
    static async findOne(query) {
        const db = getFirestore();
        let collectionRef = db.collection('users');

        // Build query
        for (const [key, value] of Object.entries(query)) {
            collectionRef = collectionRef.where(key, '==', value);
        }

        const snapshot = await collectionRef.limit(1).get();

        if (snapshot.empty) {
            return null;
        }

        const doc = snapshot.docs[0];
        return new User({ id: doc.id, ...doc.data() });
    }

    // Find users by query
    static async find(query = {}) {
        const db = getFirestore();
        let collectionRef = db.collection('users');

        // Build query
        for (const [key, value] of Object.entries(query)) {
            collectionRef = collectionRef.where(key, '==', value);
        }

        const snapshot = await collectionRef.get();

        return snapshot.docs.map(doc => new User({ id: doc.id, ...doc.data() }));
    }

    // Update user
    static async findByIdAndUpdate(id, updateData) {
        const db = getFirestore();

        // If password is being updated, hash it
        if (updateData.password) {
            updateData.password = await User.hashPassword(updateData.password);
        }

        await db.collection('users').doc(id).update(updateData);

        return User.findById(id);
    }

    // Delete user
    static async findByIdAndDelete(id) {
        const db = getFirestore();
        const user = await User.findById(id);

        if (!user) {
            return null;
        }

        await db.collection('users').doc(id).delete();
        return user;
    }

    // Convert to JSON (excluding password)
    toJSON() {
        const obj = { ...this };
        delete obj.password;
        return obj;
    }
}

module.exports = User;