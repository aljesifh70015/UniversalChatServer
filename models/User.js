const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    uid: {
        type: String,
        required: true,
        unique: true
    },

    username: {
        type: String,
        required: true
    },

    email: {
        type: String,
        default: ""
    },

    password: {
        type: String,
        default: ""
    },

    verified: {
        type: Boolean,
        default: false
    },

    loggedInDevice: {
        type: String,
        default: ""
    },

    friends: {
        type: [String],
        default: []
    },

    friendRequests: {
        type: [String],
        default: []
    },

    lastSeen: {
        type: String,
        default: ""
    },

    fcmToken: {
        type: String,
        default: ""
    },

    profilePic: {
        type: String,
        default: ""
    }
});

module.exports = mongoose.model("User", UserSchema);
