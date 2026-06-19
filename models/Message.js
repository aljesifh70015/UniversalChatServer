const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true
    },

    sender: {
        type: String,
        required: true
    },

    message: {
        type: String,
        required: true
    },

    timestamp: {
        type: Number,
        required: true
    },

    expiresAt: {
        type: Number,
        default: 0
    },

    deletedFor: {
        type: [String],
        default: []
    },

    deletedForEveryone: {
        type: Boolean,
        default: false
    },

    edited: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model("Message", MessageSchema);
