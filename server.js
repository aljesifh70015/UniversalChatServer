const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// 🔥 MongoDB CONNECT
mongoose.connect("mongodb+srv://aljesifhoque_db_user:<67UF0MniHFtG98d2>@cluster0.k3jzopc.mongodb.net/?appName=Cluster0")
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log(err));

// 🔥 SOCKET
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

io.on("connection", (socket) => {

    console.log("User connected:", socket.id);

    // JOIN ROOM
    socket.on("join_room", (roomId) => {
        socket.join(roomId);
    });

    // SEND MESSAGE
    socket.on("send_message", (data) => {
        io.to(data.roomId).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});

// 🔥 ROUTES
app.get("/", (req, res) => {
    res.send("Server Running");
});

server.listen(3000, () => {
    console.log("Server started on port 3000");
});
