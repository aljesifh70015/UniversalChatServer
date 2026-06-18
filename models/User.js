const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    uid: {
        type: String,
        unique: true
    },

    username: String,

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
