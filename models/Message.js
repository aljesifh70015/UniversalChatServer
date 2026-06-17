const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
    roomId: String,
    sender: String,
    message: String,
    timestamp: Number
});

module.exports = mongoose.model("Message", MessageSchema);
