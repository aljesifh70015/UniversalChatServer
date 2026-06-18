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

    friends: {
        type: [String],
        default: []
    },

    friendRequests: {
        type: [String],
        default: []
    }
});

module.exports = mongoose.model("User", UserSchema);
