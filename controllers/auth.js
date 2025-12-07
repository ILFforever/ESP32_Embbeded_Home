const User = require('../models/User');
const { getFirestore } = require('../config/firebase');

// @desc    Register user
// @route   GET /api/v1/auth/register
// @access  Public
exports.register = async(req, res, next) => {
    try{
        const{name,telephone_number,email,password,role}= req.body;

        //Create User
        const user = await User.create({
            name,
            telephone_number,
            email,
            password,
            role
        });
        //create token
        //const token = user.getSignedJwtToken();
        res.status(200).json({ success: true });
        //sendTokenResponse(user,200,res);
    }
    catch(err){
        res.status(400).json({success:false});
        console.log(err.stack);
    }
    
    
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async(req,res,next)=>{
    const {email,password}= req.body;

    //validate email&password
    if(!email || !password){
        return res.status(400).json({success:false,msg:'Please provide an email and password'});
    }

    //check for user
    const user = await User.findOne({email});
    if(!user){
        return res.status(400).json({success:false,msg:'Invalid credentials'});
    }

    //check if password matches
    const isMatch = await User.matchPassword(password, user.password);
    if(!isMatch){
        return res.status(401).json({success:false,msg:'Invalid credentials'});
    }

    //create token
    sendTokenResponse(user,200,res);
};

const sendTokenResponse = async (user, statusCode, res) => {
    // Create token using the user's id
    const token = User.getSignedJwtToken(user.id);

    const options = {
        expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    };

    res.status(statusCode).cookie('token', token, options).json({
        success: true,
        token
    });
}

// @desc    Get current Logged in user
// @route   POST /api/v1/auth/curuser
// @access  Private
exports.getCurrentUser=async(req,res,next)=>{
    const user = await User.findById(req.user.id);
    res.status(200).json({
        success:true,
        data: user.toJSON()
    });
};

// @desc    Log user out / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
/*exports.logout = (req,res,next)=>{
    res.clearcookie('token',{
        expires: new Date(Date.now+1000),
        httpOnly:true
    });

    res.status(200).json({
        success: true,
        message: `${req.user.role} logged out successfully`
    });
}*/

// @desc    Log user out / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
    res.cookie('token', 'none', {
        expires: new Date(Date.now() - 10 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    });

    res.status(200).json({
        success: true,
        data: {},
        message: 'User logged out successfully'
    });
};

// @desc    Get all admin users
// @route   GET /api/v1/auth/admins
// @access  Private/Admin
exports.getAdmins = async(req, res, next) => {
    try {
        // Find all users with role="admin"
        const adminUsers = await User.find({ role: 'admin' });

        res.status(200).json({
            success: true,
            count: adminUsers.length,
            data: adminUsers.map(user => user.toJSON())
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Delete admin user
// @route   DELETE /api/v1/auth/admins/:id
// @access  Private/Admin
exports.deleteAdmin = async(req, res, next) => {
    try {
        // Find the user to ensure it's an admin
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: `User not found with id ${req.params.id}`
            });
        }

        // Check if the user is an admin
        if (user.role !== 'admin') {
            return res.status(400).json({
                success: false,
                message: 'User is not an admin'
            });
        }

        // Prevent admin from deleting their own account
        if (user.id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Admin cannot delete their own account'
            });
        }

        // Delete the user
        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            data: {},
            message: 'Admin deleted successfully'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

exports.getUsers = async(req, res, next) => {
    try {
        // Find all users with role="user"
        const users = await User.find({ role: 'user' });

        res.status(200).json({
            success: true,
            count: users.length,
            data: users.map(user => user.toJSON())
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

exports.deleteUser = async(req, res, next) => {
    try {
        // Find the user to ensure it's a user
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: `User not found with id ${req.params.id}`
            });
        }

        // Check if the user is a user
        if (user.role !== 'user') {
            return res.status(400).json({
                success: false,
                message: 'User is not an user'
            });
        }

        // Delete the user
        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            data: {},
            message: 'User deleted successfully'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Prepare a user to add an NFC card
// @route   POST /api/v1/auth/prepare-add-card
// @access  Private
exports.prepareAddCard = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Set is_adding_card to true for the current user
        await User.findByIdAndUpdate(userId, { is_adding_card: true });

        // Optional: Reset any other users that might be stuck in this state
        // This is a safety measure in case a previous process failed.
        const db = getFirestore();
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('is_adding_card', '==', true).get();
        snapshot.forEach(doc => {
            if (doc.id !== userId) {
                doc.ref.update({ is_adding_card: false });
            }
        });

        res.status(200).json({
            success: true,
            message: 'User is ready to scan a new NFC card.'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Prepare a user to add an NFC card
// @route   POST /api/v1/auth/prepare-add-card
// @access  Private
exports.prepareAddCard = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Set is_adding_card to true for the current user
        await User.findByIdAndUpdate(userId, { is_adding_card: true });

        // Optional: Reset any other users that might be stuck in this state
        // This is a safety measure in case a previous process failed.
        const db = getFirestore();
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('is_adding_card', '==', true).get();
        snapshot.forEach(doc => {
            if (doc.id !== userId) {
                doc.ref.update({ is_adding_card: false });
            }
        });

        res.status(200).json({
            success: true,
            message: 'User is ready to scan a new NFC card.'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};
// @desc    Assign NFC card to a user
// @route   POST /api/v1/auth/assign-nfc
// @access  Private/Admin
exports.assignNfcCard = async (req, res, next) => {
    try {
        const { userId, cardId } = req.body;

        if (!userId || !cardId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a userId and cardId'
            });
        }

        const db = getFirestore();

        // Check if the card is already assigned to another user
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('nfc_cards', 'array-contains', cardId).get();

        if (!snapshot.empty) {
            const existingUser = new User({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            return res.status(400).json({
                success: false,
                message: `Card already assigned to user ${existingUser.name}`
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: `User not found with id ${userId}`
            });
        }

        user.nfc_cards.push(cardId);
        await User.findByIdAndUpdate(userId, { nfc_cards: user.nfc_cards });

        const updatedUser = await User.findById(userId);

        res.status(200).json({
            success: true,
            data: updatedUser.toJSON()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Enable add card mode for a user
// @route   POST /api/v1/auth/users/:userId/nfc/enable-add-mode
// @access  Private/Admin
exports.enableAddCardMode = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { nfc_device_id } = req.body; // Optional: specify which NFC device to use

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: `User not found with id ${userId}`
            });
        }

        const db = getFirestore();

        // Disable add mode for all other users (only one user can be in add mode at a time)
        const usersRef = db.collection('users');
        const addingUsersSnapshot = await usersRef.where('is_adding_card', '==', true).get();
        const disablePromises = addingUsersSnapshot.docs.map(doc =>
            doc.ref.update({ is_adding_card: false })
        );
        await Promise.all(disablePromises);

        // Update the user's is_adding_card flag
        await User.findByIdAndUpdate(userId, { is_adding_card: true });

        // Send command to NFC reader device (doorbell or dedicated NFC reader)
        const targetDeviceId = nfc_device_id || 'db_001'; // Default to doorbell

        // Queue a command to enable NFC scanning mode
        const devicesController = require('./devices');
        const commandResult = await devicesController.queueCommandHelper(targetDeviceId, 'nfc_scan_mode', {
            enabled: true,
            user_id: userId,
            user_name: user.name
        });

        console.log(`[NFC] Add card mode enabled for user ${user.name} (ID: ${userId}). Command sent to ${targetDeviceId}.`);

        res.status(200).json({
            success: true,
            message: `Add card mode enabled for ${user.name}. Scan an NFC card at the reader.`,
            command_result: commandResult
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Disable add card mode for a user
// @route   POST /api/v1/auth/users/:userId/nfc/disable-add-mode
// @access  Private/Admin
exports.disableAddCardMode = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { nfc_device_id } = req.body; // Optional: specify which NFC device to use

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: `User not found with id ${userId}`
            });
        }

        // Update the user's is_adding_card flag
        await User.findByIdAndUpdate(userId, { is_adding_card: false });

        // Send command to NFC reader device to disable scanning mode
        const targetDeviceId = nfc_device_id || 'db_001'; // Default to doorbell

        const devicesController = require('./devices');
        const commandResult = await devicesController.queueCommandHelper(targetDeviceId, 'nfc_scan_mode', {
            enabled: false,
            user_id: null,
            user_name: null
        });

        console.log(`[NFC] Add card mode disabled for user ${user.name} (ID: ${userId}). Command sent to ${targetDeviceId}.`);

        res.status(200).json({
            success: true,
            message: `Add card mode disabled for ${user.name}`,
            command_result: commandResult
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Remove NFC card from a user
// @route   DELETE /api/v1/auth/users/:userId/nfc/cards/:cardId
// @access  Private/Admin
exports.removeNfcCard = async (req, res, next) => {
    try {
        const { userId, cardId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: `User not found with id ${userId}`
            });
        }

        // Remove the card from the user's nfc_cards array
        const updatedCards = user.nfc_cards.filter(card => card !== cardId);

        if (updatedCards.length === user.nfc_cards.length) {
            return res.status(404).json({
                success: false,
                message: 'Card not found for this user'
            });
        }

        await User.findByIdAndUpdate(userId, { nfc_cards: updatedCards });

        res.status(200).json({
            success: true,
            message: `NFC card ${cardId} removed from ${user.name}`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};