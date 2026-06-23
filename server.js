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

// STATUS MEMORY
const onlineUsers = {};
const userLastSeen = {};

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

    switch (option) {
        case "1d": return now + 86400000;
        case "2d": return now + 86400000 * 2;
        case "3d": return now + 86400000 * 3;
        case "1w": return now + 86400000 * 7;
        case "2w": return now + 86400000 * 14;
        case "1m": return now + 86400000 * 30;
        default: return 0;
    }
}

// AUTO DELETE EXPIRED MESSAGES
setInterval(async () => {
    await Message.deleteMany({
        expiresAt: { $gt: 0, $lte: Date.now() }
    });
}, 60000);

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

            return res.json({ message: "registered", success: true });
        }

        if (user.password !== password) {
            return res.status(401).json({ message: "Wrong password" });
        }

        if (user.loggedInDevice && user.loggedInDevice !== deviceId) {
            return res.status(403).json({ message: "Already logged in" });
        }

        user.loggedInDevice = deviceId;
        await user.save();

        res.json({ message: "login_success", success: true });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.get("/status/:uid", (req, res) => {
    const uid = req.params.uid;

    if (onlineUsers[uid]) {
        return res.json({
            status: "Online"
        });
    }

    return res.json({
        status: userLastSeen[uid] || ""
    });
});

app.get("/friends/:uid", async (req, res) => {
    const user = await User.findOne({ uid: req.params.uid });
    res.json(user?.friends || []);
});

app.get("/friend_requests/:uid", async (req, res) => {
    const user = await User.findOne({ uid: req.params.uid });
    res.json(user?.friendRequests || []);
});

app.get("/messages/:roomId", async (req, res) => {
    try {
        const uid = req.query.uid;

        const messages = await Message.find({
            roomId: req.params.roomId,
            deletedFor: { $ne: uid }
        }).sort({ timestamp: 1 });

        res.json(messages);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const io = new Server(server, {
    cors: { origin: "*" }
});

io.on("connection", (socket) => {

    socket.on("join_room", (roomId) => {
        socket.join(roomId);
    });

    socket.on("user_online", (uid) => {
        onlineUsers[uid] = socket.id;
        socket.uid = uid;

        io.emit("user_status", {
            uid,
            status: "Online"
        });
    });

    socket.on("user_offline", (uid) => {
        delete onlineUsers[uid];

        userLastSeen[uid] = "Last seen " + getIndianTime();

        io.emit("user_status", {
            uid,
            status: userLastSeen[uid]
        });
    });

    socket.on("disconnect", () => {
        if (socket.uid) {
            delete onlineUsers[socket.uid];

            userLastSeen[socket.uid] =
                "Last seen " + getIndianTime();

            io.emit("user_status", {
                uid: socket.uid,
                status: userLastSeen[socket.uid]
            });
        }
    });
});


app.get("/", (req, res) => {
    res.send("Universal Chat Server Running");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on " + PORT);
});
