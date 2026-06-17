const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { MongoClient } = require("mongodb");

const app = express();
const server = http.createServer(app);

app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ================= MONGO =================

const uri = "mongodb+srv://aljesifhoque_db_user:<67UF0MniHFtG98d2>@cluster0.k3jzopc.mongodb.net/?appName=Cluster0"
const client = new MongoClient(uri);

let usersCollection;

async function connectDB() {
    try {
        await client.connect();
        const db = client.db("universal_chat");
        usersCollection = db.collection("users");
        console.log("MongoDB Connected");
    } catch (err) {
        console.log("Mongo Error:", err);
    }
}

connectDB();

// ================= API =================

// Register user
app.post("/register", async (req, res) => {
    const { uid, username } = req.body;

    const exists = await usersCollection.findOne({ uid });

    if (exists) {
        return res.json({ status: "exists" });
    }

    await usersCollection.insertOne({
        uid,
        username,
        friends: []
    });

    res.json({ status: "ok" });
});

// Add friend
app.post("/add_friend", async (req, res) => {
    const { myUid, friendUid } = req.body;

    await usersCollection.updateOne(
        { uid: myUid },
        { $addToSet: { friends: friendUid } }
    );

    res.json({ status: "friend added" });
});

// Get friends
app.get("/friends/:uid", async (req, res) => {
    const user = await usersCollection.findOne({ uid: req.params.uid });

    if (!user) return res.json([]);

    res.json(user.friends);
});

// ================= SOCKET =================

io.on("connection", (socket) => {

    socket.on("join_room", (roomId) => {
        socket.join(roomId);
    });

    socket.on("send_message", (data) => {
        socket.to(data.room).emit("receive_message", data);
    });

    socket.on("typing", (roomId) => {
        socket.to(roomId).emit("typing");
    });

    socket.on("stop_typing", (roomId) => {
        socket.to(roomId).emit("stop_typing");
    });

    socket.on("seen", (roomId) => {
        socket.to(roomId).emit("seen");
    });

});

app.get("/", (req, res) => {
    res.send("Universal Chat Server Running");
});

server.listen(process.env.PORT || 3000, () => {
    console.log("Server running...");
});
