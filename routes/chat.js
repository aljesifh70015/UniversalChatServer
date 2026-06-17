const express = require("express");
const router = express.Router();
const Message = require("../models/Message");

// get chat history
router.get("/:roomId", async (req, res) => {

    const messages = await Message.find({
        roomId: req.params.roomId
    }).sort({ timestamp: 1 });

    res.json(messages);
});

module.exports = router;
