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

function getExpiryTime(expiryOption) {
    const now = Date.now();

    switch (expiryOption) {
        case "1d": return now + 86400000;
        case "2d": return now + 86400000 * 2;
        case "3d": return now + 86400000 * 3;
        case "1w": return now + 86400000 * 7;
        case "2w": return now + 86400000 * 14;
        case "3w": return now + 86400000 * 21;
        case "1m": return now + 86400000 * 30;
        default: return now + 86400000;
    }
}

setInterval(async () => {
    try {
        await Message.deleteMany({
            expiresAt: { $gt: 0, $lte: Date.now() }
        });
        console.log("Expired messages deleted");
    } catch (e) {
        console.log(e);
    }
}, 60000);

// ================= API =================

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

app.get("/user/:uid", async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });

        if (!user) return res.status(404).json({ found: false });

        res.json({
            found: true,
            uid: user.uid,
            username: user.username
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/send_friend_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;

        const me = await User.findOne({ uid: myUid });
        const friend = await User.findOne({ uid: friendUid });

        if (!me || !friend) {
            return res.status(404).json({ message: "User not found" });
        }

        if (friend.friendRequests.includes(myUid)) {
            return res.json({ message: "Request already sent" });
        }

        if (friend.friends.includes(myUid)) {
            return res.json({ message: "Already friends" });
        }

        friend.friendRequests.push(myUid);
        await friend.save();

        res.json({ message: "Request Sent" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/friend_requests/:uid", async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });
        res.json(user?.friendRequests || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/accept_friend_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;

        const me = await User.findOne({ uid: myUid });
        const friend = await User.findOne({ uid: friendUid });

        me.friendRequests = me.friendRequests.filter(uid => uid !== friendUid);

        if (!me.friends.includes(friendUid)) me.friends.push(friendUid);
        if (!friend.friends.includes(myUid)) friend.friends.push(myUid);

        await me.save();
        await friend.save();

        res.json({ message: "Accepted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/reject_friend_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;
        const me = await User.findOne({ uid: myUid });

        me.friendRequests = me.friendRequests.filter(uid => uid !== friendUid);
        await me.save();

        res.json({ message: "Rejected" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/messages/:roomId", async (req, res) => {
    try {
        const uid = req.query.uid;

        const messages = await Message.find({
            roomId: req.params.roomId,
            deletedFor: { $ne: uid }
        }).sort({ timestamp: 1 });

        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/delete_for_me", async (req, res) => {
    try {
        const { messageId, uid } = req.body;

        await Message.findByIdAndUpdate(messageId, {
            $addToSet: { deletedFor: uid }
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/edit_message", async (req, res) => {
    try {
        const { messageId, newText } = req.body;

        await Message.findByIdAndUpdate(messageId, {
            message: newText,
            edited: true
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/friends/:uid", async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });
        res.json(user?.friends || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/chat_list/:uid", async (req, res) => {
    try {
        const myUid = req.params.uid

        const user = await User.findOne({ uid: myUid })

        if (!user) {
            return res.json([])
        }

        const chatList = []

        for (const friendUid of user.friends) {
            const friend = await User.findOne({ uid: friendUid })

            let roomId =
                myUid < friendUid
                    ? `${myUid}_${friendUid}`
                    : `${friendUid}_${myUid}`

            const lastMessage = await Message.findOne({ roomId })
                .sort({ timestamp: -1 })

            chatList.push({
                uid: friendUid,
                username: friend?.username || friendUid,
                lastMessage: lastMessage?.message || "No messages yet",
                timestamp: lastMessage?.timestamp || 0
            })
        }

        chatList.sort((a, b) => b.timestamp - a.timestamp)

        res.json(chatList)

    } catch (err) {
        res.status(500).json({
            error: err.message
        })
    }
})
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
        io.emit("user_status", { uid, status: "Online" });
    });

    socket.on("typing", (data) => {
        socket.to(data.roomId).emit("typing");
    });

    socket.on("stop_typing", (roomId) => {
        socket.to(roomId).emit("stop_typing");
    });

    socket.on("user_offline", (uid) => {
        const lastSeen = "Last seen " + new Date().toLocaleString();
        userLastSeen[uid] = lastSeen;
        io.emit("user_status", { uid, status: lastSeen });
    });

    socket.on("send_message", async (data) => {
        try {
            const msg = new Message({
                roomId: data.roomId,
                sender: data.sender,
                message: data.message,
                timestamp: Date.now(),
                expiresAt: getExpiryTime(data.expiryOption)
            });

            await msg.save();

            io.to(data.roomId).emit("receive_message", {
                _id: msg._id,
                roomId: msg.roomId,
                sender: msg.sender,
                message: msg.message,
                timestamp: msg.timestamp
            });

            io.to(data.roomId).emit("message_delivered");
        } catch (err) {
            console.log(err);
        }
    });

    socket.on("delete_for_everyone", async (messageId) => {
        await Message.findByIdAndUpdate(messageId, {
            message: "This message was deleted",
            deletedForEveryone: true
        });

        io.emit("message_deleted", messageId);
    });

    socket.on("edit_message", async (data) => {
        await Message.findByIdAndUpdate(data.messageId, {
            message: data.newText,
            edited: true
        });

        io.emit("message_edited", data);
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
