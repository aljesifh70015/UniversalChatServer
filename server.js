const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

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
            user = new User({ uid, username });
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

// Add friend
app.post("/add_friend", async (req, res) => {
    try {
        const { friendUid } = req.body;

        const friend = await User.findOne({ uid: friendUid });

        if (!friend) {
            return res.status(404).json({ message: "Friend not found" });
        }

        res.json({ message: "Friend Added" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
        const users = await User.find({
            uid: { $ne: req.params.uid }
        });

        res.json(users.map(u => u.uid));
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
        console.log("Joined room:", roomId);
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

app.get("/", (req, res) => {
    res.send("Chat server running");
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
