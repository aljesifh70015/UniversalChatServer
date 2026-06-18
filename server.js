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

// Models
const Message = require("./models/Message");

// Socket setup
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

io.on("connection", (socket) => {

    console.log("User connected:", socket.id);

    // join room
    socket.on("join_room", (roomId) => {
        socket.join(roomId);
    });

    // send message
    socket.on("send_message", async (data) => {

        // save to MongoDB
        const msg = new Message({
            roomId: data.roomId,
            sender: data.sender,
            message: data.message,
            timestamp: Date.now()
        });

        await msg.save();

        // broadcast
        io.to(data.roomId).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});

// test route
app.get("/", (req, res) => {
    res.send("Chat server running");
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
