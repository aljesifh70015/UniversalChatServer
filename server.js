const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// ================= DB =================
mongoose.connect("mongodb+srv://aljesifhoque_db_user:67UF0MniHFtG98d2@cluster0.k3jzopc.mongodb.net/?appName=Cluster0")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// ================= MODELS =================
const User = require("./models/User");
const Message = require("./models/Message");

// ================= MEMORY STORE =================
const onlineUsers = {};

// ================= TIME =================
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

function getExpiryTime(option) {
const now = Date.now();
const map = {
"1d": 86400000,
"2d": 86400000 * 2,
"3d": 86400000 * 3,
"1w": 86400000 * 7,
"2w": 86400000 * 14,
"3w": 86400000 * 21,
"1m": 86400000 * 30
};
return now + (map[option] || 86400000);
}

// ================= CLEANUP =================
setInterval(async () => {
try {
await Message.deleteMany({
expiresAt: { $gt: 0, $lte: Date.now() }
});
} catch (e) {
console.log(e);
}
}, 60000);

// ================= ROUTES =================

// REGISTER / LOGIN
app.post("/register", async (req, res) => {
try {
const { uid, username, email, password, deviceId } = req.body;

    if (!uid || !username || !email || !password || !deviceId) {
        return res.status(400).json({ message: "Missing fields" });
    }

    let user = await User.findOne({ uid });

    if (!user) {
        user = new User({
            uid,
            username,
            email,
            password,
            loggedInDevice: deviceId,
            friends: [],
            friendRequests: []
        });

        await user.save();

        return res.json({ success: true, message: "registered" });
    }

    if (user.password !== password) {
        return res.status(401).json({ message: "Wrong password" });
    }

    if (user.loggedInDevice && user.loggedInDevice !== deviceId) {
        return res.status(403).json({ message: "Device blocked" });
    }

    user.loggedInDevice = deviceId;
    await user.save();

    res.json({ success: true, message: "login_success" });

} catch (e) {
    res.status(500).json({ error: e.message });
}

});

// USER INFO
app.get("/user/:uid", async (req, res) => {
const user = await User.findOne({ uid: req.params.uid });
if (!user) return res.status(404).json({ found: false });

res.json({
    found: true,
    uid: user.uid,
    username: user.username
});

});

// SEARCH USER
app.get("/search_user/:query", async (req, res) => {
try {
const query = req.params.query;

    const user = await User.findOne({
        $or: [
            { uid: query },
            { username: { $regex: new RegExp(query, "i") } }
        ]
    });

    if (!user) {
        return res.status(404).json({ found: false });
    }

    res.json({
        found: true,
        uid: user.uid,
        username: user.username
    });

} catch (e) {
    res.status(500).json({ error: e.message });
}

});

// FRIEND REQUEST
app.post("/send_friend_request", async (req, res) => {
const { myUid, friendUid } = req.body;

const me = await User.findOne({ uid: myUid });
const friend = await User.findOne({ uid: friendUid });

if (!me || !friend) return res.status(404).json({ message: "User not found" });

if (friend.friendRequests.includes(myUid)) {
    return res.json({ message: "Already sent" });
}

friend.friendRequests.push(myUid);
await friend.save();

res.json({ message: "Request Sent" });

});

// FRIEND REQUEST LIST
app.get("/friend_requests/:uid", async (req, res) => {
const user = await User.findOne({ uid: req.params.uid });
res.json(user?.friendRequests || []);
});

// ACCEPT FRIEND
app.post("/accept_friend_request", async (req, res) => {
const { myUid, friendUid } = req.body;

const me = await User.findOne({ uid: myUid });
const friend = await User.findOne({ uid: friendUid });

me.friendRequests = me.friendRequests.filter(u => u !== friendUid);

if (!me.friends.includes(friendUid)) me.friends.push(friendUid);
if (!friend.friends.includes(myUid)) friend.friends.push(myUid);

await me.save();
await friend.save();

res.json({ message: "Accepted" });

});

// REJECT FRIEND
app.post("/reject_friend_request", async (req, res) => {
const { myUid, friendUid } = req.body;

const me = await User.findOne({ uid: myUid });

me.friendRequests = me.friendRequests.filter(u => u !== friendUid);
await me.save();

res.json({ message: "Rejected" });

});

// FRIENDS
app.get("/friends/:uid", async (req, res) => {
const user = await User.findOne({ uid: req.params.uid });
res.json(user?.friends || []);
});

// CHAT LIST
app.get("/chat_list/:uid", async (req, res) => {
const user = await User.findOne({ uid: req.params.uid });
if (!user) return res.json([]);

const list = [];

for (const f of user.friends) {
    const friend = await User.findOne({ uid: f });

    const roomId = req.params.uid < f ? `${req.params.uid}_${f}` : `${f}_${req.params.uid}`;

    const last = await Message.findOne({ roomId }).sort({ timestamp: -1 });

    list.push({
        uid: f,
        username: friend?.username || f,
        lastMessage: last?.message || "",
        timestamp: last?.timestamp || 0
    });
}

list.sort((a, b) => b.timestamp - a.timestamp);

res.json(list);

});

// MESSAGES
app.get("/messages/:roomId", async (req, res) => {
const uid = req.query.uid;

const messages = await Message.find({
    roomId: req.params.roomId,
    deletedFor: { $ne: uid }
}).sort({ timestamp: 1 });

res.json(messages);

});

// DELETE FOR ME
app.post("/delete_for_me", async (req, res) => {
await Message.findByIdAndUpdate(req.body.messageId, {
$addToSet: { deletedFor: req.body.uid }
});

res.json({ success: true });

});

// EDIT MESSAGE
app.post("/edit_message", async (req, res) => {
await Message.findByIdAndUpdate(req.body.messageId, {
message: req.body.newText,
edited: true
});

res.json({ success: true });

});

// STATUS
app.get("/status/:uid", async (req, res) => {
const uid = req.params.uid;

if (onlineUsers[uid]) {
    return res.json({ status: "Online" });
}

const user = await User.findOne({ uid });

res.json({
    status: user?.lastSeen || "Offline"
});

});

// ================= SOCKET =================
const io = new Server(server, {
cors: { origin: "*" }
});

io.on("connection", (socket) => {

socket.on("user_online", async (uid) => {
    onlineUsers[uid] = socket.id;
    socket.uid = uid;

    await User.updateOne({ uid }, { lastSeen: "Online" });

    io.emit("user_status", { uid, status: "Online" });
});

socket.on("user_offline", async (uid) => {
    delete onlineUsers[uid];

    const lastSeen = "Last seen " + getIndianTime();

    await User.updateOne({ uid }, { lastSeen });

    io.emit("user_status", { uid, status: lastSeen });
});

socket.on("send_message", async (data) => {
    const msg = new Message({
        roomId: data.roomId,
        sender: data.sender,
        receiver: data.receiver,
        message: data.message,
        timestamp: Date.now(),
        expiresAt: getExpiryTime(data.expiryOption),
        status: onlineUsers[data.receiver] ? "delivered" : "sent"
    });

    await msg.save();

    io.to(data.roomId).emit("receive_message", msg);
});

socket.on("message_seen", (roomId) => {
    io.to(roomId).emit("message_seen");
});

socket.on("disconnect", async () => {
    if (socket.uid) {
        delete onlineUsers[socket.uid];

        const lastSeen = "Last seen " + getIndianTime();

        await User.updateOne(
            { uid: socket.uid },
            { lastSeen }
        );

        io.emit("user_status", {
            uid: socket.uid,
            status: lastSeen
        });
    }
});

});

// ================= START =================
app.get("/", (req, res) => {
res.send("Universal Chat Server Running");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
console.log("Server running on port " + PORT);
});
