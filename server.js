const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// MongoDB
mongoose.connect("mongodb+srv://aljesifhoque_db_user:67UF0MniHFtG98d2@cluster0.k3jzopc.mongodb.net/?appName=Cluster0")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

const User = require("./models/User");
const Message = require("./models/Message");

const userLastSeen = {};

// ================= API =================

// Register
app.post("/register", async (req, res) => {
    try {
        const { uid, username } = req.body;
        let user = await User.findOne({ uid });

        if (!user) {
            user = new User({
                uid,
                username,
                friends: [],
                friendRequests: []
            });
            await user.save();
        }

        res.json({ message: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Search user
app.get("/user/:uid", async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });

        if (!user) {
            return res.status(404).json({ found: false });
        }

        res.json({
            found: true,
            uid: user.uid,
            username: user.username
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send Friend Request
app.post("/send_friend_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;

        const me = await User.findOne({ uid: myUid });
        const friend = await User.findOne({ uid: friendUid });

        if (!me || !friend) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        if (friend.friendRequests.includes(myUid)) {
            return res.json({
                message: "Already requested"
            });
        }

        if (friend.friends.includes(myUid)) {
            return res.json({
                message: "Already friends"
            });
        }

        friend.friendRequests.push(myUid);
        await friend.save();

        res.json({ message: "Request Sent" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Friend Requests
app.get("/friend_requests/:uid", async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });

        if (!user) {
            return res.status(404).json([]);
        }

        res.json(user.friendRequests);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Accept Friend Request
app.post("/accept_friend_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;

        const me = await User.findOne({ uid: myUid });
        const friend = await User.findOne({ uid: friendUid });

        if (!me || !friend) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        me.friendRequests = me.friendRequests.filter(
            uid => uid !== friendUid
        );

        if (!me.friends.includes(friendUid)) {
            me.friends.push(friendUid);
        }

        if (!friend.friends.includes(myUid)) {
            friend.friends.push(myUid);
        }

        await me.save();
        await friend.save();

        res.json({ message: "Friend Added" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reject Friend Request
app.post("/reject_friend_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;

        const me = await User.findOne({ uid: myUid });

        if (!me) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        me.friendRequests = me.friendRequests.filter(
            uid => uid !== friendUid
        );

        await me.save();

        res.json({ message: "Request Rejected" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// OLD Add Friend (compatibility)
app.post("/add_friend", async (req, res) => {
    res.json({
        message: "Use send_friend_request"
    });
});

// Message history
app.get("/messages/:roomId", async (req, res) => {
    try {
        const messages = await Message.find({
            roomId: req.params.roomId
        }).sort({ timestamp: 1 });

        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Friends
app.get("/friends/:uid", async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });

        if (!user) {
            return res.json([]);
        }

        res.json(user.friends);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= SOCKET =================

const io = new Server(server, {
    cors: { origin: "*" }
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_room", (roomId) => {
        socket.join(roomId);
    });

    socket.on("user_online", (uid) => {
        io.emit("user_status", {
            uid: uid,
            status: "Online"
        });
    });

    socket.on("typing", (data) => {
        socket.to(data.roomId).emit("typing");
    });

    socket.on("stop_typing", (roomId) => {
        socket.to(roomId).emit("stop_typing");
    });

    socket.on("user_offline", (uid) => {
        const now = new Date();

        const lastSeen =
            "Last seen " +
            now.toLocaleDateString() +
            " " +
            now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

        userLastSeen[uid] = lastSeen;

        io.emit("user_status", {
            uid: uid,
            status: lastSeen
        });
    });

    socket.on("send_message", async (data) => {
        try {
            const msg = new Message({
                roomId: data.roomId,
                sender: data.sender,
                message: data.message,
                timestamp: Date.now()
            });

            await msg.save();

            io.to(data.roomId).emit("receive_message", data);
            io.to(data.roomId).emit("message_delivered");

        } catch (err) {
            console.log(err);
        }
    });

    socket.on("message_seen", (roomId) => {
        io.to(roomId).emit("message_seen");
    });

    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});

// Root
app.get("/", (req, res) => {
    res.send("Chat server running");
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
