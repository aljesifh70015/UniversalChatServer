const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const admin = require("./firebase");

const app = express();
const server = http.createServer(app);


app.use(cors());
app.use(express.json());

mongoose.connect("mongodb+srv://aljesifhoque_db_user:67UF0MniHFtG98d2@cluster0.k3jzopc.mongodb.net/?appName=Cluster0")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

const User = require("./models/User");
const Message = require("./models/Message");

const onlineUsers = {};
const userLastSeen = {};
const activeChats = {};

function getIndianTime() {
    return new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

async function sendPushNotification(token, title, body) {
    try {
        const message = {
            token: token,
            notification: {
                title: title,
                body: body
            },
            data: {
                click_action: "CHAT_NOTIFICATION",
                senderUid: data.sender || "",
                senderName: title || ""
            }
        }

        await admin.messaging().send(message);
        console.log("Push sent");
    } catch (err) {
        console.log("Push error:", err);
    }
}

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


app.post("/register", async (req, res) => {
    try {
        const { uid, username, email, password, deviceId } = req.body;

        if (!uid || !username || !email || !password || !deviceId) {
            return res.status(400).json({
                message: "Missing required fields"
            });
        }

        let user = await User.findOne({ uid });

        if (!user) {
            user = new User({
                uid,
                username,
                email,
                password,
                verified: true,
                loggedInDevice: deviceId,
                friends: [],
                friendRequests: [],
                lastSeen: ""
            });

            await user.save();

            return res.json({
                message: "registered",
                success: true
            });
        }

        if (user.password !== password) {
            return res.status(401).json({
                message: "Wrong password"
            });
        }

        if (user.loggedInDevice && user.loggedInDevice !== deviceId) {
            return res.status(403).json({
                message: "Account already logged in elsewhere"
            });
        }

        user.loggedInDevice = deviceId;
        await user.save();

        res.json({
            message: "login_success",
            success: true
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/save_fcm_token", async (req, res) => {
    try {
        const { uid, token } = req.body;

        console.log("TOKEN SAVE REQUEST");
        console.log("uid =", uid);
        console.log("token =", token);

        await User.updateOne(
            { uid },
            { $set: { fcmToken: token } }
        );

        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

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

app.get("/search_user/:query", async (req, res) => {
    try {
        const query = req.params.query;

        const user = await User.findOne({
            $or: [
                { uid: query },
                { username: { $regex: new RegExp("^" + query + "$", "i") } }
            ]
        });

        if (!user) {
            return res.status(404).json({
                found: false
            });
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

        res.json({ message: "Accepted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/reject_friend_request", async (req, res) => {
    try {
        const { myUid, friendUid } = req.body;

        const me = await User.findOne({ uid: myUid });

        me.friendRequests = me.friendRequests.filter(
            uid => uid !== friendUid
        );

        await me.save();

        res.json({ message: "Rejected" });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

app.get("/chat_list/:uid", async (req, res) => {
    try {
        const myUid = req.params.uid;
        const user = await User.findOne({ uid: myUid });

        if (!user) {
            return res.json([]);
        }

        const chatList = [];

        for (const friendUid of user.friends) {
            const friend = await User.findOne({ uid: friendUid });

            let roomId =
                myUid < friendUid
                    ? `${myUid}_${friendUid}`
                    : `${friendUid}_${myUid}`;

            const lastMessage = await Message.findOne({ roomId })
                .sort({ timestamp: -1 });

            chatList.push({
                uid: friendUid,
                username: friend?.username || friendUid,
                lastMessage: lastMessage?.message || "No messages yet",
                timestamp: lastMessage?.timestamp || 0
            });
        }

        chatList.sort((a, b) => b.timestamp - a.timestamp);

        res.json(chatList);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

const io = new Server(server, {
    cors: { origin: "*" }
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("open_chat", (data) => {
    activeChats[data.uid] = data.friendUid;
    console.log(data.uid + " opened chat with " + data.friendUid);
});

socket.on("close_chat", (uid) => {
    delete activeChats[uid];
    console.log(uid + " closed chat");
});

    socket.on("join_room", (roomId) => {
        socket.join(roomId);
    });

    socket.on("user_online", (uid) => {
    onlineUsers[uid] = socket.id;
    socket.uid = uid;

    socket.broadcast.emit("user_status", {
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

    socket.on("user_offline", async (uid) => {
        if (!onlineUsers[uid]) return;

        delete onlineUsers[uid];

        const lastSeen = "Last seen " + getIndianTime();
        userLastSeen[uid] = lastSeen;

        await User.updateOne({ uid }, { $set: { lastSeen } });

        io.emit("user_status", {
            uid,
            status: lastSeen
        });
    });

    socket.on("get_user_status", async (uid) => {
    try {
        const user = await User.findOne({ uid });

        if (onlineUsers[uid]) {
            socket.emit("user_status", {
                uid,
                status: "Online"
            });
        } else {
            socket.emit("user_status", {
                uid,
                status: user?.lastSeen || "Last seen unavailable"
            });
        }
    } catch (e) {
        console.log(e);
    }
});
    socket.on("watch_friend", (friendUid) => {
    socket.friendUid = friendUid;
});

    socket.on("send_message", async (data) => {
    try {
        let status = "sent";

        if (data.receiverUid && onlineUsers[data.receiverUid]) {
            status = "delivered";
        }

        const msg = new Message({
            roomId: data.roomId,
            sender: data.sender,
            message: data.message,
            timestamp: Date.now(),
            expiresAt: getExpiryTime(data.expiryOption),
            status: status,
            seen: false,
            deletedFor: [],
            edited: false,
            replyMessage: data.replyMessage || "",
            replySender: data.replySender || ""
        });

        await msg.save();

        console.log("MESSAGE RECEIVED");
        console.log("receiverUid =", data.receiverUid);

        // ===== Push notification send =====
        const receiver = await User.findOne({
            uid: data.receiverUid
        });

        const receiverActiveChat = activeChats[data.receiverUid];

        console.log("receiver =", receiver);
        console.log("token =", receiver?.fcmToken);
        console.log("online =", onlineUsers[data.receiverUid]);
        console.log("active chat =", receiverActiveChat);

       const shouldSendPush =
           receiver &&
           receiver.fcmToken &&
          (
               !onlineUsers[data.receiverUid] ||
               receiverActiveChat !== data.sender
        );

      if (shouldSendPush) {
          console.log("SENDING PUSH...");

          const senderUser = await User.findOne({
              uid: data.sender
          });

          await sendPushNotification(
              receiver.fcmToken,
              senderUser?.username || data.sender,
              data.message
          );
    } else {
        console.log("PUSH BLOCKED (chat already open)");
    }
        io.to(data.roomId).emit("receive_message", {
            _id: msg._id,
            roomId: msg.roomId,
            sender: msg.sender,
            message: msg.message,
            timestamp: msg.timestamp,
            status: msg.status,
            seen: msg.seen,
            replyMessage: msg.replyMessage || "",
            replySender: msg.replySender || ""
        });

    } catch (err) {
        console.log("send_message error:", err);
    }
});
    

    socket.on("message_seen", async (messageId) => {
        try {
            await Message.findByIdAndUpdate(messageId, {
                seen: true,
                status: "seen"
            });

            io.emit("message_seen", messageId);
        } catch (e) {
            console.log(e);
        }
    });

    socket.on("delete_for_everyone", async (messageId) => {
        try {
            await Message.findByIdAndUpdate(messageId, {
                message: "This message was deleted",
                deletedForEveryone: true
            });

            io.emit("message_deleted", messageId);
        } catch (e) {
            console.log(e);
        }
    });

    socket.on("edit_message", async (data) => {
        try {
            await Message.findByIdAndUpdate(data.messageId, {
                message: data.newText,
                edited: true
            });

            io.emit("message_edited", data);
        } catch (e) {
            console.log(e);
        }
    });

    socket.on("disconnect", async () => {
        if (socket.uid && onlineUsers[socket.uid]) {
            delete onlineUsers[socket.uid];

            const lastSeen = "Last seen " + getIndianTime();
            userLastSeen[socket.uid] = lastSeen;

            await User.updateOne(
                { uid: socket.uid },
                { $set: { lastSeen } }
            );

            socket.broadcast.emit("user_status", {
               uid: socket.uid,
               status: lastSeen
            });
        }

        console.log("User disconnected");
    });
});


app.get("/status/:uid", async (req, res) => {
    try {
        const uid = req.params.uid;

        if (onlineUsers[uid]) {
            return res.json({
                status: "Online"
            });
        }

        const user = await User.findOne({ uid });

        if (user && user.lastSeen) {
            return res.json({
                status: user.lastSeen
            });
        }

        res.json({
            status: userLastSeen[uid] || "Offline"
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.post("/logout/:uid", async (req, res) => {
    try {
        const uid = req.params.uid;

        const lastSeen = "Last seen " + getIndianTime();

        delete onlineUsers[uid];
        userLastSeen[uid] = lastSeen;

        await User.updateOne(
            { uid },
            {
                $set: {
                    loggedInDevice: "",
                    lastSeen: lastSeen
                }
            }
        );

        io.emit("user_status", {
            uid,
            status: lastSeen
        });

        res.json({
            message: "logout_success"
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.get("/", (req, res) => {
    res.send("Universal Chat server running");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
