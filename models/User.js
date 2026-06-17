const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    uid: String,
    username: String
});

module.exports = mongoose.model("User", UserSchema);
