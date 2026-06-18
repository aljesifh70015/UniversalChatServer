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


// REGISTER
app.post("/register", async (req, res) => {
    try {
        const { uid, username } = req.body;

        let user = await User.findOne({ uid });

        if (!user) {
            user = new User({
                uid,
                username,
                friends: [],
                pendingRequests: []
            });

            await user.save();
        }

        res.json({ message: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// SEND FRIEND REQUEST
app.post("/send_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;

        const friend = await User.findOne({ uid: friendUid });

        if (!friend) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!friend.pendingRequests.includes(myUid)) {
            friend.pendingRequests.push(myUid);
            await friend.save();
        }

        res.json({ message: "Request sent" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// GET REQUESTS
app.get("/requests/:uid", async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });
        res.json(user.pendingRequests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ACCEPT REQUEST
app.post("/accept_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;

        const me = await User.findOne({ uid: myUid });
        const friend = await User.findOne({ uid: friendUid });

        me.pendingRequests = me.pendingRequests.filter(
            uid => uid !== friendUid
        );

        if (!me.friends.includes(friendUid))
            me.friends.push(friendUid);

        if (!friend.friends.includes(myUid))
            friend.friends.push(myUid);

        await me.save();
        await friend.save();

        res.json({ message: "Accepted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// FRIENDS
app.get("/friends/:uid", async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });
        res.json(user.friends);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// MESSAGE HISTORY
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


// SOCKET
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
            uid,
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
            uid,
            status: lastSeen
        });
    });

    socket.on("send_message", async (data) => {
        const msg = new Message({
            roomId: data.roomId,
            sender: data.sender,
            message: data.message,
            timestamp: Date.now()
        });

        await msg.save();

        io.to(data.roomId).emit("receive_message", data);
        io.to(data.roomId).emit("message_delivered");
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
