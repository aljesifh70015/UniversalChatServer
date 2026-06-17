const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.get("/", (req, res) => {
    res.send("Universal Chat Server Running");
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Send message
    socket.on("send_message", (data) => {
        console.log("Message:", data);
        io.emit("receive_message", data);
    });

    // Typing
    socket.on("typing", () => {
        socket.broadcast.emit("typing");
    });

    // Stop typing
    socket.on("stop_typing", () => {
        socket.broadcast.emit("stop_typing");
    });

    // Seen
    socket.on("seen", () => {
        socket.broadcast.emit("seen");
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
